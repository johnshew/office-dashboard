import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
import { CacheLookupPolicy } from '@azure/msal-browser';

globalThis.window = { location: { href: 'http://localhost:8000/office-dashboard/', hostname: 'localhost' } };
globalThis.localStorage = { removeItem() {} };
const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    define: {
        'import.meta.env.VITE_CLIENT_ID': JSON.stringify(''),
        'import.meta.env.VITE_TENANT_ID': JSON.stringify('organizations'),
        'import.meta.env.VITE_DEVICE_LOGIN_URL': JSON.stringify('http://localhost:8001')
    }
});
const { default: Identity } = await server.ssrLoadModule('/samples/tesla/Identity.ts');
const { ShortTimeString } = await server.ssrLoadModule('/src/Utilities.ts');
after(() => server.close());

test('mail dates use calendar months, Sunday, and twelve-hour noon and midnight', t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 8, 14, 15).getTime() });
    assert.equal(ShortTimeString(new Date(2026, 8, 13, 8).toISOString()), 'Sun, 9/13');
    assert.equal(ShortTimeString(new Date(2026, 8, 11, 8).toISOString()), 'Fri, 9/11');
    assert.equal(ShortTimeString(new Date(2026, 8, 14, 12, 5).toISOString()), '12:05 PM');
    assert.equal(ShortTimeString(new Date(2026, 8, 14, 0, 5).toISOString()), '12:05 AM');
    assert.match(ShortTimeString(new Date(2025, 8, 11, 8).toISOString()), /2025/);
    assert.equal(ShortTimeString('invalid'), '');
});

function browserIdentity() {
    const identity = new Identity();
    identity.client = {
        getActiveAccount: () => ({ homeAccountId: 'test-account' }),
        acquireTokenSilent: async request => {
            assert.deepEqual(request.scopes, ['User.Read', 'Mail.Read', 'Calendars.Read']);
            assert.equal(request.cacheLookupPolicy, CacheLookupPolicy.AccessTokenAndRefreshToken);
            return { accessToken: 'test-access-token' };
        }
    };
    return identity;
}

test('explicit browser login requests account selection after cancelling device login', async t => {
    const identity = browserIdentity();
    identity.sessionToken = 'test-device-session';
    identity.deviceAuthenticated = true;
    const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'http://localhost:8001/api/device/logout');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers.Authorization, 'Bearer test-device-session');
        return Response.json({ status: 'ok' });
    });
    const requests = [];
    identity.client.loginRedirect = async request => {
        assert.equal(identity.sessionToken, undefined);
        assert.equal(identity.deviceAuthenticated, false);
        assert.equal(fetch.mock.callCount(), 1);
        requests.push(request);
    };
    await identity.login();
    assert.deepEqual(requests, [{
        scopes: ['User.Read', 'Mail.Read', 'Calendars.Read'],
        prompt: 'select_account'
    }]);
});

test('device-only initialization removes the legacy token cache', async t => {
    const removed = [];
    t.mock.method(localStorage, 'removeItem', key => removed.push(key));
    const identity = new Identity();
    await identity.initialize();
    assert.equal(identity.ready, true);
    assert.deepEqual(removed, ['kurve-identity-token-store']);
});

test('Graph calls use delegated tokens and never cookies or redirects', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url.href, 'https://graph.microsoft.com/v1.0/me');
        assert.equal(options.headers.Authorization, 'Bearer ' + 'test-access-token');
        assert.equal(options.credentials, 'omit');
        assert.equal(options.redirect, 'error');
        assert.equal(options.cache, 'no-store');
        assert.equal(options.headers.Prefer, 'outlook.timezone="UTC"');
        return Response.json({ displayName: 'Test user' });
    });
    assert.deepEqual(await browserIdentity().get('/me'), { displayName: 'Test user' });
});

test('untrusted pagination URLs cannot receive a token', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected fetch'); });
    const credentialUrl = new URL('https://graph.microsoft.com/v1.0/me');
    credentialUrl.username = 'test';
    for (const path of ['https://example.com/v1.0/me', 'https://graph.microsoft.com.example.com/v1.0/me',
        credentialUrl.href, 'https://graph.microsoft.com/beta/me']) {
        await assert.rejects(browserIdentity().get(path), /untrusted/);
    }
    assert.equal(fetch.mock.callCount(), 0);
});

test('pagination follows Graph nextLink but caps results at 40', async t => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
        calls++;
        return Response.json({
            value: Array.from({ length: 25 }, (_, id) => ({ id: `${calls}-${id}` })),
            '@odata.nextLink': `https://graph.microsoft.com/v1.0/me/messages?$skip=${calls * 25}`
        });
    });
    const result = await browserIdentity().collection('/me/messages');
    assert.equal(result.length, 40);
    assert.equal(calls, 2);
});

test('repeated empty nextLink is bounded', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({
        value: [], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages'
    }));
    assert.deepEqual(await browserIdentity().collection('/me/messages'), []);
    assert.equal(fetch.mock.callCount(), 2);
});

test('Graph failures do not expose upstream bodies', async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response('private upstream detail', { status: 403 }));
    await assert.rejects(browserIdentity().get('/me'), error =>
        error.message.includes('403') && !error.message.includes('private'));
});

test('device login QR information excludes the session credential and logout clears it', async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push({ url, options });
        if (options.method === 'POST') {
            assert.equal(options.headers['Content-Type'], 'application/json');
            assert.equal(options.body, '{}');
        }
        if (url.endsWith('/start')) return Response.json({
            sessionToken: 'test-session-credential', userCode: 'ABCD-EFGH',
            verificationUri: 'https://microsoft.com/devicelogin', expiresAt: Date.now() + 60000, interval: 1
        });
        if (url.endsWith('/status')) return Response.json({ status: 'complete' });
        return Response.json({ status: 'ok' });
    });
    const identity = new Identity();
    const code = await identity.startDeviceLogin();
    assert.equal(code.verificationUri, 'https://microsoft.com/devicelogin');
    assert.equal(code.interval, 5);
    assert.equal(code.sessionToken, undefined);
    assert.equal(identity.isLoggedIn(), false);
    assert.equal(await identity.checkDeviceLogin(), 'complete');
    assert.equal(identity.isLoggedIn(), true);
    await identity.logout();
    assert.equal(identity.isLoggedIn(), false);
    assert.equal(identity.sessionToken, undefined);
    assert.equal(calls[1].options.headers.Authorization, 'Bearer ' + 'test-session-credential');
    assert.equal(calls[2].options.headers.Authorization, 'Bearer ' + 'test-session-credential');
    for (const { url, options } of calls) {
        assert.equal(url.includes('test-session-credential'), false);
        assert.equal(options.credentials, 'omit');
    }
});

test('device login rejects a phishing verification URL and cancels the session', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async url => url.endsWith('/start')
        ? Response.json({ sessionToken: 'test-session', verificationUri: 'https://example.com/phishing' })
        : Response.json({ status: 'ok' }));
    const identity = new Identity();
    await assert.rejects(identity.startDeviceLogin(), /unexpected verification/);
    assert.equal(identity.sessionToken, undefined);
    assert.equal(fetch.mock.callCount(), 2);
});

test('logout during polling cannot reactivate the device session', async t => {
    let resolve;
    t.mock.method(globalThis, 'fetch', url => url.endsWith('/status')
        ? new Promise(done => { resolve = done; }) : Promise.resolve(Response.json({ status: 'ok' })));
    const identity = new Identity();
    identity.sessionToken = 'test-session';
    const poll = identity.checkDeviceLogin();
    await identity.cancelDeviceLogin();
    resolve(Response.json({ status: 'complete' }));
    assert.equal(await poll, 'cancelled');
    assert.equal(identity.isLoggedIn(), false);
});

test('late unauthorized response does not invalidate a replacement session', async t => {
    let resolve;
    t.mock.method(globalThis, 'fetch', url => url.endsWith('/status')
        ? new Promise(done => { resolve = done; }) : Promise.resolve(Response.json({ status: 'ok' })));
    const identity = new Identity();
    identity.sessionToken = 'old-session';
    const poll = identity.checkDeviceLogin();
    await identity.cancelDeviceLogin();
    identity.sessionToken = 'new-session';
    identity.deviceAuthenticated = true;
    resolve(new Response(null, { status: 401 }));
    await assert.rejects(poll, /sign-in/);
    assert.equal(identity.isLoggedIn(), true);
});

test('cancelling while a device code is being issued releases the late session', async t => {
    let resolve;
    const logoutTokens = [];
    t.mock.method(globalThis, 'fetch', (url, options) => {
        if (url.endsWith('/start')) return new Promise(done => { resolve = done; });
        logoutTokens.push(options.headers.Authorization);
        return Promise.resolve(Response.json({ status: 'ok' }));
    });
    const identity = new Identity();
    const start = identity.startDeviceLogin();
    await new Promise(resolve => setImmediate(resolve));
    await identity.cancelDeviceLogin();
    resolve(Response.json({ sessionToken: 'late-session' }));
    await assert.rejects(start, /cancelled/);
    assert.equal(identity.sessionToken, undefined);
    assert.deepEqual(logoutTokens, ['Bearer ' + 'late-session']);
});
