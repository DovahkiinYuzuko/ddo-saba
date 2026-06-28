import { defineConfig, devices } from '@playwright/test';

declare const process: any;

// Define token from environment or fallback to 32-character default
const token = process.env.TEST_TOKEN || 'defaulttesttoken32charslongtoken';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 300000, // 各テストのタイムアウトを300秒に設定
  fullyParallel: false, // 共有サーバーへの競合を防ぐためシーケンシャルに実行
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // 同時に同一共有サーバーを叩くと競合するためワーカー数は1に制限
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    headless: false, // 画面を表示して目視確認できるようにする
    launchOptions: {
      slowMo: 1000, // 操作を目視しやすくするためスローモーションを設定
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Playwright automatically spins up the Vite dev server and backend servers
  webServer: {
    command: `cmd /c "..\\init_server.bat stop && init_server.bat start && cd web-ui && npm run dev"`,
    url: 'http://localhost:3000',
    env: {
      DDO_SABA_TOKEN: token,
    },
    reuseExistingServer: false,
    timeout: 120000,
  },
});
