import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { createDeviceServer } from '../server.js';

const origin = 'https://example.github.io';
const env = {
  DEVICE_CLIENT_ID: '11111111-2222-3333-4444-555555555555',
  DEVICE_ALLOWED_ORIGINS: `${origin},http://localhost:8000`,
};
const scopes = ['User.Read', 'Mail.Read', 'Calendars.Read'];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const deviceDetails = {
  userCode: 'ABCD-EFGH', verificationUri: 'https://microsoft.com/devicelogin',
  expiresIn: 900, interval: 5, deviceCode: 'private-device-code', message: 'private-message',
};
const tick = () => new Promise(resolve => setImmediate(resolve));

async function fixture(t, options = {}, behavior = {}) {
  const clients = [], calls = [];
  let time = Date.now();
  class Client {
    constructor(config) {
      if (behavior.construct) behavior.construct(config);
      this.config = config;
      this.result = deferred();
      this.cleared = 0;
      clients.push(this);
    }
    acquireTokenByDeviceCode(req) {
      this.request = req;
      if (behavior.device) return behavior.device(req, this);
      req.deviceCodeCallback(deviceDetails);
      return this.result.promise;
    }
    async acquireTokenSilent(req) {
      this.silentRequest = req;
      if (behavior.silent) return behavior.silent(req, this);
      return { accessToken: 'private-graph-token', expiresOn: new Date(time + 60_000) };
    }
    clearCache() { this.cleared++; }
  }
  const server = createDeviceServer({
    env, Client, now: () => time,
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (behavior.fetch) return behavior.fetch(url, init);
      return Response.json({ displayName: 'Test User' });
    }, ...options,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    if (!server.listening) return;
    const closed = once(server, 'close');
    server.shutdown();
    await closed;
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { token, headers = {}, ...init } = {}) => {
    const response = await fetch(base + path, {
      ...init, headers: { Origin: origin, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    });
    const text = await response.text();
    return { response, body: text ? JSON.parse(text) : undefined, text };
  };
  const start = () => call('/api/device/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const complete = async (index = 0) => {
    clients[index].result.resolve({ account: { homeAccountId: `account-${index}` }, accessToken: 'private-initial-token' });
    await tick();
  };
  return { server, base, call, start, complete, clients, calls, advance: ms => { time += ms; }, now: () => time };
}

test('validates IDs and exact HTTPS or local origins without requiring a secret', () => {
  for (const overrides of [
    { DEVICE_CLIENT_ID: '' }, { DEVICE_CLIENT_ID: 'not-an-id' },
    { DEVICE_TENANT_ID: 'example.com' }, { DEVICE_TENANT_ID: '../common' },
    { DEVICE_ALLOWED_ORIGINS: '' }, { DEVICE_ALLOWED_ORIGINS: '*' },
    { DEVICE_ALLOWED_ORIGINS: `${origin}/` }, { DEVICE_ALLOWED_ORIGINS: 'http://example.com' },
    { DEVICE_ALLOWED_ORIGINS: 'https://example.com/path' },
  ]) assert.throws(() => createDeviceServer({ env: { ...env, ...overrides } }), /Invalid/);
  for (const tenant of ['organizations', 'common', 'consumers', env.DEVICE_CLIENT_ID]) {
    const server = createDeviceServer({ env: { ...env, DEVICE_TENANT_ID: tenant } });
    server.shutdown();
  }
});

test('rejects absent/unapproved origins, including preflights; uses no-store and credentialless CORS', async t => {
  const f = await fixture(t);
  for (const badOrigin of ['', 'null', 'https://example.github.io.evil.test', `${origin}/`, 'http://localhost:8001']) {
    for (const method of ['GET', 'OPTIONS']) {
      const { response } = await f.call('/api/device/status', { method, headers: { Origin: badOrigin } });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('vary'), 'Origin');
    }
  }
  const absent = await fetch(f.base + '/api/device/status');
  assert.equal(absent.status, 403);
  const { response } = await f.call('/api/device/status', { method: 'OPTIONS',
    headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization, Content-Type' } });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal((await f.call('/api/device/status', { method: 'OPTIONS',
    headers: { 'Access-Control-Request-Method': 'POST' } })).response.status, 403);
  assert.equal((await f.call('/api/device/status', { method: 'OPTIONS',
    headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-secret' } })).response.status, 403);
});

test('start returns only public device details; isolated sessions silently acquire Graph tokens', async t => {
  const f = await fixture(t);
  const first = await f.start(), second = await f.start();
  assert.equal(first.response.status, 200);
  assert.deepEqual(Object.keys(first.body).sort(), ['expiresAt', 'interval', 'sessionToken', 'userCode', 'verificationUri'].sort());
  const token = first.body.sessionToken;
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, second.body.sessionToken);
  assert.equal(first.body.expiresAt, f.now() + 900_000);
  assert.equal(first.body.interval, 5);
  assert.ok(!first.text.includes('private'));
  assert.equal(f.clients.length, 2);
  assert.notEqual(f.clients[0].config, f.clients[1].config);
  assert.deepEqual(f.clients[0].request.scopes, scopes);
  assert.equal(f.clients[0].config.auth.authority, 'https://login.microsoftonline.com/organizations');
  assert.deepEqual((await f.call('/api/device/status', { token })).body, { status: 'pending' });
  assert.equal((await f.call('/api/graph?path=%2Fme', { token })).response.status, 401);
  await f.complete();
  assert.deepEqual((await f.call('/api/device/status', { token })).body, { status: 'complete' });
  const graph = await f.call('/api/graph?path=%2Fme', { token, headers: { 'X-Custom': 'not-forwarded' } });
  assert.equal(graph.response.status, 200);
  assert.deepEqual(graph.body, { displayName: 'Test User' });
  assert.deepEqual(f.clients[0].silentRequest, { account: { homeAccountId: 'account-0' }, scopes });
  assert.equal(f.calls[0].url, 'https://graph.microsoft.com/v1.0/me');
  assert.equal(f.calls[0].init.method, 'GET');
  assert.equal(f.calls[0].init.redirect, 'manual');
  assert.deepEqual(f.calls[0].init.headers, {
    Authorization: 'Bearer ' + 'private-graph-token', Accept: 'application/json', Prefer: 'outlook.timezone="UTC"',
  });
  assert.equal(f.clients[1].silentRequest, undefined);
  assert.equal((await f.call('/api/device/status', { token, headers: { Origin: 'http://localhost:8000' } })).response.status, 401);
});

test('approves read paths and encoded IDs but rejects URL, traversal, expansion and encoding bypasses', async t => {
  const f = await fixture(t);
  const { sessionToken: token } = (await f.start()).body;
  await f.complete();
  for (const path of ['/me', '/me/messages?$select=subject&$top=10',
    '/me/calendarView?startDateTime=2026-01-01&endDateTime=2026-01-02',
    '/me/messages/A%2BB%3D/attachments/C%3D']) {
    assert.equal((await f.call(`/api/graph?path=${encodeURIComponent(path)}`, { token })).response.status, 200, path);
  }
  assert.equal(f.calls[2].init.headers.Prefer, 'outlook.timezone="UTC"');
  for (const path of ['https://evil.test/me', '//evil.test/me', '/users', '/me/drive', '/me/messages/id',
    '/me/../users', '/%6de', '/me%2fmessages', '/me/messages/../attachments/id',
    '/me/messages/%2e%2e/attachments/id', '/me/messages/%252e%252e/attachments/id',
    '/me/messages/%2fusers/attachments/id', '/me/messages/%5cusers/attachments/id',
    '/me/messages/%ZZ/attachments/id', '/me/messages/%00/attachments/id',
    '/me/messages/id/attachments/id/$value', '/me#fragment', '/me?$expand=manager',
    '/me?url=https://evil.test', '/me\n', '/me\\messages']) {
    assert.equal((await f.call(`/api/graph?path=${encodeURIComponent(path)}`, { token })).response.status, 400, path);
  }
  assert.equal((await f.call('/api/graph?path=/me&path=/users', { token })).response.status, 400);
  assert.equal((await f.call('/api/graph?path=/me&method=POST', { token })).response.status, 400);
  assert.equal(f.calls.length, 4);
});

test('malformed requests, routes, verbs and bearer credentials fail safely', async t => {
  const f = await fixture(t, { startLimit: 30 });
  for (const body of ['', '{', 'null', '[]', '1', '{"scope":"Mail.ReadWrite"}']) {
    assert.equal((await f.call('/api/device/start', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body })).response.status, 400);
  }
  assert.equal((await f.call('/api/device/start', { method: 'POST', body: '{}' })).response.status, 415);
  assert.equal((await f.call('/api/device/start', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(5000) }) })).response.status, 413);
  assert.equal((await f.call('/')).response.status, 404);
  assert.equal((await f.call('/api/device/start')).response.status, 405);
  assert.equal((await f.call('/api/graph', { method: 'POST' })).response.status, 405);
  for (const authorization of ['', 'Basic abc', 'bearer short', ['Bearer', 'x'.repeat(43), 'extra'].join(' ')]) {
    assert.equal((await f.call('/api/device/status', { headers: { Authorization: authorization } })).response.status, 401);
  }
  assert.equal((await f.call('/api/device/status?sessionToken=secret')).response.status, 400);
  assert.equal(f.clients.length, 0);
});

test('pending expiry cancels MSAL and cannot be resurrected by late completion', async t => {
  const f = await fixture(t, {}, { device(req, client) {
    req.deviceCodeCallback({ ...deviceDetails, expiresIn: 20 });
    return client.result.promise;
  } });
  const started = await f.start(), token = started.body.sessionToken;
  assert.equal(started.body.expiresAt, f.now() + 20_000);
  f.advance(20_000);
  assert.deepEqual((await f.call('/api/device/status', { token })).body, { status: 'expired' });
  assert.equal(f.clients[0].request.cancel, true);
  await f.complete();
  assert.deepEqual((await f.call('/api/device/status', { token })).body, { status: 'expired' });
  assert.ok(f.clients[0].cleared >= 2);
});

test('caps pending lifetime at 15 minutes and active lifetime at an absolute eight hours', async t => {
  const f = await fixture(t, {}, { device(req, client) {
    req.deviceCodeCallback({ ...deviceDetails, expiresIn: 99999 });
    return client.result.promise;
  } });
  const { body } = await f.start(), token = body.sessionToken;
  assert.equal(body.expiresAt, f.now() + 15 * 60_000);
  await f.complete();
  f.advance(8 * 60 * 60_000 - 1);
  assert.equal((await f.call('/api/graph?path=/me', { token })).response.status, 200);
  f.advance(1);
  assert.equal((await f.call('/api/graph?path=/me', { token })).response.status, 401);
  assert.equal(f.clients[0].request.cancel, true);
});

test('logout is idempotent, cancels pending authentication and prevents late completion', async t => {
  const f = await fixture(t);
  const token = (await f.start()).body.sessionToken;
  for (let i = 0; i < 2; i++) assert.equal((await f.call('/api/device/logout', { token, method: 'POST' })).response.status, 200);
  assert.equal(f.clients[0].request.cancel, true);
  await f.complete();
  assert.deepEqual((await f.call('/api/device/status', { token })).body, { status: 'expired' });
});

test('bounds sessions, rejects simultaneous overflow and ignores spoofed forwarding addresses', async t => {
  const f = await fixture(t, { maxSessions: 1, startLimit: 3, maxLimiters: 1 });
  const attempts = await Promise.all([f.start(), f.start()]);
  assert.deepEqual(attempts.map(a => a.response.status).sort(), [200, 503]);
  const token = attempts.find(a => a.response.status === 200).body.sessionToken;
  await f.call('/api/device/logout', { token, method: 'POST' });
  assert.equal((await f.start()).response.status, 200);
  assert.equal((await f.call('/api/device/start', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.123',
  }, body: '{}' })).response.status, 429);
  f.advance(15 * 60_000);
  assert.equal((await f.start()).response.status, 200);
});

test('constructor, callback and authentication failures expose no upstream details', async t => {
  for (const behavior of [
    { construct() { throw Object.assign(new Error('private-token'), { status: 418 }); } },
    { device() { throw new Error('private-token'); } },
    { device(req, client) { req.deviceCodeCallback({ ...deviceDetails, verificationUri: 'javascript:private-token' }); return client.result.promise; } },
    { device(req, client) { req.deviceCodeCallback({ ...deviceDetails, expiresIn: NaN }); return client.result.promise; } },
  ]) {
    const f = await fixture(t, { timeoutMs: 100 }, behavior);
    const result = await f.start();
    assert.ok([500, 502].includes(result.response.status));
    assert.ok(!result.text.includes('private-token'));
    if (f.clients[0]?.request) assert.equal(f.clients[0].request.cancel, true);
  }
  const f = await fixture(t);
  const token = (await f.start()).body.sessionToken;
  f.clients[0].result.reject(new Error('private-auth-error'));
  await tick();
  assert.deepEqual((await f.call('/api/device/status', { token })).body, { status: 'failed' });
  assert.equal(f.clients[0].request.cancel, true);
});

test('verification URIs match the frontend Microsoft device-login allowlist exactly', async t => {
  for (const verificationUri of [
    'https://microsoft.com/devicelogin', 'https://www.microsoft.com/devicelogin',
    'https://evil.test/devicelogin', 'https://microsoft.com.evil.test/devicelogin',
    'http://microsoft.com/devicelogin', 'https://microsoft.com/devicelogin?next=evil',
    'https://microsoft.com/devicelogin#fragment', 'https://microsoft.com/devicelogin/',
  ]) {
    const f = await fixture(t, {}, { device(req, client) {
      req.deviceCodeCallback({ ...deviceDetails, verificationUri });
      return client.result.promise;
    } });
    const result = await f.start();
    const approved = [deviceDetails.verificationUri, 'https://www.microsoft.com/devicelogin'].includes(verificationUri);
    assert.equal(result.response.status, approved ? 200 : 502, verificationUri);
    if (approved) assert.equal(result.body.verificationUri, verificationUri);
    else assert.equal(f.clients[0].request.cancel, true);
  }
});

test('timeouts cancel starts and silent authentication; Graph requests are abortable', async t => {
  const start = await fixture(t, { timeoutMs: 20 }, { device(req, client) { return client.result.promise; } });
  assert.equal((await start.start()).response.status, 502);
  assert.equal(start.clients[0].request.cancel, true);
  const silent = await fixture(t, { timeoutMs: 20 }, { silent: () => new Promise(() => {}) });
  const token = (await silent.start()).body.sessionToken;
  await silent.complete();
  assert.equal((await silent.call('/api/graph?path=/me', { token })).response.status, 401);
  assert.equal(silent.clients[0].request.cancel, true);
  const graph = await fixture(t, { timeoutMs: 20 }, { fetch: (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('private-timeout')), { once: true });
  }) });
  const graphToken = (await graph.start()).body.sessionToken;
  await graph.complete();
  assert.deepEqual((await graph.call('/api/graph?path=/me', { token: graphToken })).body, { error: 'Graph request failed' });
  assert.equal(graph.calls[0].init.signal.aborted, true);
});

test('Graph errors are sanitized, redirects and non-JSON blocked, authentication expiry invalidates', async t => {
  for (const [status, contentType, body, expected] of [
    [403, 'application/json', '{"error":"private-error"}', 403],
    [429, 'text/plain', 'private-error', 429],
    [302, 'application/json', '{}', 502],
    [200, 'text/html', '<script>private</script>', 502],
    [200, 'application/json', 'not json private', 502],
    [401, 'text/plain', 'private-auth-error', 401],
  ]) {
    const f = await fixture(t, {}, { fetch: () => new Response(body, { status,
      headers: { 'Content-Type': contentType, Location: 'https://evil.test' } }) });
    const token = (await f.start()).body.sessionToken;
    await f.complete();
    const result = await f.call('/api/graph?path=/me', { token });
    assert.equal(result.response.status, expected);
    assert.deepEqual(result.body, { error: 'Graph request failed' });
    assert.equal(f.calls.length, 1);
    if (status === 401) assert.deepEqual((await f.call('/api/device/status', { token })).body, { status: 'expired' });
  }
});

test('silent token failures and already expired access tokens invalidate the session', async t => {
  for (const silent of [
    () => { throw new Error('private-refresh-token-error'); },
    () => ({ accessToken: 'private-expired-token', expiresOn: new Date(0) }),
  ]) {
    const f = await fixture(t, {}, { silent });
    const token = (await f.start()).body.sessionToken;
    await f.complete();
    const result = await f.call('/api/graph?path=/me', { token });
    assert.equal(result.response.status, 401);
    assert.deepEqual(result.body, { error: 'Authentication expired' });
    assert.deepEqual((await f.call('/api/device/status', { token })).body, { status: 'expired' });
    assert.equal(f.calls.length, 0);
  }
});

test('caps upstream JSON bodies without leaking their content', async t => {
  const f = await fixture(t, {}, { fetch: () => Response.json({ value: 'x'.repeat(8 * 1024 * 1024) }) });
  const token = (await f.start()).body.sessionToken;
  await f.complete();
  const result = await f.call('/api/graph?path=/me', { token });
  assert.equal(result.response.status, 502);
  assert.deepEqual(result.body, { error: 'Graph request failed' });
});

test('logout while Graph is in flight cancels the upstream request and discards its response', async t => {
  const response = deferred();
  const f = await fixture(t, {}, { fetch: () => response.promise });
  const token = (await f.start()).body.sessionToken;
  await f.complete();
  const graph = f.call('/api/graph?path=/me', { token });
  while (!f.calls.length) await tick();
  await f.call('/api/device/logout', { token, method: 'POST' });
  assert.equal(f.calls[0].init.signal.aborted, true);
  response.resolve(Response.json({ private: 'discard me' }));
  assert.equal((await graph).response.status, 401);
});

test('MSAL network adapter preserves its interface, restricts authority, and uses abort/timeout', async t => {
  const f = await fixture(t);
  await f.start();
  const network = f.clients[0].config.system.networkClient;
  const response = await network.sendPostRequestAsync('https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=test' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { displayName: 'Test User' });
  assert.equal(f.calls[0].init.method, 'POST');
  assert.equal(f.calls[0].init.body, 'grant_type=test');
  assert.throws(() => network.sendGetRequestAsync('https://evil.test/'), /Invalid authority/);
  f.server.shutdown();
  assert.equal(f.clients[0].request.cancel, true);
  assert.equal(f.calls[0].init.signal.aborted, true);
});

test('disconnecting the start request cancels pending authentication', async t => {
  const entered = deferred();
  const f = await fixture(t, {}, { device(req, client) { entered.resolve(); return client.result.promise; } });
  const req = request(f.base + '/api/device/start', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' } });
  req.on('error', () => {});
  req.end('{}');
  await entered.promise;
  req.destroy();
  for (let i = 0; i < 20 && !f.clients[0].request.cancel; i++) await tick();
  assert.equal(f.clients[0].request.cancel, true);
});

test('CLI rejects configuration and bind errors with generic diagnostics', async t => {
  const run = overrides => new Promise(resolve => {
    const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, ...env, ...overrides }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('exit', code => resolve({ code, output }));
  });
  const invalid = await run({ DEVICE_CLIENT_ID: 'private-invalid-value' });
  assert.equal(invalid.code, 1);
  assert.equal(invalid.output.trim(), 'Device API configuration is invalid');
  const occupied = createServer();
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  t.after(() => occupied.close());
  const binding = await run({ HOST: '127.0.0.1', PORT: String(occupied.address().port) });
  assert.equal(binding.code, 1);
  assert.equal(binding.output.trim(), 'Device API failed to start');
});
