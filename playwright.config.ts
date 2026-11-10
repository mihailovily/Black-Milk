import { defineConfig, devices } from '@playwright/test';
const accounts = process.env.ACCOUNT_E2E === '1';

export default defineConfig({
  testDir: './tests',
  testMatch: accounts ? '**/accounts.spec.ts' : '**/scaffold.spec.ts',
  outputDir: accounts ? 'test-results/accounts' : 'test-results/scaffold',
  fullyParallel: !accounts,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: accounts
      ? 'node --import tsx scripts/test-stack.ts'
      : 'node .next/standalone/server.js',
    env: { HOSTNAME: '127.0.0.1', PORT: '3100' },
    url: 'http://127.0.0.1:3100/api/v1/health',
    reuseExistingServer: false,
    timeout: accounts ? 120_000 : 60_000,
  },
});
