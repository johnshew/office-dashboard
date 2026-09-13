import { test, expect } from '@playwright/test';

async function deviceService(page, status = 'pending', messages = [], attachments = {}) {
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
        if (url.pathname === '/api/graph') {
            const path = url.searchParams.get('path');
            body = attachments[path] || (path === '/me' ? { displayName: 'Test User' }
                : { value: path.startsWith('/me/mailFolders/inbox/messages?') ? messages : [] });
        }
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

test('Mail opens Inbox and isolates hostile email content', async ({ page }) => {
    const remoteRequests = [];
    await page.route('https://mail-content.example.test/**', async route => {
        remoteRequests.push(route.request().url());
        await route.abort();
    });
    const calls = await deviceService(page, 'complete', [{
        id: 'inbox-message', subject: 'Inbox safety check', bodyPreview: 'Test message',
        receivedDateTime: '2026-09-13T08:00:00Z',
        sender: { emailAddress: { name: 'Test Sender' } },
        body: { contentType: 'html', content: `
            <meta http-equiv="refresh" content="0;url=https://mail-content.example.test/redirect">
            <script>top.location.href='https://mail-content.example.test/script';</script>
            <p>Untrusted email text</p>
            <a href="https://mail-content.example.test/link">Message link</a>
            <img src="https://mail-content.example.test/tracker" alt="Remote image">
            <iframe src="https://mail-content.example.test/frame"></iframe>
            <form action="https://mail-content.example.test/form"><input></form>` }
    }]);
    await page.goto('./');
    await page.getByRole('button', { name: 'Login with iPhone / device QR code' }).click();
    await page.getByText('Inbox safety check', { exact: true }).click({ timeout: 15000 });
    const preview = page.locator('iframe[title="Message or event body"]');
    await expect(preview).toHaveAttribute('sandbox', '');
    await expect(preview).toHaveAttribute('referrerpolicy', 'no-referrer');
    const body = page.frameLocator('iframe[title="Message or event body"]');
    await expect(body.getByText('Untrusted email text')).toBeVisible();
    await expect(body.locator('script, meta[http-equiv="refresh"], a[href], iframe, form, img[src]')).toHaveCount(0);
    await expect(body.getByRole('img', { name: 'Blocked image: Remote image', exact: true })).toHaveText('Image blocked');
    await expect(body.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /default-src 'none'/);
    expect(remoteRequests).toEqual([]);
    const paths = calls.filter(call => call.url.pathname === '/api/graph').map(call => call.url.searchParams.get('path'));
    expect(paths.some(path => path.startsWith('/me/mailFolders/inbox/messages?'))).toBe(true);
    expect(paths.some(path => path.startsWith('/me/messages?'))).toBe(false);
    await expect(page).toHaveURL(/\/office-dashboard\/$/);
});

test('Mail reader contains long content and preserves inline images and keyboard navigation', async ({ page }, testInfo) => {
    const subject = 'Quarterly planning: decisions, delivery dates and follow-up actions for the product team';
    const logoBytes = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 240;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        context.fillStyle = '#087c68';
        context.fillRect(0, 0, 240, 64);
        context.fillStyle = '#ffffff';
        context.font = '22px sans-serif';
        context.fillText('Product team', 20, 40);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    const messages = Array.from({ length: 20 }, (_, index) => ({
        id: `message-${index}`, subject: index === 0 ? subject : `Project update ${index}`,
        bodyPreview: 'Review the milestones and the next steps for this release.',
        receivedDateTime: '2026-09-13T18:05:00Z',
        sender: { emailAddress: { name: 'Product planning team', address: 'planning@example.test' } },
        toRecipients: [{ emailAddress: { address: 'recipient-with-a-long-address@example.test' } }],
        attachments: index === 0 ? [{ id: 'inline-logo', isInline: true }] : [],
        body: index === 0 ? { contentType: 'html', content: `
            <table width="1200" style="width:1200px"><tr><td>
            <h3>Release planning</h3><img src="cid:logo" alt="Inline logo" width="240" height="64">
            <img src="https://mail-content.example.test/pixel" width="1" height="1">
            <p>${'LongReference'.repeat(30)}</p>
            ${'<p>Milestone details and ownership for the upcoming release.</p>'.repeat(50)}
            </td></tr></table>` } : { contentType: 'text', content: 'Plain text message\n'.repeat(100) }
    }));
    await deviceService(page, 'complete', messages, {
        '/me/messages/message-0/attachments/inline-logo': {
            '@odata.type': '#microsoft.graph.fileAttachment',
            contentId: 'logo', contentType: 'image/png',
            contentBytes: logoBytes
        }
    });
    await page.goto('./');
    await page.getByRole('button', { name: 'Login with iPhone / device QR code' }).click();
    const firstRow = page.locator('.mail-summary').first();
    await expect(firstRow).toBeVisible({ timeout: 15000 });
    expect(await page.locator('.mail-list-pane').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await firstRow.focus();
    await firstRow.press('Enter');
    await expect(page.getByRole('heading', { name: subject })).toBeFocused();
    const frame = page.frameLocator('iframe');
    const logo = frame.getByRole('img', { name: 'Inline logo', exact: true });
    await expect(logo).toHaveAttribute('src', /^data:image\/png;base64,/);
    expect(await logo.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    await expect(frame.locator('img')).toHaveCount(1);
    expect(await frame.locator('html').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await frame.locator('html').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    expect(await page.locator('.mail-reader').evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('mail-reader.png') });
    if (testInfo.project.name === 'mobile') {
        await page.getByRole('button', { name: 'Back to Inbox' }).click();
        await expect(firstRow).toBeFocused();
        await expect(page.getByRole('region', { name: 'Inbox', exact: true })).toBeVisible();
    }
    await page.locator('.mail-summary').nth(1).click();
    const plain = page.locator('.message-plain-body');
    await expect(plain).toContainText('Plain text message');
    expect(await plain.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test('Show Images enables HTTPS images only for the selected message', async ({ page }, testInfo) => {
    const requests = [];
    await page.route('**://mail-content.example.test/**', async route => {
        requests.push({ url: route.request().url(), headers: route.request().headers() });
        if (route.request().url().endsWith('/restricted.png')) {
            await route.abort('blockedbyresponse');
            return;
        }
        await route.fulfill({ contentType: 'image/png', body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=', 'base64') });
    });
    const messages = ['First', 'Second'].map(label => ({
        id: label, subject: `${label} image consent`, bodyPreview: 'Preview must not appear in the list',
        sender: { emailAddress: { name: 'Image test sender' } }, receivedDateTime: '2026-09-13T18:05:00Z',
        body: { contentType: 'html', content: `
            <script>top.location='https://mail-content.example.test/script'</script>
            <iframe src="https://mail-content.example.test/frame"></iframe>
            <form action="https://mail-content.example.test/form"><input></form>
            <a href="https://mail-content.example.test/link">Inert link</a>
            <img src="https://mail-content.example.test/${label}.png" alt="Remote banner" referrerpolicy="unsafe-url" onload="document.body.dataset.active='true'">
            <img src="https://mail-content.example.test/restricted.png" alt="Host-restricted image">
            <img src="http://mail-content.example.test/insecure.png" alt="Insecure image">
            <img src="https://username:password@mail-content.example.test/credentials.png" alt="Credential URL">
            <p style="background-image:url('https://mail-content.example.test/${label}-background.png')">Message content</p>` }
    }));
    await deviceService(page, 'complete', messages);
    await page.goto('./');
    await page.getByRole('button', { name: 'Login with iPhone / device QR code' }).click();
    await page.getByText('First image consent', { exact: true }).click({ timeout: 15000 });
    await expect(page.getByText('Preview must not appear in the list', { exact: true })).toHaveCount(0);
    const frame = page.frameLocator('iframe');
    await expect(frame.getByRole('img', { name: 'Blocked image: Remote banner', exact: true })).toBeVisible();
    expect(requests).toEqual([]);
    await expect(page.getByText('Loading images may notify the sender.', { exact: true })).toHaveCount(0);
    const metadataBounds = await page.locator('.message-metadata').boundingBox();
    const buttonBounds = await page.getByRole('button', { name: 'Show Images', exact: true }).boundingBox();
    expect(buttonBounds.x).toBeGreaterThanOrEqual(metadataBounds.x + metadataBounds.width);
    expect(Math.abs(buttonBounds.y + buttonBounds.height - metadataBounds.y - metadataBounds.height)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('images-blocked.png') });
    await page.getByRole('button', { name: 'Show Images', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Images Enabled', exact: true })).toBeDisabled();
    await expect(frame.getByRole('img', { name: 'Remote banner', exact: true })).toHaveAttribute('src', 'https://mail-content.example.test/First.png');
    await expect.poll(() => frame.getByRole('img', { name: 'Remote banner', exact: true }).evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect.poll(() => requests.length).toBe(3);
    expect(requests.map(request => request.url).sort()).toEqual([
        'https://mail-content.example.test/First-background.png', 'https://mail-content.example.test/First.png',
        'https://mail-content.example.test/restricted.png'
    ]);
    await expect.poll(() => frame.getByRole('img', { name: 'Host-restricted image', exact: true }).evaluate(image => image.complete && image.naturalWidth === 0)).toBe(true);
    expect(requests.every(request => !request.headers.referer && !request.headers.authorization)).toBe(true);
    await expect(frame.locator('script, iframe, form, a[href]')).toHaveCount(0);
    await expect(frame.locator('body')).not.toHaveAttribute('data-active', 'true');
    await expect(frame.getByRole('img', { name: 'Blocked image: Insecure image', exact: true })).toBeVisible();
    await expect(frame.getByRole('img', { name: 'Blocked image: Credential URL', exact: true })).toBeVisible();
    await expect(page.locator('iframe')).toHaveAttribute('sandbox', '');
    await expect(frame.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /default-src 'none'; img-src data: https:;/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    for (const label of ['Second', 'First']) {
        if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Back to Inbox' }).click();
        await page.locator('.mail-summary').filter({ hasText: `${label} image consent` }).click();
        await expect(page.getByRole('button', { name: 'Show Images', exact: true })).toBeEnabled();
        await expect(frame.getByRole('img', { name: 'Blocked image: Remote banner', exact: true })).toBeVisible();
        await expect(frame.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /img-src data:;/);
        expect(requests.length).toBe(3);
    }
});