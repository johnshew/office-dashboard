import { test, expect } from '@playwright/test';

const configured = (process.env.PLAYWRIGHT_LOGIN_OPTIONS || 'phone,device').split(',');
const choices = [
    ['phone', 'Sign in with your phone'],
    ['browser', 'Sign in on this screen'],
    ['device', 'Use a device code']
];

test('welcome offers only configured sign-in methods with clear explanations and touch targets', async ({ page }) => {
    await page.goto('./');
    const chooser = page.getByRole('region', { name: 'Welcome to Office Dashboard' });
    await expect(chooser).toBeVisible();
    for (const [mode, name] of choices) {
        const button = chooser.getByRole('button', { name, exact: true });
        if (!configured.includes(mode)) {
            await expect(button).toHaveCount(0);
            continue;
        }
        await expect(button).toBeEnabled();
        const box = await button.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    }
    if (configured.includes('phone')) {
        await expect(chooser).toContainText('Recommended for Tesla');
        await expect(chooser.getByRole('button', { name: choices[0][1] })).toHaveAccessibleDescription(/No code typing or Bluetooth/);
    }
    if (configured.includes('browser')) {
        await expect(chooser.getByRole('button', { name: choices[1][1] })).toHaveAccessibleDescription(/credentials on this screen/);
    }
    if (configured.includes('device')) {
        await expect(chooser.getByRole('button', { name: choices[2][1] })).toHaveAccessibleDescription(/short code on your phone/);
    }
    if (configured.includes('phone') && configured.includes('browser')) {
        const phone = await chooser.getByRole('button', { name: choices[0][1] }).boundingBox();
        const browser = await chooser.getByRole('button', { name: choices[1][1] }).boundingBox();
        if (page.viewportSize().width < 576) expect(browser.y).toBeGreaterThan(phone.y + phone.height);
        else expect(browser.x).toBeGreaterThan(phone.x + phone.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('navbar Login focuses the same chooser without starting any sign-in service', async ({ page }) => {
    const attempts = [];
    await page.route('https://phone.example.test/**', route => {
        attempts.push(route.request().url());
        return route.abort();
    });
    await page.route('https://device.example.test/**', route => {
        attempts.push(route.request().url());
        return route.abort();
    });
    await page.goto('./');
    if (await page.getByRole('button', { name: 'Toggle navigation' }).isVisible()) {
        await page.getByRole('button', { name: 'Toggle navigation' }).click();
    }
    await page.getByRole('link', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to Office Dashboard' })).toBeFocused();
    await expect(page.getByRole('region', { name: 'Welcome to Office Dashboard' })).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(attempts).toEqual([]);
    expect(page.url()).not.toContain('login.microsoftonline.com');
});

test('mobile menu exposes stable Login targets immediately and transfers focus after a tap', async ({ page }) => {
    await page.goto('./');
    const toggler = page.getByRole('button', { name: 'Toggle navigation' });
    test.skip(!await toggler.isVisible(), 'The desktop menu does not collapse.');
    const opening = await page.evaluate(() => {
        document.querySelector('.navbar-toggler').click();
        const menu = document.getElementById('NavBarActions');
        const login = document.getElementById('DoLogin');
        return {
            height: menu.clientHeight,
            contentHeight: menu.scrollHeight,
            menuBottom: menu.getBoundingClientRect().bottom,
            loginBottom: login.getBoundingClientRect().bottom
        };
    });
    expect(opening.height).toBeGreaterThanOrEqual(opening.contentHeight);
    expect(opening.menuBottom).toBeGreaterThanOrEqual(opening.loginBottom);
    await page.getByRole('link', { name: 'Login', exact: true }).tap();
    await expect(page.getByRole('heading', { name: 'Welcome to Office Dashboard' })).toBeFocused();
    await expect(toggler).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#NavBarActions')).toBeHidden();
    await expect(page.getByRole('dialog')).toHaveCount(0);
});
