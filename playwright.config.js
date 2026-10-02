import { defineConfig, devices } from '@playwright/test';

const loginOptions = (process.env.PLAYWRIGHT_LOGIN_OPTIONS || 'phone,device').split(',');

export default defineConfig({
    testDir: './test/browser',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: 'http://localhost:8002/office-dashboard/',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }
    ],
    webServer: {
        command: 'npm run build && npm exec vite preview -- --host localhost --port 8002 --strictPort --base=/office-dashboard/',
        url: 'http://localhost:8002/office-dashboard/',
        reuseExistingServer: false,
        env: {
            VITE_CLIENT_ID: loginOptions.includes('browser') ? '11111111-2222-3333-4444-555555555555' : '',
            VITE_TENANT_ID: 'organizations',
            VITE_DEVICE_LOGIN_URL: loginOptions.includes('device') ? 'https://device.example.test' : '',
            VITE_PHONE_LINK_URL: loginOptions.includes('phone') ? 'https://phone.example.test' : ''
        }
    }
});