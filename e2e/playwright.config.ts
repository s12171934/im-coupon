import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 5173;
const API_PORT = 3000;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // 앱 내부 함수를 부르지 않고 실제 API 프로세스를 띄운다.
      command: 'pnpm --filter @im-coupon/api start',
      cwd: '..',
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter @im-coupon/web preview --port 5173 --strictPort',
      cwd: '..',
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
