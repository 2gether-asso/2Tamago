import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3100;
const WEB_PORT = 4322;

export default defineConfig({
  testDir: 'e2e',
  // One shared in-memory API: the tests use distinct player names instead of isolated databases.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // The existing tests look for French texts; language tests set their own locale.
    locale: 'fr-FR',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Run the built API (`pnpm build` first) on an in-memory database.
      command: 'node dist/main.js',
      cwd: '../api',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: 'memory://',
        AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
        AUTH_DEV_LOGIN: 'true',
        COOKIE_SECURE: 'false',
        // Time runs 120x faster: an egg hatches in ~3 s. Nobody leaves during the test.
        GAME_TIME_SCALE: '120',
        GAME_DEPARTURE: 'false',
        ADMIN_DISCORD_IDS: 'dev:root',
        // Enables the feedback form; nothing listens there, so reports go nowhere.
        SENTRY_DSN: 'http://key@127.0.0.1:9/1',
      },
    },
    {
      command: `pnpm exec vite dev --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: { API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
