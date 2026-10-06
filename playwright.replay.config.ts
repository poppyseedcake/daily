import { defineConfig } from '@playwright/test';
import config from './playwright.config';

const port = process.env.PLAYWRIGHT_PORT ?? '5173';
const application = Array.isArray(config.webServer) ? config.webServer[1] : undefined;
if (!application) throw new Error('The replay configuration requires the application web server');

// Record the actual Node-adapter build, including SvelteKit's linked CSS assets.
export default defineConfig({
  ...config,
  testMatch: 'posthog-privacy.spec.ts',
  webServer: {
    ...application,
    command: 'node tests/e2e/setupDatabase.mjs && npm run build && node build',
    env: { ...application.env, HOST: '127.0.0.1', PORT: port },
    timeout: 120_000,
    reuseExistingServer: false
  }
});
