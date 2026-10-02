import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { encode, randomToken, consumerTenant } from '../workers/pairing/crypto.js';

const client = '22222222-2222-3333-4444-555555555555';
const tenant = '11111111-2222-3333-4444-555555555555';
const account = '33333333-2222-3333-4444-555555555555';
const origin = 'https://worker.example';
const app = 'https://dashboard.example';
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'runtime-fixture',
    use: 'sig', alg: 'RS256', issuer: 'https://login.microsoftonline.com/{tenantid}/v2.0' };

async function signedIdentity(nonce, identityTenant) {
    const now = Math.floor(Date.now() / 1000);
    const header = encode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid: jwk.kid })));
    const claims = encode(new TextEncoder().encode(JSON.stringify({ aud: client, tid: identityTenant,
        iss: `https://login.microsoftonline.com/${identityTenant}/v2.0`, oid: account, sub: 'runtime-synthetic-subject',
        nonce, iat: now - 10, nbf: now - 10, exp: now + 3600 })));
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(`${header}.${claims}`));
    return `${header}.${claims}.${encode(new Uint8Array(signature))}`;
}

async function runtime(t, redirect = false, accountType) {
    let nonce;
    const upstreams = [];
    const mf = new Miniflare(convertV4MiniflareOptions({
        modules: ['./fixtures/pairing-runtime.js', '../workers/pairing/index.js', '../workers/pairing/crypto.js', '../shared/graph.js']
            .map(relative => ({ type: 'ESModule', path: fileURLToPath(new URL(relative, import.meta.url)),
                contents: readFileSync(new URL(relative, import.meta.url), 'utf8') })),
        cf: false, compatibilityDate: '2026-09-13',
        bindings: { APP_ORIGIN: app, PHONE_SERVICE_ORIGIN: origin, PHONE_CLIENT_ID: client,
            PHONE_TENANT_ID: 'common', PHONE_CLIENT_SECRET: 'synthetic-runtime-secret', PHONE_ENCRYPTION_KEY: randomToken() },
        d1Databases: { PAIRING_DB: 'runtime-synthetic-database' },
        outboundService: async request => {
            const url = new URL(request.url);
            upstreams.push(url.origin + url.pathname);
            assert.ok(['https://login.microsoftonline.com', 'https://graph.microsoft.com'].includes(url.origin));
            if (redirect) return new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/collect' } });
            if (url.pathname.endsWith('/token')) {
                const form = new URLSearchParams(await request.text());
                assert.equal(form.get('client_secret'), 'synthetic-runtime-secret');
                return Response.json({ access_token: 'synthetic-runtime-access', refresh_token: 'synthetic-runtime-refresh',
                    expires_in: 3600, token_type: 'Bearer', scope: 'User.Read Mail.Read Calendars.Read',
                    id_token: await signedIdentity(nonce, accountType === 'personal' ? consumerTenant : tenant) });
            }
            if (url.pathname.endsWith('/keys')) return Response.json({ keys: [jwk] });
            assert.equal(url.origin, 'https://graph.microsoft.com');
            assert.equal(url.pathname, '/v1.0/me');
            assert.equal(request.headers.get('Authorization'), 'Bearer synthetic-runtime-access');
            return Response.json({ id: accountType === 'personal' ? '0123456789ABCDEF' : account,
                displayName: 'Synthetic Runtime Driver', mail: 'runtime@example.test' });
        },
    }));
    t.after(() => mf.dispose());
    const db = await mf.getD1Database('PAIRING_DB');
    const schema = new DatabaseSync(':memory:');
    try {
        schema.exec(readFileSync(new URL('../workers/pairing/schema.sql', import.meta.url), 'utf8'));
        await db.batch(schema.prepare('SELECT sql FROM sqlite_master WHERE sql IS NOT NULL').all().map(row => db.prepare(row.sql)));
    } finally { schema.close(); }
    const call = (path, { method = 'GET', body, cookie, requestOrigin = app } = {}) => mf.dispatchFetch(origin + path, {
        method, headers: { 'CF-Connecting-IP': '192.0.2.1', ...(requestOrigin ? { Origin: requestOrigin } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual',
    });
    const start = await call('/sessions', { method: 'POST', body: {} });
    assert.equal(start.status, 201);
    const pairing = await start.json();
    const phone = new URLSearchParams(new URL(pairing.phoneUrl).hash.slice(1)).get('phone');
    const claim = await call('/phone/start', { method: 'POST', requestOrigin: origin,
        body: { sessionId: pairing.sessionId, phoneToken: phone, ...(accountType ? { accountType } : {}) } });
    assert.equal(claim.status, 200);
    const cookie = claim.headers.get('Set-Cookie').split(';')[0];
    const authorization = new URL((await claim.json()).authorizationUrl);
    assert.equal(authorization.pathname, `/${accountType === 'personal' ? 'consumers' : accountType === 'work' ? 'organizations' : 'common'}/oauth2/v2.0/authorize`);
    nonce = authorization.searchParams.get('nonce');
    const response = await call('/oauth/callback?' + new URLSearchParams({
        state: authorization.searchParams.get('state'), code: 'synthetic-runtime-code',
    }), { cookie, requestOrigin: null });
    return { response, upstreams, call, cookie };
}

test('actual workerd completes token exchange and identity verification before explicit approval', async t => {
    const { response, upstreams, call, cookie } = await runtime(t);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('Location'), '/phone/confirm');
    assert.deepEqual(upstreams, [
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        'https://login.microsoftonline.com/common/discovery/v2.0/keys',
        'https://graph.microsoft.com/v1.0/me',
    ]);
    assert.equal((await call('/phone/confirm', { cookie, requestOrigin: null })).status, 200);
});

test('actual workerd rejects upstream redirects without sending credentials to another host', async t => {
    const { response, upstreams } = await runtime(t, true);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('Location'), '/phone/result');
    assert.deepEqual(upstreams, ['https://login.microsoftonline.com/common/oauth2/v2.0/token']);
});

test('actual workerd accepts a verified personal-account identity from explicit consumers routing', async t => {
    const { response, call, cookie } = await runtime(t, false, 'personal');
    assert.equal(response.headers.get('Location'), '/phone/confirm');
    assert.equal((await call('/phone/confirm', { cookie, requestOrigin: null })).status, 200);
});
