import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../workers/pairing/index.js';

const origin = 'https://office-dashboard.shew.net';
const challenge = 'a'.repeat(43);

function fixture(t) {
    const database = new DatabaseSync(':memory:');
    database.exec(readFileSync(new URL('../workers/pairing/schema.sql', import.meta.url), 'utf8'));
    t.after(() => database.close());
    const env = {
        APP_ORIGIN: origin,
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
    const call = async (path, { method = 'GET', token, body, headers = {} } = {}) => worker.fetch(new Request('https://worker.example' + path, {
        method, headers: { Origin: origin, 'CF-Connecting-IP': '192.0.2.1', ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
    }), env);
    const start = async () => {
        const response = await call('/sessions', { method: 'POST', body: { challenge } });
        assert.equal(response.status, 201);
        return response.json();
    };
    return { env, call, start, database };
}

test('pairs phone and Tesla, binds state, and consumes code exactly once', async t => {
    const { call, start, database } = fixture(t);
    const session = await start();
    const path = `/sessions/${session.sessionId}`;
    assert.notEqual(session.phoneToken, session.teslaToken);
    const stored = database.prepare('SELECT * FROM relay_slots WHERE session_id = ?').get(session.sessionId);
    assert.ok(!JSON.stringify(stored).includes(session.teslaToken));
    const phone = await call(path + '/phone', { token: session.phoneToken });
    assert.deepEqual(await phone.json(), { challenge, state: session.state, expiresAt: session.expiresAt });
    assert.equal((await call(path + '/poll', { token: session.phoneToken })).status, 401);
    assert.equal((await call(path + '/complete', { method: 'POST', token: session.teslaToken, body: { code: 'synthetic' } })).status, 401);
    assert.equal((await (await call(path + '/poll', { token: session.teslaToken })).json()).status, 'pending');
    const completion = { method: 'POST', token: session.phoneToken, body: { code: 'synthetic-code', state: session.state, approved: true } };
    assert.equal((await call(path + '/complete', { ...completion, body: { ...completion.body, state: 'wrong' } })).status, 400);
    assert.equal((await call(path + '/complete', { ...completion, body: { ...completion.body, approved: false } })).status, 400);
    assert.equal((await call(path + '/complete', completion)).status, 200);
    assert.equal((await call(path + '/complete', completion)).status, 409);
    const deliveries = await Promise.all([call(path + '/poll', { token: session.teslaToken }), call(path + '/poll', { token: session.teslaToken })]);
    assert.deepEqual(deliveries.map(response => response.status).sort(), [200, 404]);
    assert.deepEqual(await deliveries.find(response => response.status === 200).json(), { status: 'ready', code: 'synthetic-code', state: session.state });
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM relay_slots').get().count, 0);
});

test('denies unapproved origins, query credentials, malformed input and rate excess', async t => {
    const { call, env } = fixture(t);
    for (const invalid of ['', 'https://attacker.example', origin + '.attacker.example']) {
        assert.equal((await call('/sessions', { method: 'POST', headers: { Origin: invalid }, body: { challenge } })).status, 403);
    }
    assert.equal((await call('/sessions?token=synthetic')).status, 400);
    assert.equal((await call('/sessions', { method: 'POST', body: { challenge: 'invalid' } })).status, 400);
    assert.equal((await call('/sessions', { method: 'POST', body: { challenge, extra: 'a'.repeat(9000) } })).status, 400);
    const preflight = await call('/sessions', { method: 'OPTIONS' });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), null);
    assert.equal(preflight.headers.get('Cache-Control'), 'no-store');
    env.PAIRING_RATE_LIMITER.limit = async () => ({ success: false });
    assert.equal((await call('/sessions', { method: 'POST', body: { challenge } })).status, 429);
});

test('reports fixed failure stages without exposing exceptions or bypassing the limiter', async t => {
    const { call, env, database } = fixture(t);
    env.PAIRING_RATE_LIMITER.limit = async () => { throw new Error('synthetic-private-limiter-detail'); };
    const limited = await call('/sessions', { method: 'POST', body: { challenge } });
    assert.equal(limited.status, 503);
    assert.equal(limited.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(limited.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await limited.json(), { error: 'Service unavailable', stage: 'rate_limit' });
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM relay_slots').get().count, 0);
    env.PAIRING_RATE_LIMITER.limit = async () => ({ success: true });
    env.PAIRING_DB.prepare = () => { throw new Error('synthetic-private-storage-detail'); };
    const failed = await call('/sessions', { method: 'POST', body: { challenge } });
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { error: 'Service unavailable', stage: 'allocation' });
    t.mock.method(globalThis.crypto.subtle, 'digest', async () => { throw new Error('synthetic-private-crypto-detail'); });
    const cryptoFailed = await call('/sessions', { method: 'POST', body: { challenge } });
    assert.equal(cryptoFailed.status, 503);
    assert.deepEqual(await cryptoFailed.json(), { error: 'Service unavailable', stage: 'session' });
});

test('expires, cancels and isolates sessions', async t => {
    const { call, start, database, env } = fixture(t);
    const first = await start();
    const second = await start();
    assert.equal((await call(`/sessions/${first.sessionId}/poll`, { token: second.teslaToken })).status, 401);
    assert.equal((await call(`/sessions/${first.sessionId}/cancel`, { method: 'POST', token: first.teslaToken })).status, 200);
    assert.equal((await call(`/sessions/${first.sessionId}/poll`, { token: first.teslaToken })).status, 404);
    database.prepare('UPDATE relay_slots SET expires_at = ? WHERE session_id = ?').run(Date.now() - 1, second.sessionId);
    assert.equal((await call(`/sessions/${second.sessionId}/poll`, { token: second.teslaToken })).status, 404);
    await worker.scheduled({}, env);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM relay_slots').get().count, 0);
});

test('ten slots remain bounded during concurrent allocation and expired slots get fresh credentials', async t => {
    const { call, database, env } = fixture(t);
    const prepare = env.PAIRING_DB.prepare.bind(env.PAIRING_DB);
    t.mock.method(env.PAIRING_DB, 'prepare', sql => {
        if (/INSERT INTO relay_slots/i.test(sql)) {
            assert.doesNotMatch(sql, /\bUNION\b/i, 'Slot enumeration must avoid the live D1 compound SELECT limit');
        }
        return prepare(sql);
    });
    const before = Date.now();
    const responses = await Promise.all(Array.from({ length: 15 }, () => call('/sessions', { method: 'POST', body: { challenge } })));
    assert.equal(responses.filter(response => response.status === 201).length, 10);
    assert.equal(responses.filter(response => response.status === 503).length, 5);
    const sessions = await Promise.all(responses.filter(response => response.status === 201).map(response => response.json()));
    assert.equal(new Set(sessions.map(session => session.slot)).size, 10);
    assert.ok(sessions.every(session => session.expiresAt >= before + 600_000 && session.expiresAt <= Date.now() + 600_000));
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM relay_slots').get().count, 10);
    const previous = sessions[0];
    database.prepare('UPDATE relay_slots SET expires_at = ? WHERE session_id = ?').run(Date.now() - 1, previous.sessionId);
    const replacement = await (await call('/sessions', { method: 'POST', body: { challenge } })).json();
    assert.equal(replacement.slot, previous.slot);
    assert.notEqual(replacement.sessionId, previous.sessionId);
    assert.notEqual(replacement.teslaToken, previous.teslaToken);
    assert.equal((await call(`/sessions/${previous.sessionId}/poll`, { token: previous.teslaToken })).status, 404);
    assert.equal((await call(`/sessions/${replacement.sessionId}/poll`, { token: previous.teslaToken })).status, 401);
    assert.throws(() => database.exec('UPDATE relay_slots SET slot = 10 WHERE slot = 0'), /CHECK constraint/);
});

test('completion is single-write, code expires sooner, and storage failures fail closed', async t => {
    const { call, start, database, env } = fixture(t);
    const session = await start();
    const complete = code => call(`/sessions/${session.sessionId}/complete`, {
        method: 'POST', token: session.phoneToken, body: { code, approved: true, state: session.state },
    });
    const completed = await Promise.all([complete('synthetic-first'), complete('synthetic-second')]);
    assert.deepEqual(completed.map(response => response.status).sort(), [200, 409]);
    const stored = database.prepare('SELECT * FROM relay_slots').get();
    assert.ok(stored.expires_at <= Date.now() + 60_000);
    assert.equal((await call('/health')).status, 200);
    env.PAIRING_DB = undefined;
    assert.equal((await call('/health')).status, 503);
    assert.equal((await call('/sessions', { method: 'POST', body: { challenge } })).status, 503);
});