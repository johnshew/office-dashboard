const encoder = new TextEncoder();
export const capabilityPattern = /^[A-Za-z0-9_-]{43}$/;
export const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export const consumerTenant = '9188040d-6c67-4c5b-b112-36a304b66dad';
export function encode(bytes) {
    return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export function decode(value) {
    return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
export const randomToken = () => encode(crypto.getRandomValues(new Uint8Array(32)));
export async function hash(value) {
    return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
async function key(env) {
    if (!capabilityPattern.test(env.PHONE_ENCRYPTION_KEY || '')) throw new Error('Encryption configuration');
    return crypto.subtle.importKey('raw', decode(env.PHONE_ENCRYPTION_KEY), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(env, sessionId, body) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(sessionId) },
        await key(env), encoder.encode(JSON.stringify(body)));
    return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
export async function open(env, sessionId, value) {
    const [iv, encrypted] = value.split('.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv), additionalData: encoder.encode(sessionId) },
        await key(env), decode(encrypted));
    return JSON.parse(new TextDecoder().decode(plain));
}
export async function verifyIdToken(env, jwt, nonce, upstream) {
    if (typeof jwt !== 'string' || jwt.length > 20000) throw new Error('Invalid identity');
    const parts = jwt.split('.');
    if (parts.length !== 3) throw new Error('Invalid identity');
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const tid = claims.tid;
    const tenant = env.PHONE_TENANT_ID.toLowerCase();
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !uuidPattern.test(tid || '') ||
        claims.aud !== env.PHONE_CLIENT_ID || claims.nonce !== nonce ||
        claims.iss !== `https://login.microsoftonline.com/${tid}/v2.0` ||
        !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.nbf) || claims.nbf > now + 60 ||
        !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
        typeof claims.sub !== 'string' || !claims.sub ||
        (uuidPattern.test(tenant) && tid.toLowerCase() !== tenant) ||
        (tenant === 'organizations' && tid.toLowerCase() === consumerTenant) ||
        (tenant === 'consumers' && tid.toLowerCase() !== consumerTenant)) throw new Error('Invalid identity');
    const jwks = await upstream(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`);
    if (!Array.isArray(jwks.keys)) throw new Error('Invalid signing keys');
    const jwk = jwks.keys.find(k => k.kid === header.kid && k.kty === 'RSA' &&
        (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256') &&
        typeof k.issuer === 'string' && k.issuer.replace('{tenantid}', tid) === claims.iss);
    if (!jwk) throw new Error('Invalid signing key');
    const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, decode(parts[2]), encoder.encode(parts[0] + '.' + parts[1]))) {
        throw new Error('Invalid signature');
    }
    return claims;
}
