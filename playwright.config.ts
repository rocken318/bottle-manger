import { defineConfig, devices } from '@playwright/test';

const DB_PORT = 55432;
const APP_PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  // Next dev compiles each route/Server Action on first hit, which can take
  // longer than the 5s default when running against `next dev`.
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    ...devices['Pixel 7'],
  },
  webServer: [
    {
      command: 'npx tsx scripts/e2e-db.ts',
      port: DB_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx next dev --port ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres?sslmode=disable`,
        SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
        DB_POOL_MAX: '1',
      },
    },
  ],
});
