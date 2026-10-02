import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const workerName = 'office-dashboard-phone-link';
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const commitPattern = /^[0-9a-f]{40}$/;
const artifact = resolve('dist-worker', 'phone-link-release');
const buildConfig = resolve('dist-worker', 'phone-link-build.json');
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
    const allowed = ['name', 'main', 'compatibility_date', 'workers_dev', 'preview_urls', 'vars',
        'observability', 'd1_databases', 'triggers', 'ratelimits'];
    if (Object.keys(template).some(key => !allowed.includes(key))) fail('Unreviewed Worker configuration key');
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
    } else if (!audiences[env.PHONE_ACCOUNT_AUDIENCE] || audiences[env.PHONE_ACCOUNT_AUDIENCE] !== env.PHONE_TENANT_ID) {
        fail('PHONE_TENANT_ID must match the explicitly approved PHONE_ACCOUNT_AUDIENCE');
    }
    if (template.main !== 'index.js' || template.d1_databases?.length !== 1 ||
        template.d1_databases[0].binding !== 'PAIRING_DB' || template.d1_databases[0].database_name !== workerName) {
        fail('Unexpected Worker entry point or D1 binding');
    }
    if (Object.keys(template.vars || {}).some(key => !['APP_ORIGIN', 'PHONE_SERVICE_ORIGIN', 'PHONE_CLIENT_ID', 'PHONE_TENANT_ID'].includes(key))) {
        fail('Unreviewed public variable; secrets must remain Cloudflare-managed');
    }
    return {
        ...template,
        main: './worker.js',
        vars: Object.fromEntries(['APP_ORIGIN', 'PHONE_SERVICE_ORIGIN', 'PHONE_CLIENT_ID', 'PHONE_TENANT_ID'].map(key => [key, env[key]])),
        d1_databases: [{ binding: 'PAIRING_DB', database_name: workerName, database_id: env.D1_DATABASE_ID }]
    };
}

export function parseJSONC(text) {
    let clean = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            clean += char;
            if (char === '\\') clean += text[++i] || '';
            else if (char === '"') quoted = false;
        } else if (char === '"') {
            quoted = true;
            clean += char;
        } else if (char === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') i++;
            clean += '\n';
        } else if (char === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            if (end < 0) fail('Invalid reviewed Worker configuration');
            clean += ' ';
            i = end + 1;
        } else clean += char;
    }
    let json = '';
    quoted = false;
    for (let i = 0; i < clean.length; i++) {
        const char = clean[i];
        if (quoted) {
            json += char;
            if (char === '\\') json += clean[++i] || '';
            else if (char === '"') quoted = false;
        } else if (char === '"') {
            quoted = true;
            json += char;
        } else if (char !== ',' || !/^\s*[}\]]/.test(clean.slice(i + 1))) json += char;
    }
    try { return JSON.parse(json); } catch { fail('Invalid reviewed Worker configuration'); }
}

function templateConfig() {
    return parseJSONC(readFileSync(join('workers', 'pairing', 'wrangler.jsonc'), 'utf8'));
}

export function safeSchema(text) {
    const statements = text.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
    if (statements.length !== 2 ||
        !/^CREATE TABLE IF NOT EXISTS phone_slots\s*\(/i.test(statements[0]) ||
        !/^CREATE INDEX IF NOT EXISTS phone_expiry ON phone_slots\(expires_at\)$/i.test(statements[1]) ||
        /\b(DROP|DELETE|UPDATE|INSERT|ALTER|REPLACE|ATTACH|PRAGMA)\b/i.test(statements.join('\n'))) {
        fail('Schema is not the reviewed additive Phone Link initialization; migration needs a separate reviewed workflow change');
    }
}

export function verifyManifest(manifest, files, commit) {
    if (!commitPattern.test(commit || '') || manifest.commit !== commit || manifest.worker !== workerName ||
        Object.keys(manifest.files || {}).sort().join(',') !== 'schema.sql,worker.js,wrangler.json') fail('Invalid release provenance');
    for (const [file, digest] of Object.entries(manifest.files)) {
        if (sha256(files[file]) !== digest) fail('Release artifact digest mismatch');
    }
}

function prepare(env) {
    const config = releaseConfig(templateConfig(), env);
    mkdirSync(artifact, { recursive: true });
    writeFileSync(join(artifact, 'wrangler.json'), JSON.stringify(config, null, 2) + '\n');
    copyFileSync(join('workers', 'pairing', 'schema.sql'), join(artifact, 'schema.sql'));
    safeSchema(readFileSync(join(artifact, 'schema.sql'), 'utf8'));
    writeFileSync(buildConfig, JSON.stringify({ ...config, main: resolve('workers', 'pairing', 'index.js') }, null, 2) + '\n');
}

function wrangler(args, env = process.env) {
    const cli = resolve('node_modules', 'wrangler', 'bin', 'wrangler.js');
    if (!existsSync(cli)) fail('Locked Wrangler dependency is missing; run npm ci');
    try {
        return execFileSync(process.execPath, [cli, ...args], {
            encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...env, CI: 'true', WRANGLER_SEND_METRICS: 'false' }, maxBuffer: 8 * 1024 * 1024
        });
    } catch {
        // Wrangler/API failures may contain account details or capabilities.
        fail('Wrangler operation failed; no credential-bearing diagnostic output was published');
    }
}

function bundle() {
    wrangler(['deploy', '--dry-run', '--config', buildConfig, '--outdir', join(artifact, 'bundle')]);
    copyFileSync(join(artifact, 'bundle', 'index.js'), join(artifact, 'worker.js'));
    rmSync(join(artifact, 'bundle'), { recursive: true });
    rmSync(buildConfig);
    wrangler(['deploy', '--dry-run', '--no-bundle', '--config', join(artifact, 'wrangler.json')]);
    const commit = git('rev-parse', 'HEAD');
    if (!commitPattern.test(commit)) fail('Expected exact source commit');
    const version = JSON.parse(readFileSync('package.json')).version;
    if (!/^\d+\.\d+\.\d+$/.test(version || '')) fail('Invalid package version for release provenance');
    const files = Object.fromEntries(['worker.js', 'wrangler.json', 'schema.sql'].map(file => [file, sha256(readFileSync(join(artifact, file)))]));
    writeFileSync(join(artifact, 'release.json'), JSON.stringify({
        worker: workerName, commit, version, files
    }, null, 2) + '\n');
}

function verified(env) {
    const manifest = JSON.parse(readFileSync(join(artifact, 'release.json')));
    const files = Object.fromEntries(['worker.js', 'wrangler.json', 'schema.sql'].map(file => [file, readFileSync(join(artifact, file))]));
    verifyManifest(manifest, files, env.SOURCE_COMMIT);
    const config = JSON.parse(files['wrangler.json']);
    if (JSON.stringify(config) !== JSON.stringify(releaseConfig(templateConfig(), env))) fail('Artifact configuration differs from reviewed environment');
    safeSchema(files['schema.sql'].toString());
    return { manifest, config };
}

function credentials(env) {
    if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID || '') || !env.CLOUDFLARE_API_TOKEN) fail('Protected Cloudflare API token and account ID are required');
}

async function api(env, path, options = {}) {
    credentials(env);
    let response;
    try {
        response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/${path}`, {
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

export async function preflight(env, config, allowSchema = false) {
    const settings = await api(env, `workers/scripts/${workerName}/settings`);
    secretBindings(settings.bindings);
    const database = await api(env, `d1/database/${config.d1_databases[0].database_id}`);
    if (database.name !== workerName) fail('D1 database is not the dedicated Phone Link database');
    if (!allowSchema) {
        const result = await api(env, `d1/database/${config.d1_databases[0].database_id}/query`, {
            method: 'POST', body: JSON.stringify({ sql: 'SELECT slot FROM phone_slots LIMIT 0' })
        });
        if (!Array.isArray(result) || result.some(item => item.success !== true)) fail('Phone Link schema is not ready');
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

function receipt(env, data) {
    writeFileSync(join(artifact, 'deployment.json'), JSON.stringify(data, null, 2) + '\n');
    if (env.GITHUB_STEP_SUMMARY) {
        writeFileSync(env.GITHUB_STEP_SUMMARY, `## Phone Link ${data.operation}\n\nWorker: \`${workerName}\`\n\nSource: \`${data.commit}\`\n\nVersion ID: \`${data.versionId}\`\n\nArtifact SHA-256: \`${data.artifactDigest || 'existing Cloudflare version (no rebuild)'}\`\n\nReadiness: ${data.readiness}\n`);
    }
}

async function deploy(env) {
    const { manifest, config } = verified(env);
    const applySchema = env.APPLY_SCHEMA === 'true';
    if (!['true', 'false'].includes(env.APPLY_SCHEMA)) fail('Explicit schema decision required');
    if (applySchema && env.SCHEMA_CONFIRMATION !== 'apply-reviewed-phone-link-schema') fail('Explicit reviewed schema confirmation required');
    await preflight(env, config, applySchema);
    if (applySchema) {
        wrangler(['d1', 'execute', 'PAIRING_DB', '--remote', '--config', join(artifact, 'wrangler.json'),
            '--file', join(artifact, 'schema.sql'), '--yes'], env);
        await preflight(env, config);
    }
    const output = wrangler(['deploy', '--no-bundle', '--config', join(artifact, 'wrangler.json'),
        '--tag', `commit-${manifest.commit}`, '--message', `Phone Link accepted commit ${manifest.commit}`], env);
    const versionId = output.match(/Current Version ID:\s*([a-f0-9-]{36})/i)?.[1];
    if (!uuid.test(versionId || '')) fail('Could not establish deployed Worker version ID');
    const data = { operation: 'deploy', commit: manifest.commit, version: manifest.version, versionId,
        artifactDigest: sha256(readFileSync(join(artifact, 'release.json'))), files: manifest.files,
        schemaApplied: applySchema, readiness: 'pending (deployment changed; investigate any failed subsequent check)' };
    receipt(env, data);
    const deploymentId = await activeVersion(env, versionId);
    await readiness(env);
    receipt(env, { ...data, deploymentId, readiness: 'passed' });
}

export function rollbackBindings(config, version) {
    const bindings = version.resources?.bindings;
    secretBindings(bindings);
    for (const [name, text] of Object.entries(config.vars)) {
        if (!bindings.some(b => b.name === name && b.type === 'plain_text' && b.text === text)) fail('Rollback version has incompatible public configuration');
    }
    if (!bindings.some(b => b.name === 'PAIRING_DB' && b.type === 'd1' && b.id === config.d1_databases[0].database_id)) fail('Rollback version has incompatible D1 binding');
}

async function rollback(env) {
    const config = releaseConfig(templateConfig(), env);
    if (!uuid.test(env.ROLLBACK_VERSION_ID || '')) fail('Rollback requires an explicit existing Worker version UUID');
    if (env.ROLLBACK_CONFIRMATION !== 'compatible-schema-and-secrets') fail('Confirm rollback schema/secret compatibility explicitly');
    await preflight(env, config);
    const version = await api(env, `workers/scripts/${workerName}/versions/${env.ROLLBACK_VERSION_ID}`);
    rollbackBindings(config, version);
    wrangler(['rollback', env.ROLLBACK_VERSION_ID, '--yes', '--config', join(artifact, 'wrangler.json'),
        '--message', `Reviewed Phone Link rollback from ${env.SOURCE_COMMIT}`], env);
    const originalTag = version.metadata?.annotations?.['workers/tag'];
    const data = { operation: 'rollback', commit: env.SOURCE_COMMIT, versionId: env.ROLLBACK_VERSION_ID,
        originalCommit: /^commit-[a-f0-9]{40}$/.test(originalTag || '') ? originalTag.slice(7) : 'not recorded',
        readiness: 'pending (deployment changed; investigate any failed subsequent check)' };
    receipt(env, data);
    const deploymentId = await activeVersion(env, env.ROLLBACK_VERSION_ID);
    await readiness(env);
    receipt(env, { ...data, deploymentId, readiness: 'passed' });
}

function verifySource(env) {
    if (env.GITHUB_REF !== `refs/heads/${env.DEFAULT_BRANCH}`) fail('Dispatch must use the default branch workflow');
    if (!commitPattern.test(env.WORKFLOW_COMMIT || '')) fail('Invalid workflow provenance');
    const ref = env.SOURCE_REF || '';
    if (!commitPattern.test(ref) && !/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(ref)) fail('Use a full commit SHA or stable existing version tag');
    const source = git('rev-parse', '--verify', `${commitPattern.test(ref) ? ref : `refs/tags/${ref}`}^{commit}`);
    git('merge-base', '--is-ancestor', source, `origin/${env.DEFAULT_BRANCH}`);
    for (const file of ['.github/workflows/phone-link.yml', 'scripts/worker-release.js']) {
        if (git('show', `${source}:${file}`) !== git('show', `${env.WORKFLOW_COMMIT}:${file}`)) fail('Release workflow/helpers differ from the selected accepted source');
    }
    if (!commitPattern.test(ref)) {
        const pkg = JSON.parse(git('show', `${source}:package.json`));
        if (ref !== `v${pkg.version}`) fail('Immutable release tag must match package version');
    }
    writeFileSync(env.GITHUB_OUTPUT, `commit=${source}\n`, { flag: 'a' });
}

export async function main(command, env = process.env) {
    if (command === 'source') return verifySource(env);
    if (command === 'prepare') return prepare(env);
    if (command === 'bundle') return bundle();
    if (command === 'verify') return verified(env);
    if (command === 'deploy') return deploy(env);
    if (command === 'rollback') return rollback(env);
    fail('Unknown release operation');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main(process.argv[2]).catch(error => {
        console.error(error instanceof Error && /^(Invalid|Explicit|Unexpected|Unreviewed|Locked|Schema|Release|Artifact|Existing|Cloudflare|Phone Link|Protected|Could not|Rollback|Confirm|Single-tenant|PHONE_|APP_|D1_|Dashboard|Dispatch|Use |Immutable|Unknown)/.test(error.message)
            ? error.message : 'Worker release validation failed');
        process.exitCode = 1;
    });
}
