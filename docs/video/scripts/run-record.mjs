import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'daily-playwright-record-'));
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});
const port = await freePort();
const calendarPort = await freePort();
const applicationURL = `http://127.0.0.1:${port}`;
const databaseURL = join(temporaryDirectory, 'demo.db');
const authSecret = randomUUID() + randomUUID();
const environment = { ...process.env,
  DATABASE_URL: databaseURL, BETTER_AUTH_SECRET: authSecret, BETTER_AUTH_URL: applicationURL, ORIGIN: applicationURL,
  DAILY_DOCS_URL: applicationURL, DAILY_DOCS_DATABASE_URL: databaseURL, DAILY_DOCS_AUTH_SECRET: authSecret,
  PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_daily_docs_preview', PUBLIC_POSTHOG_HOST: 'http://127.0.0.1:9',
  SCHEDULED_DELIVERY_ENABLED: 'false', PLAYWRIGHT_CALENDAR_PORT: String(calendarPort),
  GOOGLE_CALENDAR_API_BASE_URL: `http://127.0.0.1:${calendarPort}/calendar/v3`,
  GOOGLE_ROUTES_API_KEY: 'demo-fixture-key', GOOGLE_MAPS_KILL_SWITCH: 'false',
  GOOGLE_MAPS_ATTRIBUTION_SECRET: randomUUID() + randomUUID(),
  GOOGLE_ROUTES_GLOBAL_DAILY_CAP: '100', GOOGLE_ROUTES_GLOBAL_MONTHLY_CAP: '1000', GOOGLE_ROUTES_PER_PERSON_DAILY_LIMIT: '50',
  GOOGLE_PLACES_GLOBAL_MONTHLY_CAP: '10000', GOOGLE_PLACES_PER_PERSON_DAILY_LIMIT: '500',
  NODE_OPTIONS: `--import ${JSON.stringify(join(root, 'docs/video/scripts/route-fixture.mjs'))}`
};
const start = args => spawn(process.execPath, args, { cwd: root, env: environment, stdio: 'inherit' });
const completed = child => new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Recording process exited: ${code ?? signal}`)));
});
const waitForServer = async (child, url) => {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('The local demo server stopped.');
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch { /* Wait for startup. */ }
    await delay(200);
  }
  throw new Error('The local demo server did not start.');
};
let calendar;
let application;
try {
  await completed(start(['tests/e2e/setupDatabase.mjs']));
  calendar = start(['tests/e2e/googleCalendarFixtureServer.mjs']);
  await waitForServer(calendar, `http://127.0.0.1:${calendarPort}`);
  application = start(['node_modules/vite/bin/vite.js', 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort']);
  await waitForServer(application, applicationURL);
  await completed(start(['docs/video/scripts/record.mjs']));
} finally {
  await Promise.all([application, calendar].filter(Boolean).map(child => {
    if (child.exitCode !== null) return Promise.resolve();
    const stopped = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    return stopped;
  }));
  await rm(temporaryDirectory, { recursive: true, force: true });
}
