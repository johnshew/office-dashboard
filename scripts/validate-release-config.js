import { pathToFileURL } from 'node:url';

export function validateReleaseConfig(env) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(env.VITE_CLIENT_ID || '')) {
        throw new Error('Set VITE_CLIENT_ID to the production Entra application ID.');
    }
    const tenant = env.VITE_TENANT_ID || 'organizations';
    if (!uuid.test(tenant) && !['organizations', 'common', 'consumers'].includes(tenant)) {
        throw new Error('VITE_TENANT_ID must be a tenant ID or a supported Microsoft account audience.');
    }
    if (env.VITE_DEVICE_LOGIN_URL) {
        const url = new URL(env.VITE_DEVICE_LOGIN_URL);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
            || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
            throw new Error('VITE_DEVICE_LOGIN_URL must be a public HTTPS service URL without credentials, query or fragment.');
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    validateReleaseConfig(process.env);
    console.log('Production identity configuration is valid.');
}