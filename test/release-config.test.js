import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateReleaseConfig } from '../scripts/validate-release-config.js';

const config = { VITE_CLIENT_ID: '11111111-2222-3333-4444-555555555555' };

test('release requires an application ID and a supported tenant', () => {
    for (const VITE_CLIENT_ID of ['', 'placeholder']) {
        assert.throws(() => validateReleaseConfig({ VITE_CLIENT_ID }), /VITE_CLIENT_ID/);
    }
    assert.throws(() => validateReleaseConfig({ ...config, VITE_TENANT_ID: 'example.com/path' }), /VITE_TENANT_ID/);
    for (const VITE_TENANT_ID of ['', 'organizations', 'common', 'consumers', config.VITE_CLIENT_ID]) {
        assert.doesNotThrow(() => validateReleaseConfig({ ...config, VITE_TENANT_ID }));
    }
});

test('release permits static-only login and a separately hosted HTTPS device service', () => {
    assert.doesNotThrow(() => validateReleaseConfig(config));
    assert.doesNotThrow(() => validateReleaseConfig({ ...config, VITE_DEVICE_LOGIN_URL: 'https://login.example.com/device' }));
});

test('release rejects insecure or malformed device service URLs', () => {
    for (const VITE_DEVICE_LOGIN_URL of ['invalid', 'http://login.example.com', 'http://localhost:8001',
        'https://localhost:8001', 'https://127.0.0.1', 'https://[::1]', 'https://user:password@example.com',
        'https://example.com?token=secret', 'https://example.com#fragment']) {
        assert.throws(() => validateReleaseConfig({ ...config, VITE_DEVICE_LOGIN_URL }));
    }
});