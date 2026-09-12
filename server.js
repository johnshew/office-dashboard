import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { PublicClientApplication } from '@azure/msal-node';

const SCOPES = ['User.Read', 'Mail.Read', 'Calendars.Read'];
const VERIFICATION_URIS = ['https://microsoft.com/devicelogin', 'https://www.microsoft.com/devicelogin'];
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const PENDING_MS = 15 * 60_000;
const ACTIVE_MS = 8 * 60 * 60_000;
const RATE_MS = 10 * 60_000;
const jsonType = value => /^application\/json(?:\s*;|$)/i.test(value || '');
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const error = (status, message) => new HttpError(status, message);

async function readJson(stream, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream.iterator?.({ destroyOnReturn: false }) || stream) {
    size += chunk.length;
    if (size > limit) throw error(413, 'Body too large');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function timed(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(error(504, 'Upstream timeout')), ms);
    })]);
  } finally { clearTimeout(timer); }
}

function graphUrl(path) {
  if (!path || path.length > 8192 || /[#\\\s]/.test(path)) throw error(400, 'Invalid Graph path');
  const [pathname, ...query] = path.split('?');
  const attachment = /^\/me\/messages\/([^/]+)\/attachments\/([^/]+)$/.exec(pathname);
  if (!['/me', '/me/messages', '/me/calendarView'].includes(pathname) && !attachment) {
    throw error(400, 'Invalid Graph path');
  }
  if (attachment) {
    for (const segment of attachment.slice(1)) {
      let decoded;
      try { decoded = decodeURIComponent(segment); } catch { throw error(400, 'Invalid Graph path'); }
      if (!/^(?:[A-Za-z0-9_~.!*'()-]|%[a-f0-9]{2})+$/i.test(segment) ||
          decoded === '.' || decoded === '..' || /[/\\%?#\s\x00-\x1f\x7f]/.test(decoded)) {
        throw error(400, 'Invalid Graph path');
      }
    }
  }
  const params = new URLSearchParams(query.join('?'));
  const allowed = new Set(['$select', '$top', '$filter', '$orderby', '$skip', '$skiptoken', 'startDateTime', 'endDateTime']);
  for (const key of params.keys()) if (!allowed.has(key)) throw error(400, 'Invalid Graph query');
  return `https://graph.microsoft.com/v1.0${pathname}${params.size ? `?${params}` : ''}`;
}

// Host behind HTTPS in production. Configure exact frontend origins; never enable credentials/cookies.
export function createDeviceServer({
  env = process.env, Client = PublicClientApplication, fetch: fetchImpl = globalThis.fetch,
  now = Date.now, timeoutMs = 15_000, maxSessions = 100, maxLimiters = 1000, startLimit = 10,
} = {}) {
  const tenant = env.DEVICE_TENANT_ID || 'organizations';
  if (!UUID.test(env.DEVICE_CLIENT_ID || '') ||
      !(UUID.test(tenant) || ['organizations', 'common', 'consumers'].includes(tenant))) {
    throw new Error('Invalid DEVICE_CLIENT_ID or DEVICE_TENANT_ID');
  }
  const origins = new Set((env.DEVICE_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()));
  for (const origin of origins) {
    let url;
    try { url = new URL(origin); } catch { throw new Error('Invalid DEVICE_ALLOWED_ORIGINS'); }
    if (url.origin !== origin || (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
      throw new Error('Invalid DEVICE_ALLOWED_ORIGINS');
    }
  }
  const sessions = new Map(), limiter = new Map();
  let closed = false;
  const release = (session, remove = true) => {
    session.request.cancel = true;
    session.controller.abort();
    session.account = null;
    try { session.pca?.clearCache(); } catch { /* Never log cache or authentication errors. */ }
    if (remove) sessions.delete(session.token);
  };
  const valid = session => sessions.get(session.token) === session && session.expiresAt > now();
  const cleanup = () => {
    for (const session of sessions.values()) if (!valid(session)) release(session);
    for (const [ip, entry] of limiter) if (entry.expiresAt <= now()) limiter.delete(ip);
  };
  const timer = setInterval(cleanup, 30_000);
  timer.unref();

  async function upstream(session, url, options = {}, graphRequest = false) {
    // Copy only path/query onto a pinned origin, including for MSAL's network adapter.
    const target = new URL(graphRequest ? 'https://graph.microsoft.com' : 'https://login.microsoftonline.com');
    const requested = new URL(url);
    target.pathname = requested.pathname;
    target.search = requested.search;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(target.href, {
        ...options, redirect: 'manual',
        signal: AbortSignal.any([controller.signal, session.controller.signal]),
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw error(502, 'Upstream request failed');
      }
      if (graphRequest && !response.ok) {
        await response.body?.cancel();
        return { status: response.status };
      }
      if (!jsonType(response.headers.get('content-type'))) {
        await response.body?.cancel();
        throw error(502, 'Invalid upstream response');
      }
      const body = await readJson(response.body, 8 * 1024 * 1024);
      return { status: response.status, headers: Object.fromEntries(response.headers), body };
    } finally { clearTimeout(deadline); }
  }

  async function start(req, res) {
    const ip = req.socket.remoteAddress;
    let entry = limiter.get(ip);
    if (!entry) {
      if (limiter.size >= maxLimiters) throw error(429, 'Too many requests');
      limiter.set(ip, entry = { count: 0, expiresAt: now() + RATE_MS });
    }
    if (++entry.count > startLimit) throw error(429, 'Too many requests');
    if (sessions.size >= maxSessions) throw error(503, 'Service busy');
    if (!jsonType(req.headers['content-type'])) throw error(415, 'JSON required');
    let body;
    try { body = await timed(readJson(req, 4096), timeoutMs); }
    catch (cause) { req.resume(); throw error(cause instanceof HttpError ? cause.status : 400, 'Invalid request body'); }
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length) {
      throw error(400, 'Expected an empty JSON object');
    }
    // Recheck after reading the body: simultaneous starts must not exceed the bound.
    if (closed || sessions.size >= maxSessions) throw error(503, 'Service busy');
    const session = {
      token: randomBytes(32).toString('base64url'), origin: req.headers.origin,
      status: 'pending', expiresAt: now() + PENDING_MS,
      controller: new AbortController(), request: { scopes: [...SCOPES], cancel: false, timeout: PENDING_MS / 1000 },
    };
    const network = (method, url, options) => {
      if (new URL(url).origin !== 'https://login.microsoftonline.com') throw error(502, 'Invalid authority');
      return upstream(session, url, { method, headers: options?.headers, body: options?.body });
    };
    session.pca = new Client({
      auth: { clientId: env.DEVICE_CLIENT_ID, authority: `https://login.microsoftonline.com/${tenant}` },
      system: {
        loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} },
        networkClient: {
          sendGetRequestAsync: (url, options) => network('GET', url, options),
          sendPostRequestAsync: (url, options) => network('POST', url, options),
        },
      },
    });
    sessions.set(session.token, session);
    let ready, rejectReady;
    const details = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; });
    session.controller.signal.addEventListener('abort', () => rejectReady(error(502, 'Authentication cancelled')), { once: true });
    const fail = () => {
      if (valid(session)) { session.status = 'failed'; release(session, false); }
      else release(session);
      rejectReady(error(502, 'Authentication failed'));
    };
    session.request.deviceCodeCallback = result => {
      try {
        if (!valid(session) || session.status !== 'pending') throw new Error();
        if (!VERIFICATION_URIS.includes(result.verificationUri) ||
            typeof result.userCode !== 'string' || !result.userCode || result.userCode.length > 128 ||
            !Number.isFinite(result.expiresIn) || result.expiresIn <= 0 ||
            !Number.isFinite(result.interval) || result.interval < 1 || result.interval > 300) throw new Error();
        session.expiresAt = Math.min(session.expiresAt, now() + result.expiresIn * 1000);
        ready({ sessionToken: session.token, userCode: result.userCode, verificationUri: result.verificationUri,
          expiresAt: session.expiresAt, interval: result.interval });
      } catch { fail(); }
    };
    const disconnected = () => { if (!res.writableEnded) release(session); };
    res.once('close', disconnected);
    Promise.resolve().then(() => session.pca.acquireTokenByDeviceCode(session.request)).then(result => {
      if (!valid(session) || session.status !== 'pending') { release(session); return; }
      if (!result?.account) { fail(); return; }
      session.account = result.account;
      session.status = 'complete';
      session.expiresAt = now() + ACTIVE_MS;
    }).catch(fail);
    try { return await timed(details, timeoutMs); }
    catch { release(session); throw error(502, 'Authentication unavailable'); }
  }

  const server = createServer({ requestTimeout: 20_000, headersTimeout: 10_000 }, async (req, res) => {
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    try {
      cleanup();
      const origin = req.headers.origin;
      if (!origins.has(origin)) throw error(403, 'Origin not allowed');
      res.setHeader('Access-Control-Allow-Origin', origin);
      if (closed) throw error(503, 'Service unavailable');
      if (!req.url.startsWith('/') || req.url.length > 16_384) throw error(400, 'Invalid request');
      const url = new URL(req.url, 'http://localhost');
      const method = new Map([['/api/device/start', 'POST'], ['/api/device/status', 'GET'],
        ['/api/device/logout', 'POST'], ['/api/graph', 'GET']]).get(url.pathname);
      if (!method) throw error(404, 'Not found');
      if (req.method === 'OPTIONS') {
        const headers = (req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        if (req.headers['access-control-request-method'] !== method ||
            headers.some(h => !['authorization', 'content-type'].includes(h))) throw error(403, 'Preflight not allowed');
        res.setHeader('Access-Control-Allow-Methods', method);
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        return send(204);
      }
      if (req.method !== method) throw error(405, 'Method not allowed');
      if (url.pathname !== '/api/graph' && url.search) throw error(400, 'Invalid query');
      if (url.pathname === '/api/device/start') return send(200, await start(req, res));
      const [scheme, token, extra] = (req.headers.authorization || '').split(' ');
      if (scheme.toLowerCase() !== 'bearer' || !/^[A-Za-z0-9_-]{43}$/.test(token || '') || extra !== undefined) {
        throw error(401, 'Session required');
      }
      const session = sessions.get(token);
      if (session && session.origin !== origin) throw error(401, 'Invalid session');
      if (url.pathname === '/api/device/status') return send(200, { status: session?.status || 'expired' });
      if (url.pathname === '/api/device/logout') {
        if (session) release(session);
        return send(200, { status: 'expired' });
      }
      if (!session || session.status !== 'complete') throw error(401, 'Authentication required');
      if ([...url.searchParams.keys()].join() !== 'path') throw error(400, 'Invalid query');
      const target = graphUrl(url.searchParams.get('path'));
      let auth;
      try {
        auth = await timed(session.pca.acquireTokenSilent({ account: session.account, scopes: [...SCOPES] }), timeoutMs);
        if (!valid(session) || !auth?.accessToken ||
            (auth.expiresOn && auth.expiresOn.getTime() <= now())) throw new Error();
      } catch { release(session); throw error(401, 'Authentication expired'); }
      let graph;
      try {
        graph = await upstream(session, target, { method: 'GET',
          headers: { Authorization: 'Bearer ' + auth.accessToken, Accept: 'application/json',
            Prefer: 'outlook.timezone="UTC"' } }, true);
      } catch { throw error(502, 'Graph request failed'); }
      if (!valid(session)) { release(session); throw error(401, 'Authentication expired'); }
      if (graph.status === 401) release(session);
      if (graph.status < 200 || graph.status >= 300) {
        throw error(graph.status >= 400 && graph.status <= 599 ? graph.status : 502, 'Graph request failed');
      }
      send(200, graph.body);
    } catch (cause) {
      send(cause instanceof HttpError ? cause.status : 500,
        { error: cause instanceof HttpError ? cause.message : 'Request failed' });
    }
  });
  const dispose = () => {
    closed = true;
    clearInterval(timer);
    for (const session of sessions.values()) release(session);
    limiter.clear();
  };
  server.once('close', dispose);
  server.shutdown = () => { dispose(); server.close(); server.closeAllConnections(); };
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const port = Number(process.env.PORT || 8001);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error();
    const server = createDeviceServer();
    server.once('error', () => { console.error('Device API failed to start'); server.shutdown(); process.exitCode = 1; });
    process.once('SIGINT', () => server.shutdown());
    process.once('SIGTERM', () => server.shutdown());
    server.listen(port, process.env.HOST || 'localhost', () => console.log('Device API listening'));
  } catch { console.error('Device API configuration is invalid'); process.exitCode = 1; }
}
