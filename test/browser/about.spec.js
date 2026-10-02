import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

test('About displays the package version of the built candidate', async ({ page }) => {
    await page.goto('./');
    const toggle = page.getByRole('button', { name: 'Toggle navigation' });
    if (await toggle.isVisible()) await toggle.click();
    await page.locator('#top-nav [data-bs-toggle="dropdown"]').click();
    await page.locator('#ShowAbout').click();
    await expect(page.locator('#About')).toBeVisible();
    await expect(page.locator('#About')).toContainText(`Office Dashboard ${version}`);
    await expect(page.locator('#About')).not.toContainText('Alpha 2');
});
