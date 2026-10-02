import { test, expect } from '@playwright/test';
import worker from '../../workers/pairing/index.js';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { hash, seal } from '../../workers/pairing/crypto.js';

const service = 'https://phone.example';
const sessionId = 'A'.repeat(43);
const phoneToken = 'B'.repeat(43);

async function phonePage(context) {
    const response = await worker.fetch(new Request(service + '/phone', {
        headers: { 'CF-Connecting-IP': '192.0.2.1' },
    }), {
        APP_ORIGIN: 'https://dashboard.example', PHONE_SERVICE_ORIGIN: service,
        PHONE_CLIENT_ID: '22222222-2222-3333-4444-555555555555', PHONE_TENANT_ID: 'common',
        PHONE_CLIENT_SECRET: 'synthetic-browser-secret', PHONE_ENCRYPTION_KEY: 'C'.repeat(43),
        PAIRING_RATE_LIMITER: { limit: async () => ({ success: true }) },
    });
    const body = await response.text();
    await context.route(service + '/phone', route => route.fulfill({
        status: response.status, headers: Object.fromEntries(response.headers), body,
    }));
}

for (const [accountType, button, authority] of [
    ['personal', 'Personal Microsoft account', 'consumers'],
    ['work', 'Work or school account', 'organizations'],
]) {
    test(`phone page routes the explicit ${accountType} choice without retaining pairing fragments`, async ({ page, context }) => {
        await phonePage(context);
        let requestBody;
        await context.route(service + '/phone/start', async route => {
            requestBody = route.request().postDataJSON();
            await route.fulfill({ json: { authorizationUrl: `https://login.microsoftonline.com/${authority}/oauth2/v2.0/authorize` } });
        });
        await context.route('https://login.microsoftonline.com/**', route => route.fulfill({
            contentType: 'text/html', body: '<h1>Synthetic Microsoft sign-in</h1>',
        }));
        await page.goto(`${service}/phone#session=${sessionId}&phone=${phoneToken}`);
        await expect(page).toHaveURL(service + '/phone');
        await expect(page.getByRole('button', { name: 'Personal Microsoft account', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Work or school account', exact: true })).toBeVisible();
        await page.getByRole('button', { name: button, exact: true }).click();
        await expect(page).toHaveURL(`https://login.microsoftonline.com/${authority}/oauth2/v2.0/authorize`);
        expect(requestBody).toEqual({ sessionId, phoneToken, accountType });
    });
}

test('phone page with no pairing hides account choices and requests a new QR', async ({ page, context }) => {
    await phonePage(context);
    await page.goto(service + '/phone');
    await expect(page.getByRole('status')).toHaveText('Scan a new Phone Link QR code from your dashboard.');
    await expect(page.getByRole('button', { name: 'Personal Microsoft account', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Work or school account', exact: true })).toBeHidden();
});

for (const [decision, button, title] of [
    ['approve', 'Approve dashboard', 'Dashboard approved'],
    ['deny', 'Deny', 'Pairing denied'],
]) {
    test(`phone confirmation form preserves exact origin for ${decision}`, async ({ page, context }) => {
        const database = new DatabaseSync(':memory:');
        try {
            database.exec(readFileSync(new URL('../../workers/pairing/schema.sql', import.meta.url), 'utf8'));
            const env = {
                APP_ORIGIN: 'https://dashboard.example', PHONE_SERVICE_ORIGIN: service,
                PHONE_CLIENT_ID: '22222222-2222-3333-4444-555555555555', PHONE_TENANT_ID: 'common',
                PHONE_CLIENT_SECRET: 'synthetic-browser-secret', PHONE_ENCRYPTION_KEY: 'C'.repeat(43),
                PAIRING_RATE_LIMITER: { limit: async () => ({ success: true }) },
                PAIRING_DB: {
                    prepare(sql) {
                        const statement = database.prepare(sql);
                        let values = [];
                        return {
                            bind(...parameters) { values = parameters; return this; },
                            async first() { return statement.get(...values) ?? null; },
                        };
                    },
                },
            };
            const cookie = 'D'.repeat(43);
            const vault = await seal(env, sessionId, {
                profile: { displayName: 'Synthetic Driver', username: 'driver@example.test' },
                csrf: 'E'.repeat(43), accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh',
            });
            database.prepare(`INSERT INTO phone_slots
                (slot,session_id,tesla_hash,cookie_hash,label,status,expires_at,vault)
                VALUES (0,?,?,?,?, 'confirm',?,?)`).run(sessionId, await hash('F'.repeat(43)),
                await hash(cookie), 'Synthetic label', Date.now() + 600000, vault);
            await context.addCookies([{ name: '__Host-phone-link', value: cookie, url: service,
                secure: true, httpOnly: true, sameSite: 'Lax' }]);
            let submittedOrigin;
            let submittedReferrer;
            await context.route(service + '/phone/**', async route => {
                const browserRequest = route.request();
                const headers = await browserRequest.allHeaders();
                if (browserRequest.method() === 'POST') {
                    submittedOrigin = headers.origin;
                    submittedReferrer = headers.referer;
                }
                const response = await worker.fetch(new Request(browserRequest.url(), {
                    method: browserRequest.method(),
                    headers: { ...headers, 'CF-Connecting-IP': '192.0.2.1' },
                    ...(browserRequest.postData() ? { body: browserRequest.postData() } : {}),
                }), env);
                await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers),
                    body: await response.text() });
            });
            await page.goto(service + '/phone/confirm');
            const submitted = page.waitForResponse(service + '/phone/approve');
            await page.getByRole('button', { name: button, exact: true }).click();
            await submitted;
            expect(submittedOrigin).toBe(service);
            expect(submittedReferrer).toBe(service + '/phone/confirm');
            await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
            const row = database.prepare('SELECT status,cookie_hash,vault FROM phone_slots').get();
            expect(row.status).toBe(decision === 'approve' ? 'active' : 'denied');
            expect(row.cookie_hash).toBeNull();
            if (decision === 'deny') expect(row.vault).toBeNull();
        } finally { database.close(); }
    });
}
