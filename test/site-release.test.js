import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { configurationDigest, digest, verifyManifest, selectArtifact, verifyArchiveEntries, stamp, seal, verifySource } from '../scripts/site-release.js';

const configuration = { VITE_CLIENT_ID: '11111111-2222-3333-4444-555555555555', VITE_TENANT_ID: 'common',
    VITE_DEVICE_LOGIN_URL: '', VITE_PHONE_LINK_URL: 'https://phone.example.test' };
const archive = Buffer.from('synthetic sealed site archive');
const expected = { commit: 'a'.repeat(40), version: '0.4.0', repository: 'synthetic/dashboard',
    branch: 'gh-pages', runId: 123, runAttempt: 1, configurationDigest: configurationDigest(configuration) };
const manifest = { schema: 1, ...expected, archiveDigest: digest(archive) };
const run = { id: 123, run_attempt: 1, status: 'completed', conclusion: 'success', event: 'push',
    head_branch: expected.branch, head_sha: expected.commit, path: '.github/workflows/pages.yml',
    repository: { full_name: expected.repository } };
const artifact = { id: 456, name: 'release-site', expired: false, digest: 'sha256:' + 'b'.repeat(64),
    workflow_run: { id: 123, head_sha: expected.commit } };

test('public configuration digest includes every build setting without unrelated environment values', () => {
    assert.equal(configurationDigest({ ...configuration, GH_TOKEN: 'synthetic-secret' }), expected.configurationDigest);
    for (const key of Object.keys(configuration)) {
        assert.notEqual(configurationDigest({ ...configuration, [key]: configuration[key] + '-changed' }), expected.configurationDigest);
    }
    assert.equal(configurationDigest({}), configurationDigest(Object.fromEntries(Object.keys(configuration).map(key => [key, '']))));
});

test('sealed site binds exact source, version, configuration, validation run and archive bytes', () => {
    assert.doesNotThrow(() => verifyManifest(manifest, expected, archive));
    for (const key of Object.keys(expected)) {
        assert.throws(() => verifyManifest({ ...manifest, [key]: typeof expected[key] === 'number' ? 999 : 'changed' }, expected, archive));
    }
    assert.throws(() => verifyManifest({ ...manifest, schema: 2 }, expected, archive));
    assert.throws(() => verifyManifest(manifest, expected, Buffer.from('tampered archive')), /digest/);
    assert.throws(() => verifyManifest({ ...manifest, archiveDigest: 'invalid' }, expected, archive));
});

test('promotion accepts only a successful exact default push and one unexpired GitHub-digest artifact', () => {
    assert.deepEqual(selectArtifact([run], [artifact], expected), { run, artifact });
    for (const change of [{ status: 'in_progress' }, { conclusion: 'failure' }, { event: 'pull_request' },
        { head_branch: 'feature' }, { head_sha: 'c'.repeat(40) }, { path: '.github/workflows/untrusted.yml' },
        { repository: { full_name: 'untrusted/dashboard' } }]) {
        assert.throws(() => selectArtifact([{ ...run, ...change }], [artifact], expected));
    }
    for (const change of [{ expired: true }, { name: 'untrusted' }, { digest: undefined },
        { workflow_run: { id: 999, head_sha: expected.commit } },
        { workflow_run: { id: 123, head_sha: 'c'.repeat(40) } }]) {
        assert.throws(() => selectArtifact([run], [{ ...artifact, ...change }], expected));
    }
    assert.throws(() => selectArtifact([run], [], expected));
    assert.throws(() => selectArtifact([run], [artifact, { ...artifact, id: 789 }], expected));
});

test('site archive paths require provenance and reject absolute and traversal entries', () => {
    const paths = ['./', './index.html', './release.json', './assets/', './assets/index-a1_b2.js'];
    assert.doesNotThrow(() => verifyArchiveEntries(paths));
    assert.throws(() => verifyArchiveEntries(paths.filter(path => path !== './release.json')));
    for (const path of ['/tmp/escape', '../escape', './assets/../../escape', './assets\\escape']) {
        assert.throws(() => verifyArchiveEntries([...paths, path]));
    }
});

test('source stamping and sealing bind real Git source and reject tag or build substitutions', () => {
    const directory = mkdtempSync(join(tmpdir(), 'site-release-test-'));
    const previous = process.cwd();
    const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    try {
        git('init', '--initial-branch=gh-pages');
        git('config', 'user.name', 'Synthetic Release Test');
        git('config', 'user.email', 'release@example.invalid');
        writeFileSync(join(directory, 'package.json'), JSON.stringify({ version: expected.version }));
        writeFileSync(join(directory, 'package-lock.json'), JSON.stringify({
            version: expected.version, packages: { '': { version: expected.version } },
        }));
        git('add', '.');
        git('commit', '-m', 'Synthetic tested source');
        const commit = git('rev-parse', 'HEAD');
        git('tag', 'v0.4.0');
        git('tag', 'v0.5.0');
        git('update-ref', 'refs/remotes/origin/gh-pages', commit);
        mkdirSync(join(directory, 'dist'));
        writeFileSync(join(directory, 'office-dashboard.tar.gz'), archive);
        process.chdir(directory);
        const env = { ...configuration, GITHUB_REPOSITORY: expected.repository, DEFAULT_BRANCH: 'gh-pages',
            GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: 'gh-pages', GITHUB_SHA: commit,
            GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', RELEASE_REF: 'refs/tags/v0.4.0' };
        stamp(env);
        assert.deepEqual(JSON.parse(readFileSync('dist/release.json', 'utf8')), { commit, version: expected.version });
        seal(env);
        verifyManifest(JSON.parse(readFileSync('site-manifest.json', 'utf8')), { ...expected, commit }, archive);
        assert.equal(verifySource(env).commit, commit);
        assert.throws(() => verifySource({ ...env, RELEASE_REF: 'refs/tags/v0.5.0' }), /Tag/);
        for (const change of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF_NAME: 'feature' },
            { GITHUB_SHA: 'c'.repeat(40) }]) assert.throws(() => seal({ ...env, ...change }));
        writeFileSync('dist/release.json', JSON.stringify({ commit: 'c'.repeat(40), version: expected.version }));
        assert.throws(() => seal(env), /provenance/);
        writeFileSync('package-lock.json', JSON.stringify({ version: '0.5.0', packages: { '': { version: '0.5.0' } } }));
        assert.throws(() => stamp(env), /lockfile/);
    } finally {
        process.chdir(previous);
        rmSync(directory, { recursive: true, force: true });
    }
});

test('Pages validates PR/default only and promotes tags without dependency installs, builds or browser reruns', () => {
    const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
    assert.match(workflow, /branches: \[gh-pages\]/);
    assert.doesNotMatch(workflow, /branches: \['\*\*'\]/);
    assert.match(workflow, /pull_request:/);
    assert.match(workflow, /if: needs\.source\.outputs\.release != 'true'/);
    assert.match(workflow, /npm run test:browser:golden/);
    assert.doesNotMatch(workflow, /PLAYWRIGHT_LOGIN_OPTIONS="\$options"|npm run test:browser\n/);
    const promotion = workflow.split('  promote:')[1].split('  deploy:')[0];
    assert.match(promotion, /site-release\.js promote/);
    assert.doesNotMatch(promotion, /npm ci|npm test|npm run build|playwright/);
    assert.match(workflow, /needs: \[source, promote\]/);
    assert.match(workflow, /group: production-pages/);
    assert.match(workflow, /cancel-in-progress: false/);
    assert.match(workflow, /name: github-pages/);
});
