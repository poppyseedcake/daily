import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterAll, describe, expect, test, vi } from 'vitest';

const sqlite = new Database(':memory:');

vi.doMock('$lib/server/db', () => ({
  db: drizzle(sqlite)
}));

const { GET } = await import('./health/+server');

describe.sequential('Health endpoint', () => {
  afterAll(() => {
    if (sqlite.open) sqlite.close();
  });

  test('reports a ready web process and database with the complete public contract', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  test('reports an unavailable database without exposing private or operational details', async () => {
    sqlite.close();

    const response = await GET();
    const responseText = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(responseText).toBe('{"status":"unhealthy"}');
  });

  test('reports unhealthy when the database module cannot open SQLite', async () => {
    vi.resetModules();
    vi.doMock('$lib/server/db', () => {
      throw new Error('database open failed');
    });
    const { GET: getHealth } = await import('./health/+server');

    const response = await getHealth();

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toBe('application/json');
    await expect(response.json()).resolves.toEqual({ status: 'unhealthy' });
  });
});
