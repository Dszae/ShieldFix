import { defineConfig } from '@playwright/test';

const projects: NonNullable<Parameters<typeof defineConfig>[0]['projects']> = [
  { name: 'chromium', use: { browserName: 'chromium' } },
];
if (process.env.BRAVE_PATH) {
  projects.push({
    name: 'brave',
    use: { browserName: 'chromium', launchOptions: { executablePath: process.env.BRAVE_PATH } },
  });
}

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: 'http://127.0.0.1:4173/health',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
  projects,
});
