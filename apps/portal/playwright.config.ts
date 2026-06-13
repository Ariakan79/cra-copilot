import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    command: 'pnpm run preview',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { API_PORT: '3098' },
  },
});
