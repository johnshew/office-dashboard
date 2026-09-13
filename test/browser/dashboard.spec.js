import { test, expect } from '@playwright/test';

async function deviceService(page, status = 'pending') {
    const calls = [];
    await page.route('https://device.example.test/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        calls.push({ url, method: request.method(), headers: request.headers() });
        let body = { status: 'expired' };
        if (url.pathname.endsWith('/start')) body = {
            sessionToken: 'test-session-credential', userCode: 'ABCD-EFGH',
            verificationUri: 'https://microsoft.com/devicelogin',
            expiresAt: Date.now() + 60000, interval: 5
        };
        if (url.pathname.endsWith('/status')) body = { status };
        if (url.pathname === '/api/graph') body = url.searchParams.get('path') === '/me'
            ? { displayName: 'Test User' } : { value: [] };
        await route.fulfill({ json: body });
    });
    return calls;
}

test('QR sign-in renders locally, fits the viewport and cancels without leaking credentials', async ({ page }) => {
    const calls = await deviceService(page);
    await page.goto('./');
    await page.getByRole('button', { name: 'Login with iPhone / device QR code' }).click();
    await expect(page.getByText('ABCD-EFGH', { exact: true })).toBeVisible();
    const image = page.getByRole('img', { name: "Scan to open Microsoft's device sign-in page" });
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', /^data:image\/png;base64,/);
    expect(await image.evaluate(element => element.naturalWidth)).toBe(256);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('body').innerHTML()).not.toContain('test-session-credential');
    await page.getByRole('button', { name: 'Cancel device login' }).click();
    await expect(image).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Login with iPhone / device QR code' })).toBeEnabled();
    expect(calls.some(call => call.url.pathname.endsWith('/logout')
        && call.headers.authorization === 'Bearer test-session-credential')).toBe(true);
    expect(calls.every(call => !call.url.href.includes('test-session-credential'))).toBe(true);
});

test('phone approval opens the dashboard and logout clears the user', async ({ page }) => {
    await deviceService(page, 'complete');
    await page.goto('./');
    await page.getByRole('button', { name: 'Login with iPhone / device QR code' }).click();
    await expect(page.locator('#UsernameText')).toHaveText('Test User', { timeout: 15000 });
    await expect(page.getByText('ABCD-EFGH', { exact: true })).toHaveCount(0);
    if (await page.getByRole('button', { name: 'Toggle navigation' }).isVisible()) {
        await page.getByRole('button', { name: 'Toggle navigation' }).click();
    }
    await page.getByRole('button', { name: 'Test User Account' }).click();
    await page.getByText('Logout', { exact: true }).click();
    await expect(page.locator('#UsernameText')).toHaveText('');
    await expect(page.getByRole('button', { name: 'Login with iPhone / device QR code' })).toBeEnabled();
});

test('denied device sign-in clears the QR and allows retry', async ({ page }) => {
    await deviceService(page, 'failed');
    await page.goto('./');
    await page.getByRole('button', { name: 'Login with iPhone / device QR code' }).click();
    await expect(page.getByRole('alert')).toContainText('declined or expired', { timeout: 15000 });
    await expect(page.getByRole('img')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Login with iPhone / device QR code' })).toBeEnabled();
});