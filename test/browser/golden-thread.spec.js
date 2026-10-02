import { test, expect } from '@playwright/test';

test('mainstream Phone Link sign-in, Inbox, calendar, refresh and logout', async ({ page }) => {
    const session = 'a'.repeat(43);
    let mailReads = 0, continuationReads = 0, calendarReads = 0, cancelled = false;
    await page.route('https://phone.example.test/**', async route => {
        const url = new URL(route.request().url());
        let body;
        if (url.pathname === '/sessions') body = {
            sessionId: session, teslaToken: 'b'.repeat(43), label: 'Phone Link ABCDEF12',
            phoneUrl: `https://phone.example.test/phone#session=${session}&phone=${'c'.repeat(43)}`,
            expiresAt: Date.now() + 600000, interval: 2,
        };
        else if (url.pathname.endsWith('/poll')) body = { status: 'complete' };
        else if (url.pathname.endsWith('/cancel')) {
            cancelled = true;
            body = { status: 'cancelled' };
        } else if (url.pathname.endsWith('/graph')) {
            const path = url.searchParams.get('path');
            if (path === '/me') body = { displayName: 'Golden Driver' };
            else if (path.startsWith('/me/mailFolders/inbox/messages')) body = {
                '@odata.nextLink': "https://graph.microsoft.com/v1.0/me/mailFolders('inbox')/messages?$skiptoken=synthetic-continuation",
                value: [{
                id: 'golden-message', subject: `Golden message ${++mailReads}`, bodyPreview: 'Mainstream Inbox message',
                receivedDateTime: '2026-10-02T08:00:00Z', sender: { emailAddress: { name: 'Synthetic Sender' } },
                body: { contentType: 'html', content: '<p>Golden message body</p>' },
            }] };
            else if (path === "/me/mailFolders('inbox')/messages?$skiptoken=synthetic-continuation") {
                continuationReads++;
                body = { value: [{
                    id: 'golden-continuation', subject: 'Golden continuation', bodyPreview: 'Second Inbox page',
                    receivedDateTime: '2026-10-02T07:00:00Z', sender: { emailAddress: { name: 'Synthetic Sender' } },
                    body: { contentType: 'text', content: 'Second-page message body' },
                }] };
            }
            else if (path.startsWith('/me/calendarView')) body = { value: [{
                id: 'golden-event', subject: `Golden meeting ${++calendarReads}`,
                start: { dateTime: '2026-10-02T09:00:00', timeZone: 'UTC' },
                end: { dateTime: '2026-10-02T10:00:00', timeZone: 'UTC' },
                body: { contentType: 'text', content: 'Golden meeting body' },
            }] };
            else body = { value: [] };
        } else throw new Error('Unexpected golden-thread service request.');
        await route.fulfill({ json: body });
    });
    const navigate = async selector => {
        const toggle = page.getByRole('button', { name: 'Toggle navigation' });
        if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
        await page.locator(selector).click();
    };
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Welcome to Office Dashboard' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign in with your phone', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in with your phone' });
    await expect(dialog.getByRole('img')).toBeVisible();
    await expect(dialog).toContainText('Phone Link ABCDEF12');
    await expect(page.locator('#UsernameText')).toHaveText('Golden Driver');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Golden continuation', { exact: true })).toBeVisible();
    await page.getByText('Golden message 1', { exact: true }).click();
    await expect(page.frameLocator('iframe[title="Message or event body"]').getByText('Golden message body')).toBeVisible();
    await navigate('#RefreshCurrentView');
    await expect(page.locator('.mail-summary-subject')).toHaveText(['Golden message 2', 'Golden continuation']);
    expect(continuationReads).toBe(2);
    await navigate('#ShowCalendar');
    await expect(page.getByText('Golden meeting 1', { exact: true })).toBeVisible();
    await navigate('#RefreshCurrentView');
    await expect(page.getByText('Golden meeting 2', { exact: true })).toBeVisible();
    await navigate('#ShowMail');
    await expect(page.locator('.mail-workspace')).toBeVisible();
    await navigate('#top-nav .dropdown-toggle');
    await page.getByText('Logout', { exact: true }).click();
    await expect(page.locator('#UsernameText')).toHaveText('');
    await expect(page.getByRole('button', { name: 'Sign in with your phone', exact: true })).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(cancelled).toBe(true);
});
