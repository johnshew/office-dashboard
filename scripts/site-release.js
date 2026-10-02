import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateReleaseConfig } from './validate-release-config.js';

const configurationKeys = ['VITE_CLIENT_ID', 'VITE_TENANT_ID', 'VITE_DEVICE_LOGIN_URL', 'VITE_PHONE_LINK_URL'];
const shaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function configurationDigest(env) {
    return digest(JSON.stringify(Object.fromEntries(configurationKeys.map(key => [key, env[key] || '']))));
}

export function verifyManifest(manifest, expected, archive) {
    if (manifest.schema !== 1 || !shaPattern.test(manifest.commit) || !digestPattern.test(manifest.archiveDigest) ||
        !digestPattern.test(manifest.configurationDigest) || !Number.isSafeInteger(manifest.runId) || manifest.runId <= 0 ||
        !Number.isSafeInteger(manifest.runAttempt) || manifest.runAttempt <= 0) throw new Error('Invalid site artifact manifest.');
    for (const key of ['commit', 'version', 'repository', 'branch', 'runId', 'runAttempt', 'configurationDigest']) {
        if (manifest[key] !== expected[key]) throw new Error(`Site artifact ${key} does not match the accepted release.`);
    }
    if (manifest.archiveDigest !== digest(archive)) throw new Error('Site archive digest mismatch.');
}

export function selectArtifact(runs, artifacts, expected) {
    const run = runs.find(candidate => candidate.id === expected.runId && candidate.status === 'completed' &&
        candidate.conclusion === 'success' && candidate.event === 'push' && candidate.head_branch === expected.branch &&
        candidate.head_sha === expected.commit && candidate.path === '.github/workflows/pages.yml' &&
        candidate.repository?.full_name === expected.repository);
    if (!run) throw new Error('No successful exact-source default-branch validation.');
    const candidates = artifacts.filter(artifact => artifact.name === 'release-site' && !artifact.expired &&
        /^sha256:[a-f0-9]{64}$/.test(artifact.digest || '') &&
        artifact.workflow_run?.id === run.id && artifact.workflow_run?.head_sha === expected.commit);
    if (candidates.length !== 1) throw new Error('Exactly one unexpired, digest-bound tested site artifact is required.');
    return { run, artifact: candidates[0] };
}

export function verifyArchiveEntries(entries) {
    if (!entries.includes('./index.html') || !entries.includes('./release.json') ||
        entries.some(entry => !/^\.\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]*$/.test(entry) ||
            entry.split('/').some(part => part === '..'))) throw new Error('Invalid site archive paths.');
}

function command(program, args, options = {}) {
    return execFileSync(program, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
}
const git = (...args) => command('git', args).trim();
const api = path => JSON.parse(command('gh', ['api', path]));
function output(name, value) {
    if (!process.env.GITHUB_OUTPUT) throw new Error('Missing workflow output context.');
    writeFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, { flag: 'a' });
}
function provenance(env) {
    const commit = git('rev-parse', 'HEAD');
    const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    if (!shaPattern.test(commit) || !/^\d+\.\d+\.\d+$/.test(version) ||
        lock.version !== version || lock.packages[''].version !== version) throw new Error('Source/version/lockfile mismatch.');
    return { commit, version, repository: env.GITHUB_REPOSITORY, branch: env.DEFAULT_BRANCH };
}

export function stamp(env) {
    const source = provenance(env);
    writeFileSync('dist/release.json', JSON.stringify({ version: source.version, commit: source.commit }) + '\n');
}

export function seal(env) {
    validateReleaseConfig(env);
    const source = provenance(env);
    if (env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF_NAME !== env.DEFAULT_BRANCH ||
        env.GITHUB_SHA !== source.commit) throw new Error('Only exact default-branch push builds are promotable.');
    const archive = readFileSync('office-dashboard.tar.gz');
    const release = JSON.parse(readFileSync('dist/release.json', 'utf8'));
    if (release.commit !== source.commit || release.version !== source.version) throw new Error('Built site provenance mismatch.');
    const manifest = { schema: 1, ...source, runId: Number(env.GITHUB_RUN_ID), runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
        configurationDigest: configurationDigest(env), archiveDigest: digest(archive) };
    writeFileSync('site-manifest.json', JSON.stringify(manifest) + '\n');
    writeFileSync('SHA256SUMS', `${manifest.archiveDigest}  office-dashboard.tar.gz\n`);
}

export function verifySource(env) {
    const expected = provenance(env);
    if (env.RELEASE_REF !== `refs/tags/v${expected.version}` ||
        git('rev-parse', `${env.RELEASE_REF}^{commit}`) !== expected.commit) throw new Error('Tag/source/version mismatch.');
    git('merge-base', '--is-ancestor', expected.commit, `origin/${env.DEFAULT_BRANCH}`);
    if (env.GITHUB_EVENT_NAME === 'push' && git('rev-parse', `${env.GITHUB_SHA}^{commit}`) !== expected.commit) {
        throw new Error('Tag event source changed.');
    }
    return expected;
}

function promote(env) {
    validateReleaseConfig(env);
    const expected = verifySource(env);
    const prefix = `repos/${env.GITHUB_REPOSITORY}/actions`;
    const query = new URLSearchParams({ head_sha: expected.commit, branch: env.DEFAULT_BRANCH, event: 'push',
        status: 'success', per_page: '100' });
    const runs = api(`${prefix}/workflows/pages.yml/runs?${query}`).workflow_runs;
    const run = runs.find(candidate => candidate.status === 'completed' && candidate.conclusion === 'success' &&
        candidate.head_sha === expected.commit && candidate.head_branch === env.DEFAULT_BRANCH &&
        candidate.event === 'push' && candidate.path === '.github/workflows/pages.yml' &&
        candidate.repository?.full_name === env.GITHUB_REPOSITORY);
    if (!run) throw new Error('No accepted artifact for this exact source. Validate the default branch first.');
    const artifacts = api(`${prefix}/runs/${run.id}/artifacts?per_page=100`).artifacts;
    const selected = selectArtifact(runs, artifacts, { ...expected, runId: run.id });
    const zip = command('gh', ['api', `${prefix}/artifacts/${selected.artifact.id}/zip`], { encoding: 'buffer' });
    if (`sha256:${digest(zip)}` !== selected.artifact.digest) throw new Error('Downloaded GitHub artifact digest mismatch.');
    writeFileSync('tested-site.zip', zip);
    const entries = command('unzip', ['-Z1', 'tested-site.zip']).trim().split(/\r?\n/);
    const files = ['office-dashboard.tar.gz', 'SHA256SUMS', 'site-manifest.json'];
    if (entries.length !== files.length || !files.every(file => entries.includes(file))) throw new Error('Unexpected tested artifact entries.');
    for (const file of files) {
        writeFileSync(file, command('unzip', ['-p', 'tested-site.zip', file], { encoding: 'buffer' }));
    }
    const archive = readFileSync('office-dashboard.tar.gz');
    const manifest = JSON.parse(readFileSync('site-manifest.json', 'utf8'));
    verifyManifest(manifest, { ...expected, runId: run.id, runAttempt: run.run_attempt,
        configurationDigest: configurationDigest(env) }, archive);
    if (readFileSync('SHA256SUMS', 'utf8') !== `${manifest.archiveDigest}  office-dashboard.tar.gz\n`) {
        throw new Error('Release checksum file does not match the sealed archive.');
    }
    const paths = command('tar', ['-tzf', 'office-dashboard.tar.gz']).trim().split(/\r?\n/);
    verifyArchiveEntries(paths);
    const listing = command('tar', ['-tvzf', 'office-dashboard.tar.gz']).trim().split(/\r?\n/);
    if (listing.some(line => !['-', 'd'].includes(line[0]))) throw new Error('Site archive must contain only regular files/directories.');
    const release = JSON.parse(command('tar', ['-xOzf', 'office-dashboard.tar.gz', './release.json']));
    if (release.commit !== expected.commit || release.version !== expected.version) throw new Error('Archived site provenance mismatch.');
    mkdirSync('dist', { recursive: true });
    command('tar', ['-xzf', 'office-dashboard.tar.gz', '-C', 'dist', '--no-same-owner', '--no-same-permissions']);
    output('validated_run', run.id);
    console.log('Promoted exact tested default-branch site; source, version, configuration and both artifact digests verified.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const operations = { stamp, seal, promote };
    const operation = operations[process.argv[2]];
    if (!operation) throw new Error('Choose stamp, seal or promote.');
    operation(process.env);
}
