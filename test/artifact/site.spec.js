import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadEnv } from 'vite';
import { siteDigest, siteProvenance } from '../../scripts/site-provenance.js';

test('final stamped site loads its assets and exposes only configured sign-in modes', async ({ page }, testInfo) => {
    const bytes = readFileSync('dist/release.json');
    const provenance = JSON.parse(bytes);
    expect(provenance.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(provenance.commit).toBe(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
    expect(provenance.configurationDigest).toMatch(/^[a-f0-9]{64}$/);
    const env = { ...loadEnv('production', process.cwd()), ...process.env };
    expect(provenance).toEqual(siteProvenance(env, JSON.parse(readFileSync('package.json', 'utf8')).version, provenance.commit));
    const digest = siteDigest('dist');
    const errors = [], failedAssets = [], externalRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (['script', 'stylesheet'].includes(response.request().resourceType()) && !response.ok()) {
            failedAssets.push(response.status());
        }
    });
    page.on('requestfailed', request => {
        if (['script', 'stylesheet'].includes(request.resourceType())) failedAssets.push(request.resourceType());
    });
    await page.route('**/*', route => {
        if (new URL(route.request().url()).origin !== 'http://localhost:8003') {
            externalRequests.push(route.request().resourceType());
            return route.abort();
        }
        return route.continue();
    });
    const response = await page.goto('./');
    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Welcome to Office Dashboard', exact: true })).toBeVisible();
    for (const [mode, name] of [
        ['browser', 'Sign in on this screen'], ['phone', 'Sign in with your phone'],
        ['device', 'Use a device code'],
    ]) {
        const button = page.getByRole('button', { name, exact: true });
        if (provenance.authentication[mode]) await expect(button).toBeEnabled();
        else await expect(button).toHaveCount(0);
    }
    if (Object.values(provenance.authentication).some(Boolean)) await expect(page.getByRole('alert')).toHaveCount(0);
    else await expect(page.getByRole('alert')).toContainText('Sign-in is not configured');
    const metadata = await page.request.get('release.json');
    expect(await metadata.body()).toEqual(bytes);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    expect(failedAssets).toEqual([]);
    expect(externalRequests).toEqual([]);
    expect(siteDigest('dist')).toBe(digest);
    await testInfo.attach('artifact-identity', {
        body: JSON.stringify({ ...provenance, provenanceDigest: createHash('sha256').update(bytes).digest('hex'),
            siteDigest: digest, lockDigest: createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'),
            node: process.version, platform: process.platform }),
        contentType: 'application/json',
    });
});
