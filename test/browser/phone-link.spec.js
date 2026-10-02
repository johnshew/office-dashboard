import { test, expect } from '@playwright/test';

const sessionId = 'a'.repeat(43), credential = 'b'.repeat(43), phone = 'c'.repeat(43);
async function phoneService(page, status = 'pending') {
    const calls = [];
    await page.route('https://phone.example.test/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        calls.push({ url, method: request.method(), body: request.postData(), headers: request.headers() });
        let body = { status: 'cancelled' };
        if (url.pathname === '/sessions') body = {
            sessionId, teslaToken: credential, label: 'Phone Link ABCD1234',
            phoneUrl: `https://phone.example.test/phone#session=${sessionId}&phone=${phone}`,
            expiresAt: Date.now() + 60000, interval: 2,
        };
        if (url.pathname.endsWith('/poll')) {
            if (status === 'expired') {
                await route.fulfill({ status: 401, json: { error: 'Dashboard session unavailable' } });
                return;
            }
            body = { status };
        }
        if (url.pathname.endsWith('/graph')) body = url.searchParams.get('path') === '/me'
            ? { displayName: 'Synthetic Phone Driver' } : { value: [] };
        await route.fulfill({ json: body });
    });
    return calls;
}

test('Phone Link QR shows matching label without a device code and cancels with Escape', async ({ page }) => {
    const calls = await phoneService(page);
    await page.goto('./#email=synthetic%40example.test');
    await page.getByRole('button', { name: 'Sign in with your phone', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in with your phone' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Phone Link ABCD1234', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
    await expect(dialog).toContainText('No code typing or Bluetooth');
    await expect(dialog.locator('ol li')).toHaveText([
        'Scan this QR code with your phone camera.',
        'Sign in to Microsoft on your phone.',
        'Match the label below on your phone, then tap Approve.'
    ]);
    await expect(dialog.getByRole('button', { name: 'Cancel sign-in' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel sign-in' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel sign-in' })).toBeFocused();
    expect(await page.locator('body').innerHTML()).not.toContain(credential);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(page.url()).not.toContain('email=');
    expect(JSON.parse(calls.find(c => c.url.pathname === '/sessions').body)).toEqual({ emailHint: 'synthetic@example.test' });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in with your phone', exact: true })).toBeFocused();
    expect(calls.some(c => c.url.pathname.endsWith('/cancel'))).toBe(true);
    expect(calls.every(c => !c.url.href.includes(credential))).toBe(true);
});

test('Phone Link approved polling loads profile and data; logout revokes the waiting-session credential', async ({ page }) => {
    const calls = await phoneService(page, 'complete');
    await page.goto('./');
    await page.getByRole('button', { name: 'Sign in with your phone', exact: true }).click();
    await expect(page.locator('#UsernameText')).toHaveText('Synthetic Phone Driver', { timeout: 15000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => calls.filter(c => c.url.pathname.endsWith('/graph')).length).toBeGreaterThan(2);
    if (await page.getByRole('button', { name: 'Toggle navigation' }).isVisible()) {
        await page.getByRole('button', { name: 'Toggle navigation' }).click();
    }
    await page.getByRole('link', { name: 'Switch account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Switch account' })).toBeFocused();
    await expect(page.locator('#NavBarActions')).not.toHaveClass(/collapsing/);
    await expect(page.getByRole('button', { name: 'Sign in with your phone', exact: true })).toBeEnabled();
    expect(calls.some(c => c.url.pathname.endsWith('/cancel'))).toBe(false);
    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    await expect(page.locator('.mail-workspace')).toBeVisible();
    if (await page.getByRole('button', { name: 'Toggle navigation' }).isVisible()) {
        await page.getByRole('button', { name: 'Toggle navigation' }).click();
    }
    await page.getByRole('button', { name: 'Synthetic Phone Driver Account' }).click();
    await page.getByText('Logout', { exact: true }).click();
    await expect(page.locator('#UsernameText')).toHaveText('');
    await expect(page.getByRole('button', { name: 'Sign in with your phone', exact: true })).toBeEnabled();
    expect(calls.some(c => c.url.pathname.endsWith('/cancel'))).toBe(true);
});

test('denied Phone Link clears QR and permits a new pairing', async ({ page }) => {
    const calls = await phoneService(page, 'denied');
    await page.goto('./');
    await page.getByRole('button', { name: 'Sign in with your phone', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Sign-in was not approved', { timeout: 15000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in with your phone', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Sign in with your phone', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(calls.filter(c => c.url.pathname === '/sessions')).toHaveLength(2);
    await page.getByRole('button', { name: 'Cancel sign-in' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
});
