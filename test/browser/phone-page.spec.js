import { test, expect } from '@playwright/test';
import worker from '../../workers/pairing/index.js';

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
