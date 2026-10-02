import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exactOrigin, releaseConfig, safeSchema, verifyManifest, workerName, parseJSONC,
    preflight, readiness, activeVersion, rollbackBindings } from '../scripts/worker-release.js';

const env = {
    PHONE_WORKER_NAME: workerName,
    APP_ORIGIN: 'https://dashboard.example.com',
    PHONE_SERVICE_ORIGIN: 'https://phone.example.com',
    PHONE_CLIENT_ID: '11111111-1111-4111-8111-111111111111',
    PHONE_TENANT_ID: 'organizations',
    PHONE_ACCOUNT_AUDIENCE: 'AzureADMultipleOrgs',
    D1_DATABASE_ID: '22222222-2222-4222-8222-222222222222'
};
const template = {
    name: workerName, main: 'index.js', compatibility_date: '2026-09-13',
    vars: { APP_ORIGIN: '', PHONE_CLIENT_ID: '', PHONE_TENANT_ID: '', PHONE_SERVICE_ORIGIN: '' },
    d1_databases: [{ binding: 'PAIRING_DB', database_name: workerName, database_id: '' }]
};

test('reviewed JSONC parsing preserves quoted URLs/escapes and handles comments/trailing commas', () => {
    assert.deepEqual(parseJSONC('{"url":"https://phone.example.com", /* reviewed */ "text":"\\\\\\"//", "list":[1,],} // end'), {
        url: 'https://phone.example.com', text: '\\"//', list: [1]
    });
    assert.doesNotThrow(() => parseJSONC(readFileSync(join('workers', 'pairing', 'wrangler.jsonc'), 'utf8')));
    assert.throws(() => parseJSONC('{"x": 1 /* unfinished'));
    assert.throws(() => parseJSONC('{"x": undefined}'));
});

test('release configuration requires every explicit public production setting', () => {
    const config = releaseConfig(template, env);
    assert.equal(config.main, './worker.js');
    assert.deepEqual(config.vars, {
        APP_ORIGIN: env.APP_ORIGIN, PHONE_SERVICE_ORIGIN: env.PHONE_SERVICE_ORIGIN,
        PHONE_CLIENT_ID: env.PHONE_CLIENT_ID, PHONE_TENANT_ID: env.PHONE_TENANT_ID
    });
    assert.equal(config.d1_databases[0].database_id, env.D1_DATABASE_ID);
    assert.ok(!JSON.stringify(config).includes('SECRET'));
    for (const key of Object.keys(env)) assert.throws(() => releaseConfig(template, { ...env, [key]: '' }), undefined, key);
});

test('release fails closed for URL/path/UUID/Worker-name injections and old service', () => {
    for (const origin of ['http://phone.example.com', 'https://phone.example.com/', 'https://phone.example.com/path',
        'https://user:password@phone.example.com', 'https://phone.example.com?x=1', 'https://phone.example.com#x',
        'https://phone.example.com:8443', 'https://localhost', '--config evil.json', 'https://PHONE.example.com']) {
        assert.equal(exactOrigin(origin), false, origin);
        assert.throws(() => releaseConfig(template, { ...env, PHONE_SERVICE_ORIGIN: origin }));
    }
    for (const id of ['--help', '../database', '00000000-0000-0000-0000-000000000000']) {
        assert.throws(() => releaseConfig(template, { ...env, D1_DATABASE_ID: id }));
    }
    assert.throws(() => releaseConfig(template, { ...env, PHONE_WORKER_NAME: 'office-dashboard-pairing' }));
    assert.throws(() => releaseConfig({ ...template, name: 'office-dashboard-pairing' }, env));
    assert.throws(() => releaseConfig(template, { ...env, PHONE_SERVICE_ORIGIN: env.APP_ORIGIN }));
});

test('account audience is explicit and consistent with tenant authority', () => {
    for (const [audience, tenant] of [
        ['AzureADMyOrg', '33333333-3333-4333-8333-333333333333'],
        ['AzureADMultipleOrgs', 'organizations'],
        ['AzureADandPersonalMicrosoftAccount', 'common'],
        ['PersonalMicrosoftAccount', 'consumers']
    ]) {
        assert.doesNotThrow(() => releaseConfig(template, { ...env, PHONE_ACCOUNT_AUDIENCE: audience, PHONE_TENANT_ID: tenant }));
    }
    for (const [audience, tenant] of [['AzureADMyOrg', 'common'], ['AzureADMultipleOrgs', 'consumers'],
        ['AzureADandPersonalMicrosoftAccount', 'organizations'], ['PersonalMicrosoftAccount', env.PHONE_CLIENT_ID]]) {
        assert.throws(() => releaseConfig(template, { ...env, PHONE_ACCOUNT_AUDIENCE: audience, PHONE_TENANT_ID: tenant }));
    }
});

test('unreviewed config hooks, extra bindings and secret variables are rejected', () => {
    assert.throws(() => releaseConfig({ ...template, build: { command: 'malicious' } }, env));
    assert.throws(() => releaseConfig({ ...template, vars: { PHONE_CLIENT_SECRET: 'no' } }, env));
    assert.throws(() => releaseConfig({ ...template, main: '../../other.js' }, env));
    assert.throws(() => releaseConfig({ ...template, d1_databases: [...template.d1_databases, template.d1_databases[0]] }, env));
    assert.throws(() => releaseConfig({ ...template, d1_databases: [{ ...template.d1_databases[0], database_name: 'office-dashboard-pairing' }] }, env));
});

test('only the existing additive initialization schema is permitted', () => {
    const schema = readFileSync(join('workers', 'pairing', 'schema.sql'), 'utf8');
    assert.doesNotThrow(() => safeSchema(schema));
    for (const addition of ['DROP TABLE phone_slots;', 'DELETE FROM phone_slots;', 'ALTER TABLE phone_slots ADD x TEXT;', 'PRAGMA foreign_keys=OFF;']) {
        assert.throws(() => safeSchema(schema + addition));
    }
    assert.throws(() => safeSchema(schema.replace('phone_slots', 'relay_slots')));
});

test('artifact verification binds exact bundle/config/schema bytes to full source commit', () => {
    const commit = 'a'.repeat(40);
    const files = { 'worker.js': Buffer.from('export default {};'), 'wrangler.json': Buffer.from('{}'), 'schema.sql': Buffer.from('schema') };
    const manifest = {
        worker: workerName, commit,
        files: Object.fromEntries(Object.entries(files).map(([file, bytes]) => [file, createHash('sha256').update(bytes).digest('hex')]))
    };
    assert.doesNotThrow(() => verifyManifest(manifest, files, commit));
    assert.throws(() => verifyManifest(manifest, { ...files, 'worker.js': Buffer.from('changed') }, commit));
    assert.throws(() => verifyManifest(manifest, files, 'b'.repeat(40)));
    assert.throws(() => verifyManifest({ ...manifest, files: { ...manifest.files, '../evil': 'a' } }, files, commit));
    assert.throws(() => verifyManifest({ ...manifest, worker: 'office-dashboard-pairing' }, files, commit));
});

const secrets = ['PHONE_CLIENT_SECRET', 'PHONE_ENCRYPTION_KEY'].map(name => ({ name, type: 'secret_text' }));
const apiEnv = { ...env, CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'synthetic-test-token' };
const response = result => new Response(JSON.stringify({ success: true, result }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
});

test('preflight checks existing secret names, dedicated D1 and schema without logging credentials', async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith('/settings')) return response({ bindings: secrets });
        if (url.endsWith('/query')) return response([{ success: true, results: [] }]);
        return response({ name: workerName });
    });
    await preflight(apiEnv, releaseConfig(template, env));
    assert.equal(calls.length, 3);
    assert.equal(calls[2].options.method, 'POST');
    assert.equal(JSON.parse(calls[2].options.body).sql, 'SELECT slot FROM phone_slots LIMIT 0');
    assert.equal(calls[0].options.redirect, 'error');
    assert.ok(!calls[0].url.includes(apiEnv.CLOUDFLARE_API_TOKEN));
    calls.length = 0;
    await preflight(apiEnv, releaseConfig(template, env), true);
    assert.equal(calls.length, 2, 'explicit schema approval permits only pre-migration schema absence');
});

test('preflight rejects missing secrets, wrong database and masked API failures', async t => {
    const config = releaseConfig(template, env);
    const mock = t.mock.method(globalThis, 'fetch', async () => response({ bindings: [secrets[0]] }));
    await assert.rejects(preflight(apiEnv, config), /Existing Worker secret bindings/);
    mock.mock.mockImplementation(async url => response(url.endsWith('/settings') ? { bindings: secrets } : { name: 'office-dashboard-pairing' }));
    await assert.rejects(preflight(apiEnv, config), /dedicated Phone Link/);
    mock.mock.mockImplementation(async () => new Response('private provider error synthetic-test-token', { status: 403 }));
    await assert.rejects(preflight(apiEnv, config), error => !error.message.includes('synthetic-test-token') && /Cloudflare API operation failed/.test(error.message));
    await assert.rejects(preflight({ ...apiEnv, CLOUDFLARE_API_TOKEN: '' }, config), /Protected Cloudflare/);
});

test('readiness requires real HTTPS health and active deployment is the explicit 100% version', async t => {
    const versionId = '44444444-4444-4444-8444-444444444444';
    const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(options.redirect, 'error');
        assert.equal(url, `${env.PHONE_SERVICE_ORIGIN}/health`);
        return new Response(JSON.stringify({ service: workerName, status: 'ok', storage: 'd1', capacity: 10 }));
    });
    await readiness(env);
    mock.mock.mockImplementation(async () => response({ deployments: [{ id: versionId, versions: [{ version_id: versionId, percentage: 100 }] }] }));
    assert.equal(await activeVersion(apiEnv, versionId), versionId);
    mock.mock.mockImplementation(async () => response({ deployments: [{ id: versionId, versions: [{ version_id: versionId, percentage: 50 }] }] }));
    await assert.rejects(activeVersion(apiEnv, versionId), /intended 100% Worker version/);
});

test('rollback checks existing version public config, secrets and dedicated database compatibility', () => {
    const config = releaseConfig(template, env);
    const bindings = [...secrets, ...Object.entries(config.vars).map(([name, text]) => ({ name, text, type: 'plain_text' })),
        { name: 'PAIRING_DB', type: 'd1', id: env.D1_DATABASE_ID }];
    assert.doesNotThrow(() => rollbackBindings(config, { resources: { bindings } }));
    for (const name of [...Object.keys(config.vars), 'PHONE_ENCRYPTION_KEY', 'PAIRING_DB']) {
        assert.throws(() => rollbackBindings(config, { resources: { bindings: bindings.filter(b => b.name !== name) } }), undefined, name);
    }
    assert.throws(() => rollbackBindings(config, { resources: { bindings: bindings.map(b => b.type === 'd1' ? { ...b, id: env.PHONE_CLIENT_ID } : b) } }));
});

test('workflow keeps Worker/manual approvals, no OAuth secret injection, and immutable no-bundle deployment', () => {
    const workflow = readFileSync(join('.github', 'workflows', 'phone-link.yml'), 'utf8');
    const helper = readFileSync(join('scripts', 'worker-release.js'), 'utf8');
    assert.match(workflow, /workflow_dispatch:/);
    assert.doesNotMatch(workflow, /^\s+(push|pull_request):/m);
    assert.match(workflow, /name: cloudflare-phone-link/);
    assert.match(workflow, /group: production-cloudflare-phone-link/);
    assert.match(workflow, /cancel-in-progress: false/);
    assert.match(workflow, /github\.workflow_sha/);
    assert.match(workflow, /required_reviewers/);
    assert.match(workflow, /\(\.reviewers \| length\) > 0/);
    assert.doesNotMatch(workflow, /prevent_self_review == true/);
    assert.doesNotMatch(workflow, /secrets\.PHONE_(CLIENT_SECRET|ENCRYPTION_KEY)|wrangler login|npx/);
    assert.match(helper, /'deploy', '--no-bundle'/);
    assert.match(helper, /'rollback', env\.ROLLBACK_VERSION_ID, '--yes'/);
    assert.match(helper, /'--remote'/);
});
