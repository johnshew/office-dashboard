const capabilityPattern = /^[A-Za-z0-9_-]{43}$/;
const sessionPattern = /^[a-f0-9]{64}$/;
const lifetime = 600_000;

function randomToken() {
    return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
        .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function hash(value) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function json(body, status = 200) {
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function readJson(request) {
    if (request.headers.get('Content-Type') !== 'application/json' || !request.body) throw new Error('Invalid body');
    const reader = request.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 8192) {
            await reader.cancel();
            throw new Error('Body too large');
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
    return body;
}

async function handleSession(request, env, url) {
    const database = env.PAIRING_DB;
    if (url.pathname === '/sessions' && request.method === 'POST') {
        let body;
        try { body = await readJson(request); } catch { return json({ error: 'Invalid request' }, 400); }
        if (typeof body.challenge !== 'string' || !capabilityPattern.test(body.challenge)) {
            return json({ error: 'Invalid challenge' }, 400);
        }
        const sessionId = await hash(randomToken());
        const phoneToken = randomToken();
        const teslaToken = randomToken();
        const state = randomToken();
        const phoneHash = await hash(phoneToken);
        const teslaHash = await hash(teslaToken);
        const now = Date.now();
        const expiresAt = now + lifetime;
        let allocated;
        try {
            allocated = await database.prepare(`
            WITH candidate(slot) AS (VALUES (0), (1), (2), (3), (4), (5), (6), (7), (8), (9))
            INSERT INTO relay_slots (slot, session_id, phone_hash, tesla_hash, challenge, state, expires_at)
            SELECT candidate.slot, ?, ?, ?, ?, ?, ?
            FROM candidate
            WHERE NOT EXISTS (SELECT 1 FROM relay_slots
                WHERE slot = candidate.slot AND expires_at > ?)
            ORDER BY candidate.slot LIMIT 1
            ON CONFLICT(slot) DO UPDATE SET session_id = excluded.session_id,
                phone_hash = excluded.phone_hash, tesla_hash = excluded.tesla_hash,
                challenge = excluded.challenge, state = excluded.state,
                expires_at = excluded.expires_at, code = NULL
            WHERE relay_slots.expires_at <= ?
            RETURNING slot
            `).bind(sessionId, phoneHash, teslaHash, body.challenge, state, expiresAt, now, now).first();
        } catch {
            return json({ error: 'Service unavailable', stage: 'allocation' }, 503);
        }
        if (!allocated) {
            const response = json({ error: 'All relay slots are busy' }, 503);
            response.headers.set('Retry-After', '60');
            return response;
        }
        return json({ sessionId, slot: allocated.slot, phoneToken, teslaToken, state, expiresAt, interval: 2 }, 201);
    }
    const match = /^\/sessions\/([^/]+)\/(phone|complete|poll|cancel)$/.exec(url.pathname);
    if (!match || !sessionPattern.test(match[1])) return json({ error: 'Not found' }, 404);
    const sessionId = match[1];
    const action = match[2];
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const token = authorization.slice(7);
    if (!capabilityPattern.test(token)) return json({ error: 'Unauthorized' }, 401);
    const tokenHash = await hash(token);
    const session = await database.prepare(`
        SELECT phone_hash, tesla_hash, challenge, state, expires_at
        FROM relay_slots WHERE session_id = ? AND expires_at > ?
    `).bind(sessionId, Date.now()).first();
    if (!session) return json({ error: 'Session unavailable' }, 404);
    const expectedHash = action === 'phone' || action === 'complete' ? session.phone_hash : session.tesla_hash;
    if (tokenHash !== expectedHash) return json({ error: 'Unauthorized' }, 401);
    if (action === 'phone' && request.method === 'GET') {
        return json({ challenge: session.challenge, state: session.state, expiresAt: session.expires_at });
    }
    if (action === 'complete' && request.method === 'POST') {
        let body;
        try { body = await readJson(request); } catch { return json({ error: 'Invalid request' }, 400); }
        if (body.state !== session.state || body.approved !== true || typeof body.code !== 'string'
            || !body.code.length || body.code.length > 4096 || /[\s\x00-\x1f\x7f]/.test(body.code)) {
            return json({ error: 'Invalid completion' }, 400);
        }
        const now = Date.now();
        const completed = await database.prepare(`
            UPDATE relay_slots SET code = ?, expires_at = MIN(expires_at, ?)
            WHERE session_id = ? AND phone_hash = ? AND state = ? AND expires_at > ? AND code IS NULL
            RETURNING slot
        `).bind(body.code, now + 60_000, sessionId, tokenHash, body.state, now).first();
        return completed ? json({ status: 'ready' }) : json({ error: 'Session unavailable or already completed' }, 409);
    }
    if (action === 'poll' && request.method === 'GET') {
        const consumed = await database.prepare(`
            DELETE FROM relay_slots WHERE session_id = ? AND tesla_hash = ?
                AND expires_at > ? AND code IS NOT NULL RETURNING code, state
        `).bind(sessionId, tokenHash, Date.now()).first();
        if (consumed) return json({ status: 'ready', code: consumed.code, state: consumed.state });
        const pending = await database.prepare(`
            SELECT expires_at FROM relay_slots WHERE session_id = ? AND tesla_hash = ? AND expires_at > ?
        `).bind(sessionId, tokenHash, Date.now()).first();
        return pending ? json({ status: 'pending', expiresAt: pending.expires_at }) : json({ error: 'Session unavailable' }, 404);
    }
    if (action === 'cancel' && request.method === 'POST') {
        await database.prepare('DELETE FROM relay_slots WHERE session_id = ? AND tesla_hash = ?')
            .bind(sessionId, tokenHash).run();
        return json({ status: 'cancelled' });
    }
    return json({ error: 'Not found' }, 404);
}

export default {
    async scheduled(controller, env) {
        await env.PAIRING_DB.prepare('DELETE FROM relay_slots WHERE expires_at <= ?').bind(Date.now()).run();
    },
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/health' && request.method === 'GET') {
            try {
                await env.PAIRING_DB.prepare('SELECT slot FROM relay_slots LIMIT 1').first();
                return json({ service: 'office-dashboard-pairing', version: 2, storage: 'd1', capacity: 10, status: 'ok' });
            } catch {
                return json({ error: 'Storage unavailable' }, 503);
            }
        }
        const origin = request.headers.get('Origin');
        if (!origin || origin !== env.APP_ORIGIN) return json({ error: 'Origin denied' }, 403);
        const respond = response => {
            const headers = new Headers(response.headers);
            headers.set('Access-Control-Allow-Origin', origin);
            headers.set('Vary', 'Origin');
            headers.set('Cache-Control', 'no-store');
            headers.set('X-Content-Type-Options', 'nosniff');
            return new Response(response.body, { status: response.status, headers });
        };
        if (request.method === 'OPTIONS') {
            return respond(new Response(null, { status: 204, headers: {
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Max-Age': '600',
            } }));
        }
        if (url.search) return respond(json({ error: 'Query parameters not allowed' }, 400));
        let stage = 'rate_limit';
        try {
            const address = request.headers.get('CF-Connecting-IP');
            if (!address) return respond(json({ error: 'Missing network context' }, 403));
            const limit = await env.PAIRING_RATE_LIMITER.limit({ key: address });
            if (!limit.success) return respond(json({ error: 'Too many requests' }, 429));
            stage = 'session';
            return respond(await handleSession(request, env, url));
        } catch {
            return respond(json({ error: 'Service unavailable', stage }, 503));
        }
    },
};