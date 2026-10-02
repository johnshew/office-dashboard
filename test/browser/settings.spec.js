import { test, expect } from '@playwright/test';

async function openSettings(page) {
    const toggle = page.getByRole('button', { name: 'Toggle navigation' });
    if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') {
        await toggle.click();
    }
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.locator('#Settings').evaluate(element => {
        element.removeAttribute('data-test-shown');
        element.addEventListener('shown.bs.modal', () => element.setAttribute('data-test-shown', 'true'), { once: true });
    });
    await page.locator('#ShowSettings').click();
    await expect(page.locator('#Settings')).toHaveAttribute('data-test-shown', 'true');
}

test('Settings changes are drafts until Apply and Cancel preserves saved values', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#Settings')).toHaveCount(1);
    await openSettings(page);
    const modal = page.locator('#Settings');
    const interval = modal.getByRole('spinbutton');
    const scroll = modal.getByLabel('Calendar pane scrolling');
    await expect(interval).toHaveValue('300');
    await expect(modal.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();

    await interval.fill('60');
    await scroll.check();
    expect(await page.evaluate(() => localStorage.getItem('settings'))).toBeNull();
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(modal).toBeHidden();
    await openSettings(page);
    await expect(interval).toHaveValue('300');
    await expect(scroll).not.toBeChecked();

    await interval.fill('60');
    await scroll.check();
    await modal.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(modal).toBeHidden();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('settings'))?.data))
        .toEqual({ scroll: true, testData: false, refreshIntervalSeconds: 60 });
    await openSettings(page);
    await expect(interval).toHaveValue('60');
    await expect(scroll).toBeChecked();
    await expect(modal.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(modal).toBeHidden();

    await page.reload();
    await expect(page.locator('#Settings')).toHaveCount(1);
    await openSettings(page);
    await expect(interval).toHaveValue('60');
    await expect(scroll).toBeChecked();
});

test('Closing or escaping Settings discards edits', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#Settings')).toHaveCount(1);
    await openSettings(page);
    const modal = page.locator('#Settings');
    const interval = modal.getByRole('spinbutton');
    await interval.fill('15');
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(modal).toBeHidden();
    await openSettings(page);
    await expect(interval).toHaveValue('300');
    await interval.fill('30');
    await interval.press('Escape');
    await expect(modal).toBeHidden();
    await openSettings(page);
    await expect(interval).toHaveValue('300');
    expect(await page.evaluate(() => localStorage.getItem('settings'))).toBeNull();
});
