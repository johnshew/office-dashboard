import { CacheLookupPolicy, InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser';

const scopes = ['User.Read', 'Mail.Read', 'Calendars.Read'];
const graphRoot = 'https://graph.microsoft.com/v1.0';
const clientId = import.meta.env.VITE_CLIENT_ID || '';
const tenant = import.meta.env.VITE_TENANT_ID || 'organizations';
const deviceService = (import.meta.env.VITE_DEVICE_LOGIN_URL || '').replace(/\/$/, '');
const redirectUri = new URL('./', window.location.href).href;

export interface DeviceCode {
    userCode: string;
    verificationUri: string;
    expiresAt: number;
    interval: number;
}

export default class Identity {
    private client: PublicClientApplication;
    private sessionToken: string;
    private deviceAuthenticated = false;
    public readonly deviceEnabled = !!deviceService;

    public async initialize() {
        // Do not migrate tokens from the retired implicit-flow implementation.
        try { localStorage.removeItem('kurve-identity-token-store'); } catch { }
        if (deviceService) {
            const url = new URL(deviceService);
            if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'
                && window.location.hostname === 'localhost')) || url.username || url.password || url.search || url.hash) {
                throw new Error('The device service must use HTTPS (HTTP localhost is allowed only during local development).');
            }
        }
        if (!clientId) {
            if (this.deviceEnabled) return;
            throw new Error('Sign-in is not configured. Set VITE_CLIENT_ID and rebuild the application.');
        }
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuid.test(clientId) || (!uuid.test(tenant) && !['organizations', 'common', 'consumers'].includes(tenant))) {
            throw new Error('Invalid Microsoft application or tenant configuration.');
        }
        this.client = new PublicClientApplication({
            auth: {
                clientId,
                authority: `https://login.microsoftonline.com/${tenant}`,
                redirectUri,
                postLogoutRedirectUri: redirectUri
            },
            cache: { cacheLocation: 'sessionStorage' }
        });
        await this.client.initialize();
        const result = await this.client.handleRedirectPromise();
        if (result?.account) this.client.setActiveAccount(result.account);
        else if (!this.client.getActiveAccount() && this.client.getAllAccounts().length === 1) {
            this.client.setActiveAccount(this.client.getAllAccounts()[0]);
        }
    }

    public isLoggedIn() {
        return this.deviceAuthenticated || !!this.client?.getActiveAccount();
    }

    public async login() {
        if (!this.client) throw new Error('Browser sign-in requires VITE_CLIENT_ID.');
        await this.cancelDeviceLogin();
        await this.client.loginRedirect({ scopes });
    }

    public async logout() {
        await this.cancelDeviceLogin();
        if (this.client?.getActiveAccount()) {
            await this.client.logoutRedirect({ account: this.client.getActiveAccount() });
        }
    }

    private async deviceRequest(path: string, method = 'GET', token = this.sessionToken) {
        const response = await fetch(`${deviceService}${path}`, {
            method,
            headers: token ? { Authorization: 'Bearer ' + token } : {},
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(35000)
        });
        if (!response.ok) {
            if (response.status === 401) this.deviceAuthenticated = false;
            throw new Error(response.status === 429
                ? 'Too many sign-in requests. Wait a minute and try again.'
                : 'Device sign-in or data access failed. Please sign in again.');
        }
        return response.json();
    }

    public async startDeviceLogin(): Promise<DeviceCode> {
        await this.cancelDeviceLogin();
        const result = await this.deviceRequest('/api/device/start', 'POST');
        this.sessionToken = result.sessionToken;
        // Only encode Microsoft's documented verification URL, never a token or an invented prefill URL.
        if (result.verificationUri !== 'https://microsoft.com/devicelogin'
            && result.verificationUri !== 'https://www.microsoft.com/devicelogin') {
            await this.cancelDeviceLogin();
            throw new Error('The device service returned an unexpected verification address.');
        }
        return {
            userCode: result.userCode,
            verificationUri: result.verificationUri,
            expiresAt: result.expiresAt,
            interval: Math.max(5, result.interval || 5)
        };
    }

    public async checkDeviceLogin() {
        const token = this.sessionToken;
        const result = await this.deviceRequest('/api/device/status');
        if (token !== this.sessionToken) return 'cancelled';
        if (result.status === 'complete') this.deviceAuthenticated = true;
        return result.status;
    }

    public async cancelDeviceLogin() {
        const token = this.sessionToken;
        this.sessionToken = undefined;
        this.deviceAuthenticated = false;
        if (token) {
            try { await this.deviceRequest('/api/device/logout', 'POST', token); } catch { }
        }
    }

    public async get<T>(path: string): Promise<T> {
        const url = path.startsWith('/') ? new URL(graphRoot + path) : new URL(path);
        if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith('/v1.0/')
            || url.username || url.password || url.hash) {
            throw new Error('Refusing an untrusted Microsoft Graph URL.');
        }
        const relativePath = url.pathname.slice('/v1.0'.length) + url.search;
        if (this.deviceAuthenticated) {
            return this.deviceRequest(`/api/graph?path=${encodeURIComponent(relativePath)}`);
        }
        if (!this.client?.getActiveAccount()) throw new Error('Please sign in to access your information.');
        let accessToken: string;
        try {
            const result = await this.client.acquireTokenSilent({
                scopes, account: this.client.getActiveAccount(),
                // Renew with the refresh token; an expired SPA session requires a top-level login.
                cacheLookupPolicy: CacheLookupPolicy.AccessTokenAndRefreshToken
            });
            accessToken = result.accessToken;
        } catch (error) {
            if (error instanceof InteractionRequiredAuthError) {
                throw new Error('Your session needs attention. Select Login to continue.');
            }
            throw new Error('Unable to renew your session. Please sign in again.');
        }
        const response = await fetch(url, {
            headers: { Authorization: 'Bearer ' + accessToken, Prefer: 'outlook.timezone="UTC"' },
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(30000)
        });
        if (!response.ok) throw new Error(`Microsoft Graph request failed (${response.status}). Please retry or sign in again.`);
        return response.json();
    }

    public async collection<T>(path: string): Promise<T[]> {
        const items: T[] = [];
        const visited = new Set<string>();
        while (path && items.length < 40 && visited.size < 10) {
            if (visited.has(path)) break;
            visited.add(path);
            const page = await this.get<{ value: T[]; '@odata.nextLink'?: string }>(path);
            items.push(...page.value.slice(0, 40 - items.length));
            path = page['@odata.nextLink'];
        }
        return items;
    }
}
