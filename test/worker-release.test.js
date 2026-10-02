import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { exactOrigin, releaseConfig, releaseOperation, verifyManifest, workerName,
    preflight, readiness, activeVersion, rollbackBindings, verifySource, deployedVersion } from '../scripts/worker-release.js';

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

test('locked Wrangler parses the shared config and preserves scheduling and rate limiting', async () => {
    const { experimental_readRawConfig } = await import('wrangler');
    const { rawConfig } = experimental_readRawConfig({ config: join('workers', 'pairing', 'wrangler.jsonc') });
    const config = releaseConfig(rawConfig, env);
    assert.equal(config.compatibility_date, rawConfig.compatibility_date);
    assert.deepEqual(config.triggers, { crons: ['* * * * *'] });
    assert.deepEqual(config.ratelimits, rawConfig.ratelimits);
    assert.equal(config.ratelimits[0].name, 'PAIRING_RATE_LIMITER');
    assert.equal(config.preview_urls, false);
    assert.equal(config.workers_dev, true);
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

test('target isolation stays enforced without duplicating Wrangler configuration validation', () => {
    assert.deepEqual(releaseConfig({ ...template, compatibility_flags: ['nodejs_compat'] }, env).compatibility_flags, ['nodejs_compat']);
    assert.ok(!JSON.stringify(releaseConfig({ ...template, vars: { PHONE_CLIENT_SECRET: 'no' } }, env)).includes('SECRET'));
    assert.throws(() => releaseConfig({ ...template, main: '../../other.js' }, env));
    assert.throws(() => releaseConfig({ ...template, d1_databases: [...template.d1_databases, template.d1_databases[0]] }, env));
    assert.throws(() => releaseConfig({ ...template, d1_databases: [{ ...template.d1_databases[0], database_name: 'office-dashboard-pairing' }] }, env));
});

test('reviewed initialization is additive and idempotent without changing legacy relay data', () => {
    const schema = readFileSync(join('workers', 'pairing', 'schema.sql'), 'utf8');
    const db = new DatabaseSync(':memory:');
    try {
        db.exec("CREATE TABLE relay_slots (value TEXT); INSERT INTO relay_slots VALUES ('synthetic-legacy-row');");
        db.exec(schema);
        db.exec("INSERT INTO phone_slots (slot, session_id, tesla_hash, label, status, expires_at) VALUES (0, 'synthetic-session', 'synthetic-hash', 'synthetic-label', 'pending', 1)");
        db.exec(schema);
        assert.deepEqual(db.prepare('SELECT value FROM relay_slots').all().map(row => row.value), ['synthetic-legacy-row']);
        assert.deepEqual(db.prepare('SELECT session_id FROM phone_slots').all().map(row => row.session_id), ['synthetic-session']);
        assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'phone_%' ORDER BY name").all().map(row => row.name),
            ['phone_expiry', 'phone_slots']);
        assert.doesNotThrow(() => db.prepare('SELECT slot FROM phone_slots LIMIT 0').all());
    } finally {
        db.close();
    }
});

test('schema initialization is separate from deploy and rollback requires explicit compatible version', () => {
    assert.equal(releaseOperation({ OPERATION: 'deploy' }), 'deploy');
    assert.throws(() => releaseOperation({ OPERATION: 'initialize' }));
    assert.equal(releaseOperation({ OPERATION: 'initialize', SCHEMA_CONFIRMATION: 'apply-reviewed-phone-link-schema' }), 'initialize');
    assert.throws(() => releaseOperation({ OPERATION: 'rollback', ROLLBACK_VERSION_ID: '--help', ROLLBACK_CONFIRMATION: 'compatible-schema-and-secrets' }));
    assert.throws(() => releaseOperation({ OPERATION: 'rollback', ROLLBACK_VERSION_ID: env.D1_DATABASE_ID }));
    assert.equal(releaseOperation({ OPERATION: 'rollback', ROLLBACK_VERSION_ID: env.D1_DATABASE_ID, ROLLBACK_CONFIRMATION: 'compatible-schema-and-secrets' }), 'rollback');
    assert.throws(() => releaseOperation({ OPERATION: 'automatic' }));
});

test('artifact verification binds exact bundle/config bytes to full source commit and operation', () => {
    const commit = 'a'.repeat(40);
    const files = { 'worker.js': Buffer.from('export default {};'), 'wrangler.json': Buffer.from('{}') };
    const manifest = {
        worker: workerName, commit, operation: 'deploy',
        files: Object.fromEntries(Object.entries(files).map(([file, bytes]) => [file, createHash('sha256').update(bytes).digest('hex')]))
    };
    assert.doesNotThrow(() => verifyManifest(manifest, files, commit, 'deploy'));
    assert.throws(() => verifyManifest(manifest, { ...files, 'worker.js': Buffer.from('changed') }, commit, 'deploy'));
    assert.throws(() => verifyManifest(manifest, files, 'b'.repeat(40), 'deploy'));
    assert.throws(() => verifyManifest({ ...manifest, files: { ...manifest.files, '../evil': 'a' } }, files, commit, 'deploy'));
    assert.throws(() => verifyManifest({ ...manifest, worker: 'office-dashboard-pairing' }, files, commit, 'deploy'));
    assert.throws(() => verifyManifest(manifest, files, commit, 'initialize'));
    const sqlFiles = { 'schema.sql': Buffer.from('reviewed initialization'), 'wrangler.json': files['wrangler.json'] };
    const sqlManifest = { ...manifest, operation: 'initialize',
        files: Object.fromEntries(Object.entries(sqlFiles).map(([file, bytes]) => [file, createHash('sha256').update(bytes).digest('hex')])) };
    assert.doesNotThrow(() => verifyManifest(sqlManifest, sqlFiles, commit, 'initialize'));
    assert.throws(() => verifyManifest(sqlManifest, { ...sqlFiles, 'schema.sql': Buffer.from('changed') }, commit, 'initialize'));
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
    assert.equal(calls.length, 2, 'separate initialization permits only pre-initialization schema absence');
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
    mock.mock.mockImplementation(async url => response(url.endsWith('/settings') ? { bindings: secrets } : url.endsWith('/query') ? [] : { name: workerName }));
    await assert.rejects(preflight(apiEnv, config), /schema is not ready/);
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
    mock.mock.mockImplementation(async () => response({ deployments: [{ id: versionId, versions: [{ version_id: env.D1_DATABASE_ID, percentage: 100 }] }] }));
    await assert.rejects(activeVersion(apiEnv, versionId), /intended 100% Worker version/);
    mock.mock.mockImplementation(async () => response({ deployments: [{ id: versionId, versions: [
        { version_id: versionId, percentage: 100 }, { version_id: env.D1_DATABASE_ID, percentage: 0 }
    ] }] }));
    await assert.rejects(activeVersion(apiEnv, versionId), /intended 100% Worker version/);
});

test('readiness rejects healthy-shaped responses from the wrong service or failed storage', async t => {
    const timeout = globalThis.setTimeout;
    t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => timeout(callback, delay === 5_000 ? 0 : delay, ...args));
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
        service: 'office-dashboard-pairing', status: 'ok', storage: 'd1', capacity: 10
    })));
    await assert.rejects(readiness(env), /HTTPS readiness failed/);
    mock.mock.mockImplementation(async () => new Response(JSON.stringify({
        service: workerName, status: 'ok', storage: 'd1', capacity: 10
    }), { status: 503 }));
    await assert.rejects(readiness(env), /HTTPS readiness failed/);
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
    assert.throws(() => rollbackBindings(config, { resources: { bindings: bindings.map(b => b.name === 'PHONE_TENANT_ID' ? { ...b, text: 'common' } : b) } }));
});

test('deployed version must be an explicit UUID from the Wrangler receipt', () => {
    assert.equal(deployedVersion(`Current Version ID: ${env.D1_DATABASE_ID}\n`), env.D1_DATABASE_ID);
    assert.throws(() => deployedVersion('Uploaded successfully, but version unknown'));
    assert.throws(() => deployedVersion('Current Version ID: --help'));
});

test('accepted historical source need not share current tooling, but must belong to default branch with a matching stable tag', () => {
    const directory = mkdtempSync(join(tmpdir(), 'phone-link-source-'));
    const previous = process.cwd();
    const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    try {
        git('init', '--initial-branch=gh-pages');
        git('config', 'user.name', 'Synthetic Release Test');
        git('config', 'user.email', 'release-test@example.invalid');
        writeFileSync(join(directory, 'package.json'), '{"version":"0.4.0"}');
        git('add', '.');
        git('commit', '-m', 'Accepted source');
        const accepted = git('rev-parse', 'HEAD');
        git('tag', 'v0.4.0');
        git('tag', 'v0.5.0');
        writeFileSync(join(directory, 'tooling.js'), 'reviewed tooling change');
        git('add', '.');
        git('commit', '-m', 'New release tooling');
        const tooling = git('rev-parse', 'HEAD');
        git('update-ref', 'refs/remotes/origin/gh-pages', tooling);
        const sourceEnv = { GITHUB_REF: 'refs/heads/gh-pages', DEFAULT_BRANCH: 'gh-pages',
            WORKFLOW_COMMIT: tooling, SOURCE_REF: accepted, GITHUB_OUTPUT: join(directory, 'output.txt') };
        process.chdir(directory);
        assert.doesNotThrow(() => verifySource(sourceEnv));
        assert.match(readFileSync(sourceEnv.GITHUB_OUTPUT, 'utf8'), new RegExp(`commit=${accepted}`));
        assert.doesNotThrow(() => verifySource({ ...sourceEnv, SOURCE_REF: 'v0.4.0' }));
        assert.throws(() => verifySource({ ...sourceEnv, SOURCE_REF: 'v0.5.0' }));
        assert.throws(() => verifySource({ ...sourceEnv, SOURCE_REF: 'gh-pages' }));
        assert.throws(() => verifySource({ ...sourceEnv, GITHUB_REF: 'refs/heads/feature' }));
        git('checkout', '-b', 'unaccepted');
        writeFileSync(join(directory, 'unaccepted.txt'), 'not on default branch');
        git('add', 'unaccepted.txt');
        git('commit', '-m', 'Unaccepted source');
        assert.throws(() => verifySource({ ...sourceEnv, SOURCE_REF: git('rev-parse', 'HEAD') }));
    } finally {
        process.chdir(previous);
        rmSync(directory, { recursive: true, force: true });
    }
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
    assert.match(workflow, /deploy --no-bundle --config/);
    assert.match(workflow, /rollback "\$ROLLBACK_VERSION_ID" --yes/);
    assert.match(workflow, /d1 execute PAIRING_DB --remote/);
    assert.match(workflow, /options: \[deploy, initialize, rollback\]/);
    assert.doesNotMatch(workflow, /apply_schema|npm run build:worker|worker-release\.js bundle/);
    assert.match(workflow, /git show "\$WORKFLOW_COMMIT:scripts\/worker-release\.js"/);
    assert.match(workflow, /if: inputs.operation == 'deploy'/);
    assert.match(helper, /experimental_readRawConfig/);
    assert.doesNotMatch(helper, /parseJSONC|safeSchema|function wrangler|Release workflow\/helpers differ/);
    assert.equal((workflow.match(/run: npm ci/g) || []).length, 1);
    assert.equal((workflow.match(/secrets\.CLOUDFLARE_API_TOKEN/g) || []).length, 1);
});
