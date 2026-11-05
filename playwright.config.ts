import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const external = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  expect: { timeout: 12000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: external || 'http://127.0.0.1:3101',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  webServer: external
    ? undefined
    : {
        command: 'npm run build && npm start',
        url: 'http://127.0.0.1:3101/api/health',
        reuseExistingServer: false,
        timeout: 60000,
        env: {
          PORT: '3101',
          HOST: '127.0.0.1',
          PUBLIC_ORIGIN: 'http://127.0.0.1:3101',
          NODE_ENV: 'test',
          SAVE_DIR: 'data/e2e',
        },
      },
});
