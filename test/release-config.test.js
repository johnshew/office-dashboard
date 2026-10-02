import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
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
    assert.doesNotThrow(() => validateReleaseConfig({ ...config, VITE_PHONE_LINK_URL: 'https://phone.example.com' }));
    assert.doesNotThrow(() => validateReleaseConfig({ VITE_PHONE_LINK_URL: 'https://phone.example.com' }));
});

test('release rejects insecure or credential-bearing Phone Link URLs', () => {
    for (const VITE_PHONE_LINK_URL of ['http://phone.example.com', 'https://localhost:8001', 'https://phone.example.com#email=test',
        'https://phone.example.com?token=secret', 'https://user:secret@phone.example.com', 'https://phone.example.com/path']) {
        assert.throws(() => validateReleaseConfig({ ...config, VITE_PHONE_LINK_URL }), /VITE_PHONE_LINK_URL/);
    }
});

test('release rejects insecure or malformed device service URLs', () => {
    for (const VITE_DEVICE_LOGIN_URL of ['invalid', 'http://login.example.com', 'http://localhost:8001',
        'https://localhost:8001', 'https://127.0.0.1', 'https://[::1]', 'https://user:password@example.com',
        'https://example.com?token=secret', 'https://example.com#fragment']) {
        assert.throws(() => validateReleaseConfig({ ...config, VITE_DEVICE_LOGIN_URL }));
    }
});

test('publish and rollback provenance checks normalize Pages URLs and require HTTPS redirects', () => {
    for (const workflow of ['pages.yml', 'rollback.yml']) {
        const source = readFileSync(new URL(`../.github/workflows/${workflow}`, import.meta.url), 'utf8');
        const normalization = 'page_url="${PAGE_URL/#http:/https:}"';
        assert.ok(source.includes(normalization), `${workflow}: normalize the returned HTTP Pages URL`);
        const commands = source.split(/\r?\n/).filter(line => line.trim().startsWith('curl ') && line.includes('/release.json?run='));
        assert.equal(commands.length, 1, `${workflow}: exactly one provenance fetch`);
        const command = commands[0];
        for (const flag of ["--proto '=https'", "--proto-redir '=https'", '--location', '--fail']) {
            assert.ok(command.includes(flag), `${workflow}: requires ${flag}`);
        }
        assert.ok(command.includes('${page_url%/}/release.json'), `${workflow}: use the normalized URL`);
        assert.ok(source.indexOf(normalization) < source.indexOf(command), `${workflow}: normalize before fetching`);
    }
});

test('Pages forwards Phone Link configuration so a phone-only release validates', () => {
    const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const variables = {
        VITE_CLIENT_ID: '',
        VITE_TENANT_ID: 'organizations',
        VITE_DEVICE_LOGIN_URL: '',
        VITE_PHONE_LINK_URL: 'https://phone.example.test',
    };
    const forwarded = Object.fromEntries(Array.from(workflow.matchAll(
        /^[ \t]+(VITE_\w+):[ \t]*\$\{\{[ \t]*vars\.(VITE_\w+)[ \t]*\}\}[ \t]*$/gm
    ), ([, name, variable]) => [name, variables[variable]]));
    assert.equal(forwarded.VITE_PHONE_LINK_URL, variables.VITE_PHONE_LINK_URL);
    assert.equal(forwarded.VITE_CLIENT_ID, '');
    assert.doesNotThrow(() => validateReleaseConfig(forwarded));
});