// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,        // tests share a DB; run serially
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    geolocation: { latitude: 40.416775, longitude: -3.703790 },
    permissions: ['geolocation'],
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
