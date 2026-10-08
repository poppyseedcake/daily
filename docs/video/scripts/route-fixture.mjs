import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Load only for the isolated recording server. The app still validates and saves routes.
if (!process.env.DATABASE_URL?.startsWith(join(tmpdir(), 'daily-playwright-')) || process.env.SCHEDULED_DELIVERY_ENABLED !== 'false') {
  throw new Error('The demo route fixture requires a temporary test database and disabled email delivery.');
}
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === 'https://routes.googleapis.com/directions/v2:computeRoutes') {
    return Promise.resolve(Response.json({ routes: [{ duration: '1560s', staticDuration: '1440s' }] }));
  }
  return originalFetch(input, options);
};
