import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = process.env.PLAYWRIGHT_PORT ?? '5173';
const baseURL = `http://127.0.0.1:${port}`;
const calendarFixturePort = process.env.PLAYWRIGHT_CALENDAR_PORT ?? '6173';
const calendarFixtureURL = `http://127.0.0.1:${calendarFixturePort}`;
const databaseURL = join(tmpdir(), `daily-playwright-${port}.db`);
const authSecret = 'daily-playwright-auth-secret-at-least-32-characters';

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: [
    {
      command: 'node tests/e2e/googleCalendarFixtureServer.mjs',
      env: { PLAYWRIGHT_CALENDAR_PORT: calendarFixturePort },
      url: calendarFixtureURL,
      reuseExistingServer: !process.env.CI
    },
    {
      command: `node tests/e2e/setupDatabase.mjs && npm run dev -- --host 127.0.0.1 --port ${port}`,
      env: {
        BETTER_AUTH_SECRET: authSecret,
        DATABASE_URL: databaseURL,
        ADMINISTRATOR_EMAIL_ALLOWLIST: 'admin@example.com',
        SCHEDULED_WORKER_OVERDUE_MINUTES: '5',
        GOOGLE_CALENDAR_API_BASE_URL: `${calendarFixtureURL}/calendar/v3`,
        GOOGLE_MAPS_GLOBAL_DAILY_CAP: '100',
        GOOGLE_MAPS_GLOBAL_MONTHLY_CAP: '1000',
        GOOGLE_MAPS_PER_PERSON_DAILY_LIMIT: '50',
        GOOGLE_MAPS_ATTRIBUTION_SECRET: 'daily-playwright-maps-attribution-secret-32-bytes'
      },
      url: baseURL,
      reuseExistingServer: !process.env.CI
    },
  ],
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
