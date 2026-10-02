import { graphUrl } from '../../shared/graph.js';
import { capabilityPattern, uuidPattern, consumerTenant, randomToken, hash, seal, open, verifyIdToken } from './crypto.js';

const pairingLifetime = 10 * 60_000;
const activeLifetime = 8 * 60 * 60_000;
const scopes = 'openid profile offline_access User.Read Mail.Read Calendars.Read';
const cookieName = '__Host-phone-link';
class HttpError extends Error {
    constructor(status, message, details = {}) {
        super(message);
        this.status = status;
        this.providerStatus = details.providerStatus;
        this.providerCodes = details.providerCodes;
    }
}
const fail = (status, message, details) => { throw new HttpError(status, message, details); };
const json = (body, status = 200) => Response.json(body, { status });
const redirect = path => new Response(null, { status: 303, headers: { Location: path } });
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function validateConfig(env, origin) {
    if (!uuidPattern.test(env.PHONE_CLIENT_ID || '') ||
        !(uuidPattern.test(env.PHONE_TENANT_ID || '') || ['common', 'organizations', 'consumers'].includes(env.PHONE_TENANT_ID)) ||
        !env.PHONE_CLIENT_SECRET || !capabilityPattern.test(env.PHONE_ENCRYPTION_KEY || '')) fail(503, 'Phone Link is not configured');
    for (const name of ['APP_ORIGIN', 'PHONE_SERVICE_ORIGIN']) {
        const url = new URL(env[name]);
        if (url.protocol !== 'https:' || url.origin !== env[name]) fail(503, 'Phone Link is not configured');
    }
    if (origin !== env.PHONE_SERVICE_ORIGIN) fail(403, 'Service origin denied');
}

async function readBody(request, limit = 8192) {
    if (!request.body) fail(400, 'Body required');
    const reader = request.body.getReader();
    let length = 0;
    const chunks = [];
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > limit) { await reader.cancel(); fail(413, 'Body too large'); }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(bytes);
}
async function readJson(request) {
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) fail(415, 'JSON required');
    const text = await readBody(request);
    let value;
    try { value = JSON.parse(text); } catch { fail(400, 'Invalid JSON'); }
    if (!value || Array.isArray(value) || typeof value !== 'object') fail(400, 'Invalid JSON');
    return value;
}
function cookie(request) {
    const values = (request.headers.get('Cookie') || '').split(';').map(s => s.trim())
        .filter(s => s.startsWith(cookieName + '='));
    const value = values.length === 1 ? values[0].slice(cookieName.length + 1) : '';
    if (!capabilityPattern.test(value)) fail(401, 'Phone session unavailable');
    return value;
}
function setCookie(response, value = '', maxAge = 0) {
    response.headers.set('Set-Cookie', `${cookieName}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
    return response;
}
function page(title, body, script = '') {
    const nonce = randomToken();
    return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} — Phone Link</title><style nonce="${nonce}">body{font:18px/1.5 system-ui,sans-serif;color:#212529;background:#fff;margin:0}main{max-width:40rem;margin:3rem auto;padding:1.5rem;overflow-wrap:anywhere}h1{font-size:2rem}h2{font-size:1.5rem}form{display:flex;flex-wrap:wrap;gap:1rem;margin-top:2rem}button{font:inherit;min-height:44px;padding:.6rem 1rem;border:1px solid #6c757d;border-radius:.375rem;background:#fff;color:#212529;cursor:pointer}button[value=approve]{background:#0d6efd;border-color:#0d6efd;color:#fff}button:focus-visible{outline:3px solid #212529;outline-offset:3px}</style><body><main><h1>Phone Link</h1><h2>${escape(title)}</h2>${body}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
        },
    });
}
const landing = () => page('Sign in on your phone',
    '<p id="status" role="status">Connecting to your waiting dashboard…</p><p>Authenticate with Microsoft on this phone, then match the pairing label and explicitly approve the dashboard. A passkey may be offered by Microsoft; no Bluetooth connection to the car is needed.</p>',
    `const params = new URLSearchParams(location.hash.slice(1));
const sessionId = params.get('session'), phoneToken = params.get('phone');
history.replaceState(null, '', '/phone');
if (!sessionId || !phoneToken) document.getElementById('status').textContent = 'Scan a new Phone Link QR code from your dashboard.';
else fetch('/phone/start', {method:'POST', credentials:'same-origin', cache:'no-store', redirect:'error', headers:{'Content-Type':'application/json'}, body:JSON.stringify({sessionId,phoneToken})})
.then(async response => {if (!response.ok) throw new Error(); const body = await response.json(); location.replace(body.authorizationUrl);})
.catch(() => {document.getElementById('status').textContent = 'This pairing is unavailable. Start a new Phone Link on the dashboard.';});`);

function service(env) {
    const db = env.PAIRING_DB;
    const first = (sql, ...values) => db.prepare(sql).bind(...values).first();
    async function upstream(url, options = {}) {
        const target = new URL(url);
        if (!['https://login.microsoftonline.com', 'https://graph.microsoft.com'].includes(target.origin) ||
            target.username || target.password || target.hash) fail(502, 'Invalid upstream');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(target.href, { ...options, signal: controller.signal, redirect: 'error' });
            if (!response.ok) {
                let providerCodes = [];
                if (/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type') || '')) {
                    const text = await readBody(response, 65536);
                    let body;
                    try { body = JSON.parse(text); }
                    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
                    if (body && Array.isArray(body.error_codes)) {
                        providerCodes = body.error_codes.filter(code => Number.isSafeInteger(code) && code > 0 && code < 1000000000).slice(0, 8);
                    }
                } else await response.body?.cancel();
                fail(response.status === 400 || response.status === 401 ? 401 : 502, 'Microsoft request failed',
                    { providerStatus: response.status, providerCodes });
            }
            if (!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type') || '')) fail(502, 'Invalid Microsoft response');
            return JSON.parse(await readBody(response, 8 * 1024 * 1024));
        } finally { clearTimeout(timer); }
    }
    async function token(form) {
        const body = new URLSearchParams({
            client_id: env.PHONE_CLIENT_ID,
            client_secret: env.PHONE_CLIENT_SECRET,
            scope: scopes,
            ...form,
        });
        const result = await upstream(`https://login.microsoftonline.com/${env.PHONE_TENANT_ID}/oauth2/v2.0/token`,
            { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
        const granted = new Set((result.scope || '').toLowerCase().split(' '));
        if (result.token_type?.toLowerCase() !== 'bearer' || typeof result.access_token !== 'string' || !result.access_token ||
            !Number.isFinite(result.expires_in) || result.expires_in < 60 || result.expires_in > 86400 ||
            !['user.read', 'mail.read', 'calendars.read'].every(s => granted.has(s))) fail(401, 'Invalid Microsoft permissions');
        return result;
    }
    const live = (column, value) => first(`SELECT * FROM phone_slots WHERE ${column} = ? AND expires_at > ?`, value, Date.now());
    async function phoneSession(request) {
        const row = await live('cookie_hash', await hash(cookie(request)));
        if (!row) fail(401, 'Phone session unavailable');
        return row;
    }
    async function teslaSession(request, id) {
        const header = request.headers.get('Authorization') || '';
        const value = header.startsWith('Bearer ') ? header.slice(7) : '';
        if (!capabilityPattern.test(value)) fail(401, 'Dashboard session unavailable');
        const row = await live('session_id', id);
        if (!row || row.tesla_hash !== await hash(value)) fail(401, 'Dashboard session unavailable');
        return row;
    }
    async function start(request) {
        const body = await readJson(request);
        if (Object.keys(body).some(k => k !== 'emailHint') ||
            (body.emailHint !== undefined && (typeof body.emailHint !== 'string' || body.emailHint.length > 254 ||
                !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(body.emailHint)))) fail(400, 'Invalid sign-in hint');
        const sessionId = randomToken(), phoneToken = randomToken(), teslaToken = randomToken();
        const label = 'Phone Link ' + Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        const expiresAt = Date.now() + pairingLifetime;
        const vault = await seal(env, sessionId, { emailHint: body.emailHint });
        // Atomic slot allocation/reuse retains the original relay's ten-slot bound.
        const row = await first(`WITH candidate(slot) AS (VALUES(0),(1),(2),(3),(4),(5),(6),(7),(8),(9))
            INSERT INTO phone_slots(slot,session_id,phone_hash,tesla_hash,label,status,expires_at,vault)
            SELECT slot,?,?,?,?, 'pending',?,? FROM candidate
            WHERE NOT EXISTS(SELECT 1 FROM phone_slots p WHERE p.slot=candidate.slot AND p.expires_at > ?)
            ORDER BY slot LIMIT 1
            ON CONFLICT(slot) DO UPDATE SET session_id=excluded.session_id,phone_hash=excluded.phone_hash,
                tesla_hash=excluded.tesla_hash,label=excluded.label,status='pending',expires_at=excluded.expires_at,
                vault=excluded.vault,cookie_hash=NULL,state_hash=NULL,revision=0,refresh_until=0
            WHERE phone_slots.expires_at <= ? RETURNING slot`,
        sessionId, await hash(phoneToken), await hash(teslaToken), label, expiresAt, vault, Date.now(), Date.now());
        if (!row) fail(503, 'All Phone Link slots are busy; try again later');
        return json({ sessionId, teslaToken, label, expiresAt, interval: 2,
            phoneUrl: `${env.PHONE_SERVICE_ORIGIN}/phone#session=${sessionId}&phone=${phoneToken}` }, 201);
    }
    async function phoneStart(request) {
        const body = await readJson(request);
        if (!capabilityPattern.test(body.sessionId || '') || !capabilityPattern.test(body.phoneToken || '')) fail(400, 'Invalid pairing');
        const row = await live('session_id', body.sessionId);
        if (!row || row.status !== 'pending' || row.phone_hash !== await hash(body.phoneToken)) fail(401, 'Pairing unavailable');
        const prior = await open(env, row.session_id, row.vault);
        const browser = randomToken(), state = randomToken(), verifier = randomToken(), nonce = randomToken();
        const vault = await seal(env, row.session_id, { verifier, nonce });
        const changed = await first(`UPDATE phone_slots SET status='oauth',phone_hash=NULL,cookie_hash=?,state_hash=?,vault=?
            WHERE session_id=? AND phone_hash=? AND status='pending' AND expires_at>? RETURNING slot`,
        await hash(browser), await hash(state), vault, row.session_id, row.phone_hash, Date.now());
        if (!changed) fail(409, 'Pairing already claimed');
        const url = new URL(`https://login.microsoftonline.com/${env.PHONE_TENANT_ID}/oauth2/v2.0/authorize`);
        url.search = new URLSearchParams({
            client_id: env.PHONE_CLIENT_ID, response_type: 'code', response_mode: 'query',
            redirect_uri: `${env.PHONE_SERVICE_ORIGIN}/oauth/callback`, scope: scopes,
            state, nonce, code_challenge: await hash(verifier), code_challenge_method: 'S256', prompt: 'select_account',
            ...(prior.emailHint ? { login_hint: prior.emailHint } : {}),
        }).toString();
        return setCookie(json({ authorizationUrl: url.href }), browser, pairingLifetime / 1000);
    }
    async function callback(request, url) {
        if (!capabilityPattern.test(url.searchParams.get('state') || '') ||
            ['state', 'code', 'error', 'error_description'].some(k => url.searchParams.getAll(k).length > 1)) fail(400, 'Invalid OAuth response');
        const row = await phoneSession(request);
        if (row.status !== 'oauth' || row.state_hash !== await hash(url.searchParams.get('state'))) fail(400, 'Invalid OAuth state');
        const claimed = await first(`UPDATE phone_slots SET status='exchanging',state_hash=NULL
            WHERE session_id=? AND cookie_hash=? AND state_hash=? AND status='oauth' AND expires_at>? RETURNING slot`,
        row.session_id, row.cookie_hash, row.state_hash, Date.now());
        if (!claimed) fail(409, 'OAuth response already used');
        let stage = 'authorization-response';
        try {
            const code = url.searchParams.get('code');
            if (url.searchParams.has('error') || !code || code.length > 8192) fail(401, 'Microsoft sign-in was declined');
            stage = 'token-exchange';
            const oauth = await open(env, row.session_id, row.vault);
            const result = await token({ grant_type: 'authorization_code', code, code_verifier: oauth.verifier,
                redirect_uri: `${env.PHONE_SERVICE_ORIGIN}/oauth/callback` });
            stage = 'identity-validation';
            const claims = await verifyIdToken(env, result.id_token, oauth.nonce, upstream);
            if (typeof result.refresh_token !== 'string' || !result.refresh_token) fail(401, 'Session cannot be renewed');
            stage = 'profile-verification';
            const profile = await upstream(graphUrl('/me'), { headers: { Authorization: 'Bearer ' + result.access_token } });
            // Personal Graph IDs need not use the organizational oid representation.
            if (typeof profile.id !== 'string' || !profile.id ||
                (claims.tid !== consumerTenant && claims.oid && profile.id.toLowerCase() !== claims.oid.toLowerCase())) fail(401, 'Account verification failed');
            stage = 'confirmation-storage';
            const vault = await seal(env, row.session_id, { accessToken: result.access_token, refreshToken: result.refresh_token,
                tokenExpiresAt: Date.now() + result.expires_in * 1000, csrf: randomToken(),
                profile: { displayName: profile.displayName || '', username: profile.mail || profile.userPrincipalName || profile.id } });
            const changed = await first(`UPDATE phone_slots SET status='confirm',vault=? WHERE session_id=? AND cookie_hash=?
                AND status='exchanging' AND expires_at>? RETURNING slot`, vault, row.session_id, row.cookie_hash, Date.now());
            if (!changed) fail(409, 'Pairing cancelled or expired');
            return redirect('/phone/confirm');
        } catch (error) {
            console.warn('Phone Link callback failed', {
                stage,
                status: error instanceof HttpError ? error.status : 500,
                providerStatus: error instanceof HttpError ? error.providerStatus : undefined,
                providerCodes: error instanceof HttpError ? error.providerCodes : undefined,
            });
            // Fail closed and clear all sensitive state, including on nonce/signature/Graph failures.
            await first(`UPDATE phone_slots SET status='failed',vault=NULL,cookie_hash=NULL,state_hash=NULL
                WHERE session_id=? AND status='exchanging' RETURNING slot`, row.session_id);
            return setCookie(redirect('/phone/result'));
        }
    }
    async function confirm(request) {
        const row = await phoneSession(request);
        if (row.status !== 'confirm') fail(409, 'Sign in first or start a new pairing');
        const body = await open(env, row.session_id, row.vault);
        return page('Approve your dashboard',
            `<p>Signed in as <strong>${escape(body.profile.displayName)}</strong> (${escape(body.profile.username)}).</p>
<p>Match this label on the waiting dashboard: <strong>${escape(row.label)}</strong>.</p>
<p>Approve only if you started this pairing and the label matches. The dashboard will be able to read your profile, mail and calendar until you log out or the session expires.</p>
<form method="post" action="/phone/approve"><input type="hidden" name="csrf" value="${escape(body.csrf)}"><button name="decision" value="approve">Approve dashboard</button> <button name="decision" value="deny">Deny</button></form>`);
    }
    async function approve(request) {
        if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('Content-Type') || '')) fail(415, 'Form required');
        const params = new URLSearchParams(await readBody(request));
        const row = await phoneSession(request);
        if (row.status !== 'confirm') fail(409, 'Pairing is not awaiting approval');
        const body = await open(env, row.session_id, row.vault);
        const decision = params.get('decision');
        if (params.getAll('csrf').length !== 1 || params.get('csrf') !== body.csrf ||
            params.getAll('decision').length !== 1 || !['approve', 'deny'].includes(decision)) fail(403, 'Approval denied');
        const approved = decision === 'approve';
        delete body.csrf;
        const vault = approved ? await seal(env, row.session_id, body) : null;
        const changed = await first(`UPDATE phone_slots SET status=?,vault=?,expires_at=?,cookie_hash=NULL
            WHERE session_id=? AND cookie_hash=? AND status='confirm' AND expires_at>? RETURNING slot`,
        approved ? 'active' : 'denied', vault, approved ? Date.now() + activeLifetime : row.expires_at,
        row.session_id, row.cookie_hash, Date.now());
        if (!changed) fail(409, 'Pairing cancelled, expired or already approved');
        return setCookie(page(approved ? 'Dashboard approved' : 'Pairing denied',
            '<p>You can close this page. No account tokens have been sent to your dashboard.</p>'));
    }
    async function graph(request, id, url) {
        const row = await teslaSession(request, id);
        if (row.status !== 'active') fail(401, 'Dashboard has not been approved');
        const target = graphUrl(url.searchParams.get('path'));
        let body = await open(env, row.session_id, row.vault);
        if (body.tokenExpiresAt <= Date.now() + 60_000) {
            const lease = await first(`UPDATE phone_slots SET refresh_until=? WHERE session_id=? AND revision=?
                AND status='active' AND expires_at>? AND refresh_until<=? RETURNING slot`,
            Date.now() + 30000, row.session_id, row.revision, Date.now(), Date.now());
            if (!lease) fail(409, 'Session renewal in progress; retry shortly');
            try {
                const result = await token({ grant_type: 'refresh_token', refresh_token: body.refreshToken });
                body = { ...body, accessToken: result.access_token, refreshToken: result.refresh_token || body.refreshToken,
                    tokenExpiresAt: Date.now() + result.expires_in * 1000 };
                const changed = await first(`UPDATE phone_slots SET vault=?,revision=revision+1,refresh_until=0
                    WHERE session_id=? AND status='active' AND revision=? AND expires_at>? RETURNING slot`,
                await seal(env, row.session_id, body), row.session_id, row.revision, Date.now());
                if (!changed) fail(401, 'Session cancelled or expired');
            } catch {
                await first(`UPDATE phone_slots SET status='failed',vault=NULL,refresh_until=0
                    WHERE session_id=? AND revision=? RETURNING slot`, row.session_id, row.revision);
                fail(401, 'Session renewal failed; sign in again');
            }
        }
        // Check persistent validity again after renewal, before releasing a Graph request.
        const current = await live('session_id', id);
        if (!current || current.status !== 'active') fail(401, 'Session unavailable');
        body = await open(env, current.session_id, current.vault);
        let result;
        try {
            result = await upstream(target, { headers: { Authorization: 'Bearer ' + body.accessToken, Prefer: 'outlook.timezone="UTC"' } });
        } catch (error) {
            if (error instanceof HttpError && error.status === 401) {
                await first(`UPDATE phone_slots SET status='failed',vault=NULL
                    WHERE session_id=? AND revision=? AND status='active' RETURNING slot`, current.session_id, current.revision);
            }
            throw error;
        }
        const final = await live('session_id', id);
        if (!final || final.status !== 'active') fail(401, 'Session unavailable');
        return json(result);
    }
    async function handle(request, url) {
        const { pathname } = url;
        if (pathname === '/health' && request.method === 'GET') {
            await first('SELECT slot FROM phone_slots LIMIT 1');
            return json({ service: 'office-dashboard-phone-link', version: 1, storage: 'd1', capacity: 10, status: 'ok' });
        }
        if (pathname === '/sessions' && request.method === 'POST') return start(request);
        if (pathname === '/phone' && request.method === 'GET') return landing();
        if (pathname === '/phone/start' && request.method === 'POST') return phoneStart(request);
        if (pathname === '/oauth/callback' && request.method === 'GET') return callback(request, url);
        if (pathname === '/phone/confirm' && request.method === 'GET') return confirm(request);
        if (pathname === '/phone/approve' && request.method === 'POST') return approve(request);
        if (pathname === '/phone/result' && request.method === 'GET') return page('Sign-in not completed', '<p>Sign-in was declined, expired or could not be verified. Start a new Phone Link on the dashboard.</p>');
        const match = /^\/sessions\/([A-Za-z0-9_-]{43})\/(poll|cancel|graph)$/.exec(pathname);
        if (!match) fail(404, 'Not found');
        const row = await teslaSession(request, match[1]);
        if (match[2] === 'poll' && request.method === 'GET') {
            return json({ status: row.status === 'active' ? 'complete' : ['failed', 'denied'].includes(row.status) ? row.status : 'pending',
                expiresAt: row.expires_at });
        }
        if (match[2] === 'cancel' && request.method === 'POST') {
            await first('DELETE FROM phone_slots WHERE session_id=? AND tesla_hash=? RETURNING slot', row.session_id, row.tesla_hash);
            return json({ status: 'cancelled' });
        }
        if (match[2] === 'graph' && request.method === 'GET') return graph(request, match[1], url);
        fail(405, 'Method not allowed');
    }
    return { handle };
}

export default {
    async scheduled(controller, env) {
        await env.PAIRING_DB.prepare('DELETE FROM phone_slots WHERE expires_at <= ?').bind(Date.now()).run();
    },
    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin');
        const api = url.pathname === '/sessions' || url.pathname.startsWith('/sessions/');
        let response;
        try {
            validateConfig(env, url.origin);
            if (api && origin !== env.APP_ORIGIN) fail(403, 'Origin denied');
            if (!api && request.method !== 'GET' && origin !== env.PHONE_SERVICE_ORIGIN) fail(403, 'Phone origin denied');
            if (!api && origin && origin !== env.PHONE_SERVICE_ORIGIN) fail(403, 'Phone origin denied');
            if (request.method === 'OPTIONS') {
                const headers = (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
                const method = request.headers.get('Access-Control-Request-Method');
                const expected = url.pathname === '/sessions' || url.pathname.endsWith('/cancel') ? 'POST' : 'GET';
                if (!api || method !== expected || headers.some(h => !['authorization', 'content-type'].includes(h))) fail(403, 'Preflight denied');
                response = new Response(null, { status: 204, headers: {
                    'Access-Control-Allow-Methods': expected, 'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                    'Access-Control-Max-Age': '600',
                } });
            } else {
                if (url.pathname === '/oauth/callback') {
                    if (url.search.length > 16384) fail(400, 'Invalid OAuth response');
                } else if (url.pathname.endsWith('/graph')) {
                    if (url.searchParams.size !== 1 || url.searchParams.getAll('path').length !== 1) fail(400, 'Invalid Graph query');
                } else if (url.search) fail(400, 'Query parameters not allowed');
                const address = request.headers.get('CF-Connecting-IP');
                if (!address) fail(403, 'Missing network context');
                const limit = await env.PAIRING_RATE_LIMITER.limit({ key: address });
                if (!limit.success) fail(429, 'Too many requests; wait and try again');
                response = await service(env).handle(request, url);
            }
        } catch (error) {
            response = json({ error: error instanceof HttpError || error.status === 400 ? error.message : 'Phone Link unavailable' },
                error instanceof HttpError || error.status === 400 ? error.status : 503);
        }
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', 'no-store');
        headers.set('Referrer-Policy', 'no-referrer');
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('X-Frame-Options', 'DENY');
        headers.set('Strict-Transport-Security', 'max-age=31536000');
        if (!headers.has('Content-Security-Policy')) headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
        if (api && origin === env.APP_ORIGIN) {
            headers.set('Access-Control-Allow-Origin', origin);
            headers.set('Vary', 'Origin');
        }
        return new Response(response.body, { status: response.status, headers });
    },
};
