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
  // 이미 떠 있는 서버를 재사용하지 않는다(`reuseExistingServer: false`).
  // 재사용하면 삭제된 워크트리에 남은 개발 서버에 조용히 붙어, e2e 가 검증하는 대상이
  // 이 저장소가 아니게 된다. 포트가 물려 있으면 붙는 대신 큰 소리로 실패하는 편이 낫다.
  webServer: [
    {
      // 앱 내부 함수를 부르지 않고 실제 API 프로세스를 띄운다.
      command: 'pnpm --filter @im-coupon/api start',
      cwd: '..',
      port: API_PORT,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter @im-coupon/web preview --port 5173 --strictPort',
      cwd: '..',
      port: WEB_PORT,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
