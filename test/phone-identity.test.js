import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

globalThis.window = { location: { href: 'https://dashboard.example/', hostname: 'dashboard.example' } };
globalThis.localStorage = { removeItem() {} };
const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false },
    define: {
        'import.meta.env.VITE_CLIENT_ID': JSON.stringify(''),
        'import.meta.env.VITE_DEVICE_LOGIN_URL': JSON.stringify('https://device.example'),
        'import.meta.env.VITE_PHONE_LINK_URL': JSON.stringify('https://phone.example'),
    },
});
const { default: Identity } = await server.ssrLoadModule('/samples/tesla/Identity.ts');
const { consumeEmailHint } = await server.ssrLoadModule('/samples/tesla/EmailHint.ts');
const { fetchWithTimeout } = await server.ssrLoadModule('/src/Fetch.ts');
after(() => server.close());
const id = 'a'.repeat(43), token = 'b'.repeat(43), phone = 'c'.repeat(43);
const pairing = () => ({ sessionId: id, teslaToken: token, label: 'Phone Link ABCD1234',
    phoneUrl: `https://phone.example/phone#session=${id}&phone=${phone}`, expiresAt: Date.now() + 60000, interval: 2 });
function location(fragment = '') {
    window.location.href = 'https://dashboard.example/' + fragment;
    window.history = { replaceState(state, title, url) { window.location.href = url; } };
}

test('phone-only sign-in is independently configured, memory-only, and uses Chromium88-compatible timeouts', async t => {
    location();
    const calls = [];
    t.mock.method(AbortSignal, 'timeout', () => { throw new Error('Chromium88 does not implement this'); });
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push({ url, options });
        assert.equal(options.credentials, 'omit');
        assert.equal(options.redirect, 'error');
        assert.equal(options.cache, 'no-store');
        assert.ok(options.signal instanceof AbortSignal);
        if (url.endsWith('/sessions')) return Response.json(pairing());
        if (url.endsWith('/poll')) return Response.json({ status: 'complete' });
        if (url.includes('/graph')) return Response.json({ displayName: 'Synthetic Driver' });
        return Response.json({ status: 'cancelled' });
    });
    const identity = new Identity();
    await identity.initialize();
    assert.equal(identity.ready, true);
    assert.equal(identity.browserEnabled, false);
    assert.equal(identity.phoneEnabled, true);
    const qr = await identity.startPhoneLink();
    assert.ok(qr.phoneUrl.includes(phone));
    assert.ok(!qr.phoneUrl.includes(token));
    assert.ok(!JSON.stringify(qr).includes(token));
    assert.equal(identity.isLoggedIn(), false);
    assert.equal(await identity.checkPhoneLink(), 'complete');
    assert.equal(identity.isLoggedIn(), true);
    assert.deepEqual(await identity.get('/me'), { displayName: 'Synthetic Driver' });
    assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer ' + token);
    await identity.logout();
    assert.equal(identity.phoneToken, undefined);
    assert.equal(identity.isLoggedIn(), false);
    assert.ok(calls.some(c => c.url.endsWith('/cancel')));
    assert.ok(calls.every(c => !c.url.includes(token)));
});

test('email fragment is removed before authentication, passed only as a hint and consumed once', async t => {
    location('#email=synthetic%40example.test');
    const bodies = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        if (url.endsWith('/sessions')) { bodies.push(JSON.parse(options.body)); return Response.json(pairing()); }
        return Response.json({ status: 'cancelled' });
    });
    const identity = new Identity();
    await identity.initialize();
    assert.equal(window.location.href, 'https://dashboard.example/');
    await identity.startPhoneLink();
    await identity.cancelPhoneLink();
    await identity.startPhoneLink();
    assert.deepEqual(bodies, [{ emailHint: 'synthetic@example.test' }, {}]);
});

test('email hints never consume Microsoft authorization fragments or malformed mixed fragments', () => {
    for (const fragment of ['#code=synthetic&state=synthetic', '#email=synthetic%40example.test&state=synthetic',
        '#id_token=synthetic', '#access_token=synthetic']) {
        location(fragment);
        assert.equal(consumeEmailHint(), undefined);
        assert.equal(window.location.href, 'https://dashboard.example/' + fragment);
    }
    for (const fragment of ['#email=bad', '#email=a%40example.test&email=b%40example.test']) {
        location(fragment);
        assert.equal(consumeEmailHint(), undefined);
        assert.equal(window.location.href, 'https://dashboard.example/');
    }
});

test('late pending poll and late allocation cannot sign in after cancellation', async t => {
    location();
    let resolvePoll, resolveStart;
    const cancelled = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        if (url.endsWith('/sessions')) return new Promise(resolve => { resolveStart = resolve; });
        if (url.endsWith('/poll')) return new Promise(resolve => { resolvePoll = resolve; });
        if (url.endsWith('/cancel')) cancelled.push(options.headers.Authorization);
        return Response.json({ status: 'cancelled' });
    });
    const identity = new Identity();
    await identity.initialize();
    const start = identity.startPhoneLink();
    await new Promise(resolve => setImmediate(resolve));
    await identity.cancelPhoneLink();
    resolveStart(Response.json(pairing()));
    await assert.rejects(start, /cancelled/);
    assert.deepEqual(cancelled, ['Bearer ' + token]);
    identity.phoneSessionId = id;
    identity.phoneToken = token;
    const poll = identity.checkPhoneLink();
    await identity.cancelPhoneLink();
    resolvePoll(Response.json({ status: 'complete' }));
    assert.equal(await poll, 'cancelled');
    assert.equal(identity.isLoggedIn(), false);
});

test('Phone Link QR validation rejects mismatched capabilities and phishing endpoints', async t => {
    location();
    let response;
    t.mock.method(globalThis, 'fetch', async url => Response.json(url.endsWith('/sessions') ? response : { status: 'cancelled' }));
    const identity = new Identity();
    await identity.initialize();
    for (const phoneUrl of ['https://attacker.example/phone#session=' + id + '&phone=' + phone,
        `https://phone.example/phone#session=${id}&phone=${token}`, 'invalid',
        `https://phone.example/phone?token=secret#session=${id}&phone=${phone}`]) {
        response = { ...pairing(), phoneUrl };
        await assert.rejects(identity.startPhoneLink(), /Invalid Phone Link/);
        assert.equal(identity.phoneToken, undefined);
    }
});

test('switching Phone Link to device or browser login revokes its credential', async t => {
    location();
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith('/sessions')) return Response.json(pairing());
        if (url.endsWith('/start')) return Response.json({ sessionToken: 'synthetic-device', userCode: 'ABCD-EFGH',
            verificationUri: 'https://microsoft.com/devicelogin', expiresAt: Date.now() + 60000, interval: 5 });
        return Response.json({ status: 'cancelled' });
    });
    const identity = new Identity();
    await identity.initialize();
    await identity.startPhoneLink();
    await identity.startDeviceLogin();
    assert.equal(identity.phoneToken, undefined);
    assert.ok(calls.some(c => c.url.endsWith('/cancel')));
    await identity.startPhoneLink();
    let redirects = 0;
    identity.client = { getActiveAccount: () => null, loginRedirect: async () => { redirects++; } };
    await identity.login();
    assert.equal(identity.phoneToken, undefined);
    assert.equal(redirects, 1);
});

test('compatible timeout covers response body consumption, not only headers', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => ({
        json: () => new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new Error('body timed out')), { once: true });
        }),
    }));
    await assert.rejects(fetchWithTimeout('https://phone.example', {}, 20, response => response.json()), /body timed out/);
});

test('immediate cancellation before allocation never starts either service flow', async t => {
    location();
    const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected allocation'); });
    const identity = new Identity();
    await identity.initialize();
    const phoneStart = identity.startPhoneLink();
    await identity.cancelPhoneLink();
    await assert.rejects(phoneStart, /cancelled/);
    const deviceStart = identity.startDeviceLogin();
    await identity.cancelDeviceLogin();
    await assert.rejects(deviceStart, /cancelled/);
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(identity.isLoggedIn(), false);
});

test('explicit browser login requests account selection with an optional, one-time hint', async () => {
    location('#email=synthetic%40example.test');
    const identity = new Identity();
    await identity.initialize();
    let request;
    identity.client = { loginRedirect: async value => { request = value; } };
    await identity.login();
    assert.equal(request.loginHint, 'synthetic@example.test');
    assert.equal(request.prompt, 'select_account');
    assert.deepEqual(request.scopes, ['User.Read', 'Mail.Read', 'Calendars.Read']);
    await identity.login();
    assert.equal(request.loginHint, undefined);
    assert.equal(request.prompt, 'select_account');
});
