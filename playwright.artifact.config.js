import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './test/artifact',
    forbidOnly: !!process.env.CI,
    reporter: [['list'], ['json', { outputFile: 'test-results/artifact-results.json' }]],
    use: { baseURL: 'http://localhost:8003/office-dashboard/' },
    projects: [{ name: 'artifact', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: 'npm exec --no -- vite preview --host localhost --port 8003 --strictPort --base=/office-dashboard/',
        url: 'http://localhost:8003/office-dashboard/',
        reuseExistingServer: false,
    },
});
