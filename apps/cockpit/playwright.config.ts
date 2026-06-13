import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4174' },
  webServer: {
    command: 'pnpm run preview',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Der Preview-Proxy muss den E2E-API-Port kennen (global-setup startet die
    // API dort); env hier garantiert die Weitergabe an den Subprozess.
    env: { API_PORT: '3099' },
  },
});
