import { CacheLookupPolicy, InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser';
import { fetchWithTimeout } from '../../src/Fetch';
import { consumeEmailHint } from './EmailHint';

const scopes = ['User.Read', 'Mail.Read', 'Calendars.Read'];
const graphRoot = 'https://graph.microsoft.com/v1.0';
const clientId = import.meta.env.VITE_CLIENT_ID || '';
const tenant = import.meta.env.VITE_TENANT_ID || 'organizations';
const deviceService = (import.meta.env.VITE_DEVICE_LOGIN_URL || '').replace(/\/$/, '');
const phoneService = (import.meta.env.VITE_PHONE_LINK_URL || '').replace(/\/$/, '');
const redirectUri = new URL('./', window.location.href).href;

export interface DeviceCode {
    userCode: string;
    verificationUri: string;
    expiresAt: number;
    interval: number;
}

export interface PhoneLink {
    phoneUrl: string;
    label: string;
    expiresAt: number;
    interval: number;
}

export default class Identity {
    private client: PublicClientApplication;
    private sessionToken: string;
    private deviceAuthenticated = false;
    private deviceAttempt = 0;
    private phoneSessionId: string;
    private phoneToken: string;
    private phoneAuthenticated = false;
    private phoneAttempt = 0;
    private emailHint: string;
    public ready = false;
    public readonly deviceEnabled = !!deviceService;
    public readonly phoneEnabled = !!phoneService;
    public readonly browserEnabled = !!clientId;

    public async initialize() {
        this.emailHint = consumeEmailHint();
        // Do not migrate tokens from the retired implicit-flow implementation.
        try { localStorage.removeItem('kurve-identity-token-store'); } catch { }
        for (const service of [deviceService, phoneService].filter(Boolean)) {
            const url = new URL(service);
            if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'
                && window.location.hostname === 'localhost')) || url.username || url.password || url.search || url.hash) {
                throw new Error('Sign-in services must use HTTPS (HTTP localhost is allowed only during local development).');
            }
            if (service === phoneService && url.pathname !== '/') throw new Error('Phone Link must use an exact service origin without a path.');
        }
        if (!clientId) {
            if (this.deviceEnabled || this.phoneEnabled) { this.ready = true; return; }
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
        this.ready = true;
        const result = await this.client.handleRedirectPromise();
        if (result?.account) this.client.setActiveAccount(result.account);
        else if (!this.client.getActiveAccount() && this.client.getAllAccounts().length === 1) {
            this.client.setActiveAccount(this.client.getAllAccounts()[0]);
        }
    }

    public isLoggedIn() {
        return this.phoneAuthenticated || this.deviceAuthenticated || !!this.client?.getActiveAccount();
    }

    public async login() {
        if (!this.client) throw new Error('Browser sign-in requires VITE_CLIENT_ID.');
        await Promise.all([this.cancelPhoneLink(), this.cancelDeviceLogin()]);
        const loginHint = this.emailHint;
        this.emailHint = undefined;
        await this.client.loginRedirect({ scopes, prompt: 'select_account', ...(loginHint ? { loginHint } : {}) });
    }

    public async logout() {
        await Promise.all([this.cancelPhoneLink(), this.cancelDeviceLogin()]);
        if (this.client?.getActiveAccount()) {
            await this.client.logoutRedirect({ account: this.client.getActiveAccount() });
        }
    }

    private async serviceRequest(service: string, path: string, method: string, token?: string, body = {}) {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = 'Bearer ' + token;
        if (method === 'POST') headers['Content-Type'] = 'application/json';
        return fetchWithTimeout(`${service}${path}`, {
            method,
            headers,
            body: method === 'POST' ? JSON.stringify(body) : undefined,
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error'
        }, 35000, async response => {
            if (!response.ok) {
                if (response.status === 401 && token === this.sessionToken) this.deviceAuthenticated = false;
                if (response.status === 401 && token === this.phoneToken) this.phoneAuthenticated = false;
                throw new Error(response.status === 429
                    ? 'Too many sign-in requests. Wait a minute and try again.'
                    : response.status === 409 ? 'Session renewal in progress. Please retry shortly.'
                    : service === deviceService ? 'Device sign-in or data access failed. Please sign in again.'
                    : 'Phone Link sign-in or data access failed. Please sign in again.');
            }
            return response.json();
        });
    }

    private deviceRequest(path: string, method = 'GET', token = this.sessionToken) {
        return this.serviceRequest(deviceService, path, method, token);
    }

    public async startPhoneLink(): Promise<PhoneLink> {
        const phoneCancellation = this.cancelPhoneLink();
        const attempt = this.phoneAttempt;
        await Promise.all([phoneCancellation, this.cancelDeviceLogin()]);
        if (attempt !== this.phoneAttempt) throw new Error('Phone Link cancelled.');
        const emailHint = this.emailHint;
        this.emailHint = undefined;
        const result = await this.serviceRequest(phoneService, '/sessions', 'POST', undefined,
            emailHint ? { emailHint } : {});
        const cancel = () => this.serviceRequest(phoneService, `/sessions/${result.sessionId}/cancel`, 'POST', result.teslaToken);
        const pattern = /^[A-Za-z0-9_-]{43}$/;
        if (!pattern.test(result.sessionId || '') || !pattern.test(result.teslaToken || '')) throw new Error('Invalid Phone Link response.');
        if (attempt !== this.phoneAttempt) {
            try { await cancel(); } catch { /* Local cancellation always wins; the server has a bounded expiry. */ }
            throw new Error('Phone Link cancelled.');
        }
        this.phoneSessionId = result.sessionId;
        this.phoneToken = result.teslaToken;
        let url: URL;
        try { url = new URL(result.phoneUrl); }
        catch { await this.cancelPhoneLink(); throw new Error('Invalid Phone Link pairing address.'); }
        const service = new URL(phoneService);
        const fragment = new URLSearchParams(url.hash.slice(1));
        if (url.origin !== service.origin || url.pathname !== '/phone' || url.username || url.password || url.search ||
            fragment.get('session') !== result.sessionId || !pattern.test(fragment.get('phone') || '') || fragment.get('phone') === result.teslaToken ||
            Array.from(fragment.keys()).sort().join(',') !== 'phone,session' ||
            typeof result.label !== 'string' || !/^Phone Link [A-F0-9]{8}$/.test(result.label) ||
            !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now() || result.expiresAt > Date.now() + 600000) {
            await this.cancelPhoneLink();
            throw new Error('Invalid Phone Link pairing address.');
        }
        // Do not resurrect a different cached browser account after changing modes.
        if (this.client?.getActiveAccount()) {
            await this.client.clearCache();
            this.client.setActiveAccount(null);
        }
        if (attempt !== this.phoneAttempt) throw new Error('Phone Link cancelled.');
        return { phoneUrl: result.phoneUrl, label: result.label, expiresAt: result.expiresAt, interval: 2 };
    }

    public async checkPhoneLink() {
        const token = this.phoneToken;
        const id = this.phoneSessionId;
        if (!token || !id) return 'cancelled';
        const result = await this.serviceRequest(phoneService, `/sessions/${id}/poll`, 'GET', token);
        if (token !== this.phoneToken || id !== this.phoneSessionId) return 'cancelled';
        if (result.status === 'complete') this.phoneAuthenticated = true;
        return result.status;
    }

    public async cancelPhoneLink() {
        this.phoneAttempt++;
        const token = this.phoneToken, id = this.phoneSessionId;
        this.phoneToken = undefined;
        this.phoneSessionId = undefined;
        this.phoneAuthenticated = false;
        if (token && id) {
            try { await this.serviceRequest(phoneService, `/sessions/${id}/cancel`, 'POST', token); }
            catch { /* Clear local credentials even if offline; server expiry remains enforced. */ }
        }
    }

    public async startDeviceLogin(): Promise<DeviceCode> {
        const deviceCancellation = this.cancelDeviceLogin();
        const attempt = this.deviceAttempt;
        await Promise.all([deviceCancellation, this.cancelPhoneLink()]);
        if (attempt !== this.deviceAttempt) throw new Error('Device login cancelled.');
        const result = await this.deviceRequest('/api/device/start', 'POST');
        if (attempt !== this.deviceAttempt) {
            try { await this.deviceRequest('/api/device/logout', 'POST', result.sessionToken); } catch { }
            throw new Error('Device login cancelled.');
        }
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
        this.deviceAttempt++;
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
        if (this.phoneAuthenticated) {
            return this.serviceRequest(phoneService, `/sessions/${this.phoneSessionId}/graph?path=${encodeURIComponent(relativePath)}`, 'GET', this.phoneToken);
        }
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
        return fetchWithTimeout(url, {
            headers: { Authorization: 'Bearer ' + accessToken, Prefer: 'outlook.timezone="UTC"' },
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error'
        }, 30000, async response => {
            if (!response.ok) throw new Error(`Microsoft Graph request failed (${response.status}). Please retry or sign in again.`);
            return response.json();
        });
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
