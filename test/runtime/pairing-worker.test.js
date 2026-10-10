import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('workerd and local D1 preserve pairings across restart and enforce cancellation and expiry', { timeout: 60000 }, async () => {
    const storage = await mkdtemp(join(tmpdir(), 'office-dashboard-worker-'));
    let runtime;
    const externalRequests = [];
    const origin = 'https://worker.example.test';
    const appOrigin = 'https://dashboard.example.test';
    const modules = await Promise.all(['workers/pairing/index.js', 'workers/pairing/crypto.js', 'shared/graph.js']
        .map(async path => ({ type: 'ESModule', path: resolve(path), contents: await readFile(path, 'utf8') })));
    const options = {
        ...convertV4MiniflareOptions({
            modules, modulesRoot: process.cwd(), compatibilityDate: '2026-09-13', cf: false,
            bindings: {
                APP_ORIGIN: appOrigin, PHONE_SERVICE_ORIGIN: origin,
                PHONE_CLIENT_ID: '11111111-2222-3333-4444-555555555555',
                PHONE_TENANT_ID: 'organizations', PHONE_CLIENT_SECRET: 'synthetic-secret',
                PHONE_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64url'),
            },
            d1Databases: { PAIRING_DB: 'synthetic-pairing' },
            ratelimits: { PAIRING_RATE_LIMITER: { namespace_id: '1001', simple: { limit: 120, period: 60 } } },
            outboundService: request => {
                externalRequests.push(new URL(request.url).origin);
                return new Response('External access forbidden in runtime fixture', { status: 502 });
            },
        }),
        resourcePersistencePath: storage,
    };
    const call = (path, { method = 'GET', token, body } = {}) => runtime.dispatchFetch(origin + path, {
        method, headers: { Origin: appOrigin, 'CF-Connecting-IP': '192.0.2.1',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    try {
        runtime = new Miniflare(options);
        const db = await runtime.getD1Database('PAIRING_DB');
        const schema = await readFile(new URL('../../workers/pairing/schema.sql', import.meta.url), 'utf8');
        // D1 exec accepts one SQL statement per line.
        await db.exec(schema.replace(/^--.*$/gm, '').replace(/\s+/g, ' ').replaceAll(';', ';\n'));
        const created = await call('/sessions', { method: 'POST', body: {} });
        assert.equal(created.status, 201);
        const session = await created.json();
        assert.equal(created.headers.get('Access-Control-Allow-Origin'), appOrigin);
        assert.equal(created.headers.get('Cache-Control'), 'no-store');
        const row = await db.prepare('SELECT * FROM phone_slots WHERE session_id=?').bind(session.sessionId).first();
        assert.notEqual(row.tesla_hash, session.teslaToken);
        assert.ok(row.vault);
        assert.equal((await call(`/sessions/${session.sessionId}/poll`, { token: 'x'.repeat(43) })).status, 401);
        await runtime.dispose();
        runtime = new Miniflare(options);
        const poll = await call(`/sessions/${session.sessionId}/poll`, { token: session.teslaToken });
        assert.equal(poll.status, 200);
        assert.deepEqual(await poll.json(), { status: 'pending', expiresAt: session.expiresAt });
        const cancel = await call(`/sessions/${session.sessionId}/cancel`, { method: 'POST', token: session.teslaToken });
        assert.equal(cancel.status, 200);
        assert.deepEqual(await cancel.json(), { status: 'cancelled' });
        assert.equal((await call(`/sessions/${session.sessionId}/poll`, { token: session.teslaToken })).status, 401);
        const restartedDb = await runtime.getD1Database('PAIRING_DB');
        assert.equal(await restartedDb.prepare('SELECT * FROM phone_slots WHERE session_id=?').bind(session.sessionId).first(), null);
        const expiring = await (await call('/sessions', { method: 'POST', body: {} })).json();
        await restartedDb.prepare('UPDATE phone_slots SET expires_at=? WHERE session_id=?')
            .bind(Date.now() - 1, expiring.sessionId).run();
        assert.equal((await call(`/sessions/${expiring.sessionId}/poll`, { token: expiring.teslaToken })).status, 401);
        assert.equal(externalRequests.length, 0);
    } finally {
        try { if (runtime) await runtime.dispose(); }
        finally { await rm(storage, { recursive: true, force: true }); }
    }
});
