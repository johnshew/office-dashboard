import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { siteProvenance, siteDigest } from '../scripts/site-provenance.js';
import { releaseStatus } from '../scripts/release-status.js';

test('site provenance binds public configuration and sign-in modes without exporting configuration values', () => {
    const env = { VITE_CLIENT_ID: '11111111-2222-3333-4444-555555555555',
        VITE_PHONE_LINK_URL: 'https://phone.example.test', PHONE_CLIENT_SECRET: 'synthetic-secret' };
    const result = siteProvenance(env, '0.4.0', 'a'.repeat(40));
    assert.deepEqual(result.authentication, { browser: true, phone: true, device: false });
    assert.match(result.configurationDigest, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(result).includes(env.VITE_CLIENT_ID), false);
    assert.equal(JSON.stringify(result).includes(env.PHONE_CLIENT_SECRET), false);
    assert.equal(result.configurationDigest, siteProvenance({ ...env, PHONE_CLIENT_SECRET: 'other' }, '0.4.0', 'a'.repeat(40)).configurationDigest);
    assert.notEqual(result.configurationDigest, siteProvenance({ ...env, VITE_PHONE_LINK_URL: '' }, '0.4.0', 'a'.repeat(40)).configurationDigest);
    assert.deepEqual(siteProvenance({}, '0.4.0', 'a'.repeat(40)).authentication, { browser: false, phone: false, device: false });
});

test('release report keeps candidate, publication, deployment and acceptance separate', () => {
    const candidate = { version: '0.4.0', commit: 'b'.repeat(40), dirty: true };
    const published = { tagName: 'v0.3.0', publishedAt: '2026-09-13T17:25:00Z' };
    const report = releaseStatus(candidate, published);
    assert.deepEqual(report.candidate, candidate);
    assert.deepEqual(report.published, published);
    assert.match(report.deployed.status, /Not queried/);
    assert.match(report.acceptance.status, /Not inferred/);
    assert.match(report.backends.status, /Not queried/);
});

test('artifact identity changes when site bytes change even if version and commit do not', () => {
    const directory = mkdtempSync(join(tmpdir(), 'office-dashboard-artifact-'));
    try {
        writeFileSync(join(directory, 'release.json'), '{"version":"0.4.0"}');
        writeFileSync(join(directory, 'index.html'), 'original');
        const original = siteDigest(directory);
        assert.equal(siteDigest(directory), original);
        writeFileSync(join(directory, 'index.html'), 'changed');
        assert.notEqual(siteDigest(directory), original);
    } finally { rmSync(directory, { recursive: true, force: true }); }
});
