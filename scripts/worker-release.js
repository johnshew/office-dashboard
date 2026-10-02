import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const workerName = 'office-dashboard-phone-link';
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const commitPattern = /^[0-9a-f]{40}$/;
const artifact = resolve('dist-worker', 'phone-link-release');
const requiredSecrets = ['PHONE_CLIENT_SECRET', 'PHONE_ENCRYPTION_KEY'];
const fail = message => { throw new Error(message); };
const sha256 = data => createHash('sha256').update(data).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function exactOrigin(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.origin === value && !url.username && !url.password &&
            !url.port && url.hostname !== 'localhost' && !url.hostname.endsWith('.localhost');
    } catch { return false; }
}

export function releaseConfig(template, env) {
    if (template.name !== workerName || env.PHONE_WORKER_NAME !== workerName) fail('Explicit Phone Link Worker name required');
    for (const key of ['APP_ORIGIN', 'PHONE_SERVICE_ORIGIN']) {
        if (!exactOrigin(env[key])) fail(`${key} must be an exact HTTPS origin without a port or trailing slash`);
    }
    if (env.APP_ORIGIN === env.PHONE_SERVICE_ORIGIN) fail('Dashboard and Phone Link origins must be separate');
    for (const key of ['PHONE_CLIENT_ID', 'D1_DATABASE_ID']) {
        if (!uuid.test(env[key] || '') || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(env[key])) fail(`${key} must be a nonzero UUID`);
    }
    const audiences = {
        AzureADMultipleOrgs: 'organizations',
        AzureADandPersonalMicrosoftAccount: 'common',
        PersonalMicrosoftAccount: 'consumers'
    };
    if (env.PHONE_ACCOUNT_AUDIENCE === 'AzureADMyOrg') {
        if (!uuid.test(env.PHONE_TENANT_ID || '') || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(env.PHONE_TENANT_ID)) fail('Single-tenant audience requires a tenant UUID');
    } else if (audiences[env.PHONE_ACCOUNT_AUDIENCE] !== env.PHONE_TENANT_ID || !env.PHONE_TENANT_ID) {
        fail('PHONE_TENANT_ID must match the explicitly approved PHONE_ACCOUNT_AUDIENCE');
    }
    if (template.main !== 'index.js' || template.d1_databases?.length !== 1 ||
        template.d1_databases[0].binding !== 'PAIRING_DB' || template.d1_databases[0].database_name !== workerName) {
        fail('Unexpected Worker entry point or D1 binding');
    }
    return {
        ...template, main: './worker.js',
        vars: Object.fromEntries(['APP_ORIGIN', 'PHONE_SERVICE_ORIGIN', 'PHONE_CLIENT_ID', 'PHONE_TENANT_ID'].map(key => [key, env[key]])),
        d1_databases: [{ binding: 'PAIRING_DB', database_name: workerName, database_id: env.D1_DATABASE_ID }]
    };
}

export function releaseOperation(env) {
    if (!['deploy', 'initialize', 'rollback'].includes(env.OPERATION)) fail('Invalid release operation');
    if (env.OPERATION === 'initialize' && env.SCHEMA_CONFIRMATION !== 'apply-reviewed-phone-link-schema') {
        fail('Explicit reviewed additive schema initialization confirmation required');
    }
    if (env.OPERATION === 'rollback') {
        if (!uuid.test(env.ROLLBACK_VERSION_ID || '')) fail('Rollback requires an explicit existing Worker version UUID');
        if (env.ROLLBACK_CONFIRMATION !== 'compatible-schema-and-secrets') fail('Confirm rollback schema/secret compatibility explicitly');
    }
    return env.OPERATION;
}

async function prepare(env) {
    releaseOperation(env);
    // Use the locked Wrangler parser, not a second implementation of JSONC.
    const { experimental_readRawConfig } = await import(pathToFileURL(resolve('node_modules', 'wrangler', 'wrangler-dist', 'cli.js')).href);
    const { rawConfig } = experimental_readRawConfig({ config: join('workers', 'pairing', 'wrangler.jsonc') });
    const config = releaseConfig(rawConfig, env);
    mkdirSync(artifact, { recursive: true });
    writeFileSync(join(artifact, 'wrangler.json'), JSON.stringify(config, null, 2) + '\n');
    if (env.OPERATION === 'deploy') {
        writeFileSync(resolve('dist-worker', 'phone-link-build.json'),
            JSON.stringify({ ...config, main: resolve('workers', 'pairing', 'index.js') }, null, 2) + '\n');
    } else if (env.OPERATION === 'initialize') {
        copyFileSync(join('workers', 'pairing', 'schema.sql'), join(artifact, 'schema.sql'));
    }
}

export function verifyManifest(manifest, files, commit, operation) {
    const expected = operation === 'deploy' ? 'worker.js,wrangler.json' : 'schema.sql,wrangler.json';
    if (!['deploy', 'initialize'].includes(operation) || !commitPattern.test(commit || '') ||
        manifest.commit !== commit || manifest.operation !== operation || manifest.worker !== workerName ||
        Object.keys(manifest.files || {}).sort().join(',') !== expected) fail('Invalid release provenance');
    for (const [file, digest] of Object.entries(manifest.files)) {
        if (sha256(files[file]) !== digest) fail('Release artifact digest mismatch');
    }
}

function seal(env) {
    const operation = releaseOperation(env);
    if (git('rev-parse', 'HEAD') !== env.SOURCE_COMMIT) fail('Artifact source differs from accepted commit');
    const names = operation === 'deploy' ? ['worker.js', 'wrangler.json'] : ['schema.sql', 'wrangler.json'];
    const files = Object.fromEntries(names.map(file => [file, sha256(readFileSync(join(artifact, file)))]));
    writeFileSync(join(artifact, 'release.json'), JSON.stringify({
        worker: workerName, operation, commit: env.SOURCE_COMMIT,
        toolingCommit: env.WORKFLOW_COMMIT, version: JSON.parse(readFileSync('package.json')).version, files
    }, null, 2) + '\n');
}

function verified(env) {
    const manifest = JSON.parse(readFileSync(join(artifact, 'release.json')));
    const names = env.OPERATION === 'deploy' ? ['worker.js', 'wrangler.json'] : ['schema.sql', 'wrangler.json'];
    const files = Object.fromEntries(names.map(file => [file, readFileSync(join(artifact, file))]));
    verifyManifest(manifest, files, env.SOURCE_COMMIT, env.OPERATION);
    return manifest;
}

async function api(env, path, options = {}) {
    if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID || '') || !env.CLOUDFLARE_API_TOKEN) {
        fail('Protected Cloudflare API token and account ID are required');
    }
    try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/${path}`, {
            ...options, redirect: 'error', signal: AbortSignal.timeout(30_000),
            headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }
        });
        const body = await response.json();
        if (!response.ok || body.success !== true) fail('Cloudflare API preflight failed');
        return body.result;
    } catch { fail('Cloudflare API operation failed; verify scoped token/account permissions privately'); }
}

function secretBindings(bindings) {
    if (!Array.isArray(bindings) || requiredSecrets.some(name => !bindings.some(b => b.name === name && b.type === 'secret_text'))) {
        fail('Existing Worker secret bindings are required; configure them independently before release');
    }
}

export async function preflight(env, config, initialize = false) {
    const settings = await api(env, `workers/scripts/${workerName}/settings`);
    secretBindings(settings.bindings);
    const database = await api(env, `d1/database/${config.d1_databases[0].database_id}`);
    if (database.name !== workerName) fail('D1 database is not the dedicated Phone Link database');
    if (!initialize) {
        const result = await api(env, `d1/database/${config.d1_databases[0].database_id}/query`, {
            method: 'POST', body: JSON.stringify({ sql: 'SELECT slot FROM phone_slots LIMIT 0' })
        });
        if (!Array.isArray(result) || result.length !== 1 || result[0].success !== true) fail('Phone Link schema is not ready');
    }
}

export async function readiness(env) {
    for (let attempt = 0; attempt < 6; attempt++) {
        try {
            const response = await fetch(`${env.PHONE_SERVICE_ORIGIN}/health`, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
            const body = await response.json();
            if (response.ok && body.service === workerName && body.status === 'ok' && body.storage === 'd1' && body.capacity === 10) return;
        } catch { /* Retry propagation without logging response bodies. */ }
        if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 5_000));
    }
    fail('Phone Link HTTPS readiness failed; no automatic code/schema/secret rollback attempted');
}

export async function activeVersion(env, versionId) {
    const deployments = await api(env, `workers/scripts/${workerName}/deployments`);
    const current = deployments.deployments?.[0];
    if (!current || !uuid.test(current.id || '') || current.versions?.length !== 1 ||
        current.versions[0].version_id !== versionId || current.versions[0].percentage !== 100) {
        fail('Cloudflare deployment does not match the intended 100% Worker version');
    }
    return current.id;
}

export function rollbackBindings(config, version) {
    const bindings = version.resources?.bindings;
    secretBindings(bindings);
    for (const [name, text] of Object.entries(config.vars)) {
        if (!bindings.some(b => b.name === name && b.type === 'plain_text' && b.text === text)) fail('Rollback version has incompatible public configuration');
    }
    if (!bindings.some(b => b.name === 'PAIRING_DB' && b.type === 'd1' && b.id === config.d1_databases[0].database_id)) fail('Rollback version has incompatible D1 binding');
}

async function check(env) {
    const operation = releaseOperation(env);
    if (operation !== 'rollback') verified(env);
    const config = JSON.parse(readFileSync(join(artifact, 'wrangler.json')));
    await preflight(env, config, operation === 'initialize');
    if (operation === 'rollback') {
        rollbackBindings(config, await api(env, `workers/scripts/${workerName}/versions/${env.ROLLBACK_VERSION_ID}`));
    }
    receipt(env, { operation, commit: env.SOURCE_COMMIT, toolingCommit: env.WORKFLOW_COMMIT,
        readiness: 'preflight passed; subsequent cloud operation and acceptance not confirmed' });
}

function receipt(env, data) {
    writeFileSync(join(artifact, 'deployment.json'), JSON.stringify(data, null, 2) + '\n');
    if (env.GITHUB_STEP_SUMMARY) {
        writeFileSync(env.GITHUB_STEP_SUMMARY,
            `## Phone Link ${data.operation}\n\nSource: \`${data.commit}\`\n\nWorker version: \`${data.versionId || 'unchanged'}\`\n\nReadiness: ${data.readiness}\n`);
    }
}

export function deployedVersion(output) {
    const id = output.match(/Current Version ID:\s*([a-f0-9-]{36})/i)?.[1];
    if (!uuid.test(id || '')) fail('Could not establish deployed Worker version ID');
    return id;
}

async function finish(env) {
    const operation = releaseOperation(env);
    const manifest = operation === 'rollback' ? undefined : verified(env);
    const versionId = operation === 'initialize' ? undefined : operation === 'rollback'
        ? env.ROLLBACK_VERSION_ID : deployedVersion(readFileSync(resolve('dist-worker', 'wrangler-output.txt'), 'utf8'));
    const data = { operation, commit: env.SOURCE_COMMIT, version: manifest?.version, versionId,
        toolingCommit: env.WORKFLOW_COMMIT, files: manifest?.files,
        readiness: 'pending (cloud state changed; investigate failed subsequent checks)' };
    receipt(env, data);
    if (operation === 'initialize') {
        await preflight(env, JSON.parse(readFileSync(join(artifact, 'wrangler.json'))));
        receipt(env, { ...data, readiness: 'D1 initialization passed; no Worker deployment or phone acceptance' });
    } else {
        const deploymentId = await activeVersion(env, versionId);
        await readiness(env);
        receipt(env, { ...data, deploymentId, readiness: 'passed' });
    }
}

export function verifySource(env) {
    if (env.GITHUB_REF !== `refs/heads/${env.DEFAULT_BRANCH}`) fail('Dispatch must use the default branch workflow');
    if (!commitPattern.test(env.WORKFLOW_COMMIT || '')) fail('Invalid workflow provenance');
    const ref = env.SOURCE_REF || '';
    if (!commitPattern.test(ref) && !/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(ref)) fail('Use a full commit SHA or stable existing version tag');
    const source = git('rev-parse', '--verify', `${commitPattern.test(ref) ? ref : `refs/tags/${ref}`}^{commit}`);
    git('merge-base', '--is-ancestor', source, `origin/${env.DEFAULT_BRANCH}`);
    if (!commitPattern.test(ref) && ref !== `v${JSON.parse(git('show', `${source}:package.json`)).version}`) {
        fail('Immutable release tag must match package version');
    }
    writeFileSync(env.GITHUB_OUTPUT, `commit=${source}\n`, { flag: 'a' });
}

export async function main(command, env = process.env) {
    if (command === 'source') return verifySource(env);
    if (command === 'prepare') return prepare(env);
    if (command === 'seal') return seal(env);
    if (command === 'check') return check(env);
    if (command === 'finish') return finish(env);
    fail('Unknown release operation');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main(process.argv[2]).catch(error => {
        console.error(error instanceof Error && /^(Invalid|Explicit|Unexpected|Release|Artifact|Existing|Cloudflare|Phone Link|Protected|Could not|Rollback|Confirm|Single-tenant|PHONE_|APP_|D1_|Dashboard|Dispatch|Use |Immutable|Unknown)/.test(error.message)
            ? error.message : 'Worker release validation failed; inspect source/configuration privately');
        process.exitCode = 1;
    });
}
