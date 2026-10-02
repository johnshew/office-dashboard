import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../workers/pairing/index.js';
import { encode, randomToken, open, seal, consumerTenant } from '../workers/pairing/crypto.js';

const appOrigin = 'https://office-dashboard.shew.net';
const serviceOrigin = 'https://worker.example';
const tenantId = '11111111-2222-3333-4444-555555555555';
const clientId = '22222222-2222-3333-4444-555555555555';
const accountId = '33333333-2222-3333-4444-555555555555';
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'synthetic-key',
    use: 'sig', alg: 'RS256', issuer: 'https://login.microsoftonline.com/{tenantid}/v2.0' };
async function jwt(nonce, overrides = {}, headerOverrides = {}) {
    const now = Math.floor(Date.now() / 1000);
    const header = encode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid: jwk.kid, ...headerOverrides })));
    const body = encode(new TextEncoder().encode(JSON.stringify({ aud: clientId, tid: tenantId,
        iss: `https://login.microsoftonline.com/${tenantId}/v2.0`, sub: 'synthetic-subject', oid: accountId,
        nonce, exp: now + 3600, nbf: now - 10, iat: now - 10, ...overrides })));
    return header + '.' + body + '.' + encode(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',
        keys.privateKey, new TextEncoder().encode(header + '.' + body))));
}

function fixture(t) {
    const database = new DatabaseSync(':memory:');
    database.exec(readFileSync(new URL('../workers/pairing/schema.sql', import.meta.url), 'utf8'));
    t.after(() => database.close());
    const env = {
        APP_ORIGIN: appOrigin, PHONE_SERVICE_ORIGIN: serviceOrigin, PHONE_CLIENT_ID: clientId,
        PHONE_TENANT_ID: 'organizations', PHONE_CLIENT_SECRET: 'synthetic-server-secret', PHONE_ENCRYPTION_KEY: randomToken(),
        PAIRING_RATE_LIMITER: { limit: async () => ({ success: true }) },
        PAIRING_DB: {
            prepare(sql) {
                const statement = database.prepare(sql);
                let values = [];
                return {
                    bind(...parameters) { values = parameters; return this; },
                    async first() { return statement.get(...values) ?? null; },
                    async run() { return statement.run(...values); },
                };
            },
        },
    };
    const call = (path, { method = 'GET', token, body, form, cookie, origin = appOrigin, headers = {} } = {}) => worker.fetch(
        new Request(serviceOrigin + path, {
            method, headers: { ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': '192.0.2.1',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
                ...(token ? { Authorization: 'Bearer ' + token } : {}),
                ...(cookie ? { Cookie: cookie } : {}), ...headers },
            ...(body ? { body: JSON.stringify(body) } : form ? { body: new URLSearchParams(form) } : {}),
        }), env);
    const start = async (emailHint) => {
        const response = await call('/sessions', { method: 'POST', body: emailHint ? { emailHint } : {} });
        assert.equal(response.status, 201);
        return response.json();
    };
    const row = session => database.prepare('SELECT * FROM phone_slots WHERE session_id=?').get(session.sessionId);
    const phone = async (session, accountType) => {
        const fragment = new URLSearchParams(new URL(session.phoneUrl).hash.slice(1));
        const response = await call('/phone/start', { method: 'POST', origin: serviceOrigin,
            body: { sessionId: session.sessionId, phoneToken: fragment.get('phone'), ...(accountType ? { accountType } : {}) } });
        assert.equal(response.status, 200);
        const cookie = response.headers.get('Set-Cookie').split(';')[0];
        assert.match(response.headers.get('Set-Cookie'), /Secure; HttpOnly; SameSite=Lax/);
        const authorization = new URL((await response.json()).authorizationUrl);
        return { cookie, authorization, state: authorization.searchParams.get('state'), nonce: authorization.searchParams.get('nonce') };
    };
    const provider = (phone, options = {}) => t.mock.method(globalThis, 'fetch', async (url, request = {}) => {
        const target = new URL(url);
        assert.ok(['https://login.microsoftonline.com', 'https://graph.microsoft.com'].includes(target.origin));
        assert.equal(request.redirect, 'manual');
        if (target.pathname.endsWith('/keys')) return Response.json({ keys: [options.jwk || jwk] });
        if (target.pathname.endsWith('/token')) {
            const form = new URLSearchParams(request.body);
            assert.equal(form.get('client_secret'), env.PHONE_CLIENT_SECRET);
            if (options.onToken) await options.onToken(form);
            if (options.error) return Response.json(options.errorBody || { error: 'private-provider-detail' }, { status: 400 });
            if (form.get('grant_type') === 'authorization_code') {
                assert.equal(form.get('redirect_uri'), serviceOrigin + '/oauth/callback');
                assert.equal(form.get('code_verifier'), (await open(env, phone.sessionId, row({ sessionId: phone.sessionId }).vault)).verifier);
            }
            let signed = options.idToken || await jwt(phone.nonce, options.claims, options.header);
            if (options.corruptSignature) {
                const parts = signed.split('.');
                parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
                signed = parts.join('.');
            }
            return Response.json({ access_token: 'synthetic-graph-access', refresh_token: 'synthetic-refresh-secret',
                token_type: 'Bearer', expires_in: 3600, scope: 'User.Read Mail.Read Calendars.Read',
                id_token: signed });
        }
        assert.match(request.headers.Authorization, /^Bearer synthetic-graph-access$/);
        return Response.json(target.pathname === '/v1.0/me' ? { id: options.accountId || accountId,
            displayName: 'Synthetic Driver', mail: 'synthetic@example.test' } : { value: [] });
    });
    const authenticate = async (session, options = {}) => {
        const p = await phone(session);
        p.sessionId = session.sessionId;
        provider(p, options);
        const response = await call(`/oauth/callback?state=${p.state}&code=synthetic-code`, { cookie: p.cookie, origin: null });
        return { ...p, response };
    };
    const approve = async (session, p, decision = 'approve') => {
        const confirmation = await call('/phone/confirm', { cookie: p.cookie, origin: null });
        assert.equal(confirmation.status, 200);
        const html = await confirmation.text();
        assert.ok(html.includes(session.label));
        assert.ok(html.includes('synthetic@example.test'));
        const csrf = /name="csrf" value="([^"]+)"/.exec(html)[1];
        return call('/phone/approve', { method: 'POST', origin: serviceOrigin, cookie: p.cookie, form: { csrf, decision } });
    };
    return { env, database, call, start, row, phone, provider, authenticate, approve };
}

test('Phone Link authenticates, then explicitly approves; tokens remain encrypted on the server', async t => {
    const f = fixture(t);
    const session = await f.start('hint@example.test');
    const pending = () => f.call(`/sessions/${session.sessionId}/poll`, { token: session.teslaToken });
    assert.equal((await (await pending()).json()).status, 'pending');
    const p = await f.authenticate(session);
    assert.equal(p.authorization.searchParams.get('login_hint'), 'hint@example.test');
    assert.equal(p.response.headers.get('Location'), '/phone/confirm');
    assert.equal((await (await pending()).json()).status, 'pending');
    assert.equal((await f.call(`/sessions/${session.sessionId}/graph?path=%2Fme`, { token: session.teslaToken })).status, 401);
    const stored = JSON.stringify(f.row(session));
    for (const secret of ['synthetic-graph-access', 'synthetic-refresh-secret', 'hint@example.test', session.teslaToken,
        new URL(session.phoneUrl).hash.slice(1).split('phone=')[1], p.cookie.split('=')[1]]) assert.ok(!stored.includes(secret));
    const approval = await f.approve(session, p);
    assert.equal(approval.status, 200);
    assert.match(await approval.text(), /Dashboard approved/);
    assert.equal((await (await pending()).json()).status, 'complete');
    assert.equal((await f.call('/phone/confirm', { cookie: p.cookie, origin: null })).status, 401);
    const graph = await f.call(`/sessions/${session.sessionId}/graph?path=%2Fme`, { token: session.teslaToken });
    assert.equal(graph.status, 200);
    assert.equal((await graph.json()).displayName, 'Synthetic Driver');
    await f.call(`/sessions/${session.sessionId}/cancel`, { method: 'POST', token: session.teslaToken, body: {} });
    assert.equal(f.row(session), undefined);
    assert.equal((await pending()).status, 401);
});

test('common phone sign-in offers explicit personal and work account routes without changing scopes', async t => {
    const f = fixture(t);
    f.env.PHONE_TENANT_ID = 'common';
    const landing = await f.call('/phone', { origin: null });
    const html = await landing.text();
    assert.ok(html.includes('Personal Microsoft account'));
    assert.ok(html.includes('Work or school account'));
    assert.ok(html.includes("history.replaceState(null, '', '/phone')"));
    for (const [type, authority] of [['personal', 'consumers'], ['work', 'organizations']]) {
        const session = await f.start(), p = await f.phone(session, type);
        assert.equal(p.authorization.pathname, `/${authority}/oauth2/v2.0/authorize`);
        assert.equal(p.authorization.searchParams.get('scope'), 'openid profile offline_access User.Read Mail.Read Calendars.Read');
        assert.equal(p.authorization.searchParams.get('code_challenge_method'), 'S256');
    }
});

test('phone account type cannot widen the configured audience or consume a pairing on invalid input', async t => {
    const f = fixture(t), session = await f.start();
    const phoneToken = new URLSearchParams(new URL(session.phoneUrl).hash.slice(1)).get('phone');
    for (const accountType of ['personal', 'invalid', 'consumers/other']) {
        const response = await f.call('/phone/start', { method: 'POST', origin: serviceOrigin,
            body: { sessionId: session.sessionId, phoneToken, accountType } });
        assert.equal(response.status, 400);
        assert.equal(f.row(session).status, 'pending');
    }
    f.env.PHONE_TENANT_ID = 'consumers';
    assert.equal((await f.call('/phone/start', { method: 'POST', origin: serviceOrigin,
        body: { sessionId: session.sessionId, phoneToken, accountType: 'work' } })).status, 400);
    assert.equal(f.row(session).status, 'pending');
});

test('wrong capabilities, cookies, state, replay and cross-pairing substitution are rejected', async t => {
    const f = fixture(t), session = await f.start(), second = await f.start();
    const cap = new URLSearchParams(new URL(session.phoneUrl).hash.slice(1)).get('phone');
    assert.equal((await f.call(`/sessions/${session.sessionId}/poll`, { token: cap })).status, 401);
    assert.equal((await f.call('/phone/start', { origin: serviceOrigin, method: 'POST', body: {
        sessionId: session.sessionId, phoneToken: session.teslaToken } })).status, 401);
    const p = await f.phone(session), other = await f.phone(second);
    const callback = `/oauth/callback?state=${p.state}&code=synthetic`;
    assert.equal((await f.call(callback, { origin: null })).status, 401);
    assert.equal((await f.call(callback, { origin: null, cookie: other.cookie })).status, 400);
    assert.equal((await f.call(`/oauth/callback?state=${randomToken()}&code=synthetic`, { origin: null, cookie: p.cookie })).status, 400);
    assert.equal(f.row(session).status, 'oauth');
    assert.equal((await f.call('/phone/start', { origin: serviceOrigin, method: 'POST', body: {
        sessionId: session.sessionId, phoneToken: cap } })).status, 401);
    p.sessionId = session.sessionId;
    f.provider(p);
    assert.equal((await f.call(callback, { origin: null, cookie: p.cookie })).headers.get('Location'), '/phone/confirm');
    assert.equal((await f.call(callback, { origin: null, cookie: p.cookie })).status, 400);
    assert.equal((await f.call(`/sessions/${second.sessionId}/poll`, { token: session.teslaToken })).status, 401);
});

test('approval needs phone origin, CSRF and authenticated confirmation; denial clears vault', async t => {
    const f = fixture(t), session = await f.start();
    const p = await f.authenticate(session);
    const options = { method: 'POST', origin: serviceOrigin, cookie: p.cookie, form: { csrf: randomToken(), decision: 'approve' } };
    assert.equal((await f.call('/phone/approve', options)).status, 403);
    const body = await open(f.env, session.sessionId, f.row(session).vault);
    options.form.csrf = body.csrf;
    assert.equal((await f.call('/phone/approve', { ...options, origin: appOrigin })).status, 403);
    assert.equal((await f.call('/phone/approve', { ...options, cookie: '__Host-phone-link=' + randomToken() })).status, 401);
    assert.equal((await f.approve(session, p, 'deny')).status, 200);
    assert.equal(f.row(session).vault, null);
    assert.equal((await (await f.call(`/sessions/${session.sessionId}/poll`, { token: session.teslaToken })).json()).status, 'denied');
    assert.equal((await f.call('/phone/approve', options)).status, 401);
});

test('simultaneous approval and cancellation do not replace another dashboard or revive sessions', async t => {
    const f = fixture(t), session = await f.start(), other = await f.start();
    const p = await f.authenticate(session);
    const csrf = (await open(f.env, session.sessionId, f.row(session).vault)).csrf;
    const options = { method: 'POST', origin: serviceOrigin, cookie: p.cookie, form: { csrf, decision: 'approve' } };
    const responses = await Promise.all([f.call('/phone/approve', options), f.call('/phone/approve', options)]);
    assert.equal(responses.filter(r => r.status === 200).length, 1);
    assert.equal(f.row(other).status, 'pending');
    assert.equal((await f.call(`/sessions/${other.sessionId}/cancel`, { method: 'POST', token: session.teslaToken, body: {} })).status, 401);
    await f.call(`/sessions/${session.sessionId}/cancel`, { method: 'POST', token: session.teslaToken, body: {} });
    assert.equal(f.row(session), undefined);
});

test('expiry, scheduled cleanup and ten-slot reuse survive Worker restarts', async t => {
    const f = fixture(t);
    const sessions = await Promise.all(Array.from({ length: 10 }, () => f.start()));
    assert.equal((await f.call('/sessions', { method: 'POST', body: {} })).status, 503);
    const expired = sessions[0];
    const expiredSlot = f.row(expired).slot;
    f.database.prepare('UPDATE phone_slots SET expires_at=? WHERE session_id=?').run(Date.now() - 1, expired.sessionId);
    assert.equal((await f.call(`/sessions/${expired.sessionId}/poll`, { token: expired.teslaToken })).status, 401);
    const replacement = await f.start();
    assert.equal(f.row(expired), undefined);
    assert.equal(f.row(replacement).slot, expiredSlot);
    f.database.prepare('UPDATE phone_slots SET expires_at=?').run(Date.now() - 1);
    await worker.scheduled({}, f.env);
    assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM phone_slots').get().count, 0);
});

test('invalid JWT audience, issuer, tenant, nonce, times, signature and provider identity fail closed', async t => {
    const f = fixture(t);
    const cases = [
        { claims: { aud: tenantId } }, { claims: { nonce: 'wrong' } }, { claims: { iss: 'https://attacker.example' } },
        { claims: { exp: 1 } }, { claims: { nbf: Math.floor(Date.now() / 1000) + 600 } },
        { claims: { tid: consumerTenant, iss: `https://login.microsoftonline.com/${consumerTenant}/v2.0` } },
        { corruptSignature: true }, { header: { alg: 'none' } }, { header: { kid: 'unknown-key' } },
        { jwk: { ...jwk, issuer: 'https://attacker.example' } }, { accountId: tenantId }, { error: true },
    ];
    for (const options of cases) {
        const session = await f.start();
        const p = await f.authenticate(session, options);
        assert.equal(p.response.headers.get('Location'), '/phone/result');
        assert.equal(f.row(session).status, 'failed');
        assert.equal(f.row(session).vault, null);
        const response = await f.call(`/sessions/${session.sessionId}/poll`, { token: session.teslaToken });
        assert.equal((await response.json()).status, 'failed');
        await f.call(`/sessions/${session.sessionId}/cancel`, { method: 'POST', token: session.teslaToken, body: {} });
        t.mock.restoreAll();
    }
});

test('callback diagnostics identify token failures without logging provider details or pairing credentials', async t => {
    const f = fixture(t), session = await f.start();
    const warnings = [];
    t.mock.method(console, 'warn', (...args) => warnings.push(args));
    const p = await f.authenticate(session, { error: true, errorBody: {
        error: 'invalid_client', error_description: 'private-provider-description',
        error_codes: [7000215, 7000222, 'private-provider-code', -1, null, 1000000000],
        access_token: 'private-provider-access', trace_id: 'private-provider-trace',
    } });
    assert.equal(p.response.headers.get('Location'), '/phone/result');
    assert.equal(f.row(session).status, 'failed');
    assert.equal(f.row(session).vault, null);
    assert.deepEqual(warnings, [['Phone Link callback failed', {
        stage: 'token-exchange', status: 401, providerStatus: 400, providerCodes: [7000215, 7000222],
    }]]);
    const logged = JSON.stringify(warnings);
    for (const value of ['private-provider-description', 'private-provider-code', 'private-provider-access',
        'private-provider-trace', 'synthetic-server-secret', 'synthetic-code', session.sessionId,
        session.teslaToken, session.phoneUrl, p.cookie, p.state, p.nonce]) assert.ok(!logged.includes(value));
});

test('callback identity diagnostics do not log the token, claims or rejected identity', async t => {
    const f = fixture(t), session = await f.start();
    const warnings = [];
    t.mock.method(console, 'warn', (...args) => warnings.push(args));
    const p = await f.authenticate(session, { claims: { nonce: 'private-invalid-nonce' } });
    assert.equal(p.response.headers.get('Location'), '/phone/result');
    assert.equal(f.row(session).vault, null);
    assert.deepEqual(warnings, [['Phone Link callback failed', {
        stage: 'identity-validation', status: 500, providerStatus: undefined, providerCodes: undefined,
    }]]);
    const logged = JSON.stringify(warnings);
    for (const value of ['private-invalid-nonce', 'synthetic-subject', accountId, clientId,
        'synthetic-graph-access', 'synthetic-refresh-secret', p.nonce]) assert.ok(!logged.includes(value));
});

test('malformed provider error JSON retains the rejection status without leaking its body', async t => {
    const f = fixture(t), session = await f.start(), p = await f.phone(session);
    const warnings = [];
    t.mock.method(console, 'warn', (...args) => warnings.push(args));
    t.mock.method(globalThis, 'fetch', async () => new Response('private-invalid-provider-json', {
        status: 400, headers: { 'Content-Type': 'application/json' },
    }));
    const response = await f.call(`/oauth/callback?state=${p.state}&code=synthetic-code`, { cookie: p.cookie, origin: null });
    assert.equal(response.headers.get('Location'), '/phone/result');
    assert.equal(f.row(session).vault, null);
    assert.deepEqual(warnings, [['Phone Link callback failed', {
        stage: 'token-exchange', status: 401, providerStatus: 400, providerCodes: [],
    }]]);
    assert.ok(!JSON.stringify(warnings).includes('private-invalid-provider-json'));
});

test('expiry or cancellation after phone authentication prevents approval and clears stored tokens', async t => {
    const f = fixture(t);
    for (const action of ['expire', 'cancel']) {
        const session = await f.start(), p = await f.authenticate(session);
        const csrf = (await open(f.env, session.sessionId, f.row(session).vault)).csrf;
        if (action === 'expire') f.database.prepare('UPDATE phone_slots SET expires_at=? WHERE session_id=?').run(Date.now() - 1, session.sessionId);
        else await f.call(`/sessions/${session.sessionId}/cancel`, { method: 'POST', token: session.teslaToken, body: {} });
        assert.equal((await f.call('/phone/approve', { origin: serviceOrigin, cookie: p.cookie, method: 'POST',
            form: { csrf, decision: 'approve' } })).status, 401);
        await worker.scheduled({}, f.env);
        assert.equal(f.row(session), undefined);
        t.mock.restoreAll();
    }
});

test('configured single tenant and consumer audience are enforced', async t => {
    const f = fixture(t);
    f.env.PHONE_TENANT_ID = clientId;
    let session = await f.start(), p = await f.authenticate(session);
    assert.equal(p.response.headers.get('Location'), '/phone/result');
    t.mock.restoreAll();
    f.env.PHONE_TENANT_ID = 'consumers';
    session = await f.start();
    p = await f.authenticate(session, { claims: { tid: consumerTenant,
        iss: `https://login.microsoftonline.com/${consumerTenant}/v2.0` }, accountId: 'personal-graph-id' });
    assert.equal(p.response.headers.get('Location'), '/phone/confirm');
});

test('renewal has a persistent lease, encrypted rotated tokens and fails closed on refresh errors', async t => {
    const f = fixture(t), session = await f.start(), p = await f.authenticate(session);
    await f.approve(session, p);
    let body = await open(f.env, session.sessionId, f.row(session).vault);
    body.tokenExpiresAt = 0;
    f.database.prepare('UPDATE phone_slots SET vault=? WHERE session_id=?').run(await seal(f.env, session.sessionId, body), session.sessionId);
    t.mock.restoreAll();
    let entered, release;
    const waiting = new Promise(resolve => { entered = resolve; });
    const blocked = new Promise(resolve => { release = resolve; });
    f.provider(p, { onToken: async form => {
        assert.equal(form.get('grant_type'), 'refresh_token');
        assert.equal(form.get('refresh_token'), 'synthetic-refresh-secret');
        entered(); await blocked;
    } });
    const path = `/sessions/${session.sessionId}/graph?path=%2Fme`;
    const first = f.call(path, { token: session.teslaToken });
    await waiting;
    assert.equal((await f.call(path, { token: session.teslaToken })).status, 409);
    release();
    assert.equal((await first).status, 200);
    assert.equal(f.row(session).revision, 1);
    assert.ok(!f.row(session).vault.includes('synthetic-refresh-secret'));
    t.mock.restoreAll();
    body = await open(f.env, session.sessionId, f.row(session).vault);
    body.tokenExpiresAt = 0;
    f.database.prepare('UPDATE phone_slots SET vault=? WHERE session_id=?').run(await seal(f.env, session.sessionId, body), session.sessionId);
    f.provider(p, { error: true });
    const failure = await f.call(path, { token: session.teslaToken });
    assert.equal(failure.status, 401);
    assert.ok(!(await failure.text()).includes('private-provider-detail'));
    assert.equal(f.row(session).vault, null);
    assert.equal(f.row(session).status, 'failed');
});

test('cancelling during OAuth token exchange prevents late activation', async t => {
    const f = fixture(t), session = await f.start(), p = await f.phone(session);
    p.sessionId = session.sessionId;
    let entered, release;
    const waiting = new Promise(resolve => { entered = resolve; }), blocked = new Promise(resolve => { release = resolve; });
    // Return a signed token after cancellation without consulting the removed row.
    const signed = await jwt(p.nonce);
    t.mock.method(globalThis, 'fetch', async url => {
        if (url.endsWith('/token')) {
            entered(); await blocked;
            return Response.json({ access_token: 'synthetic-graph-access', refresh_token: 'synthetic-refresh-secret',
                token_type: 'Bearer', expires_in: 3600, scope: 'User.Read Mail.Read Calendars.Read', id_token: signed });
        }
        return Response.json(url.endsWith('/keys') ? { keys: [jwk] } : { id: accountId });
    });
    const callback = f.call(`/oauth/callback?state=${p.state}&code=synthetic`, { origin: null, cookie: p.cookie });
    await waiting;
    await f.call(`/sessions/${session.sessionId}/cancel`, { method: 'POST', token: session.teslaToken, body: {} });
    release();
    assert.equal((await callback).headers.get('Location'), '/phone/result');
    assert.equal(f.row(session), undefined);
});

test('Graph allowlist, exact CORS and phone page security do not expose credentials', async t => {
    const f = fixture(t), session = await f.start(), p = await f.authenticate(session);
    await f.approve(session, p);
    for (const path of ['/users', '/me/sendMail', '/me/messages?$expand=anything', '/me/messages?$count=true',
        '//attacker.example', '/me/messages/%2e%2e/attachments/id']) {
        assert.equal((await f.call(`/sessions/${session.sessionId}/graph?path=${encodeURIComponent(path)}`, { token: session.teslaToken })).status, 400);
    }
    for (const origin of [null, 'https://attacker.example', appOrigin + '.attacker.example']) {
        const denied = await f.call('/sessions', { origin, method: 'POST', body: {} });
        assert.equal(denied.status, 403);
        assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
    }
    const preflight = await f.call('/sessions', { method: 'OPTIONS', headers: {
        'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), null);
    const landing = await f.call('/phone', { origin: null });
    assert.equal(landing.status, 200);
    assert.equal(landing.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(landing.headers.get('Cache-Control'), 'no-store');
    assert.match(landing.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    assert.match(await landing.text(), /history.replaceState/);
    assert.equal((await f.call('/sessions?token=synthetic', { method: 'POST', body: {} })).status, 400);
    f.env.PAIRING_RATE_LIMITER.limit = async () => ({ success: false });
    assert.equal((await f.call('/sessions', { method: 'POST', body: {} })).status, 429);
    f.env.PAIRING_RATE_LIMITER.limit = async () => { throw new Error('private-limiter-detail'); };
    const failed = await f.call('/sessions', { method: 'POST', body: {} });
    assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes('private-limiter-detail'));
});

test('encrypted vault is bound to its pairing and stable Worker secret', async t => {
    const f = fixture(t), session = await f.start(), other = await f.start();
    const vault = f.row(session).vault;
    await assert.rejects(open(f.env, other.sessionId, vault));
    await assert.rejects(open({ ...f.env, PHONE_ENCRYPTION_KEY: randomToken() }, session.sessionId, vault));
    assert.equal(await open(f.env, session.sessionId, vault).then(body => body.emailHint), undefined);
});
