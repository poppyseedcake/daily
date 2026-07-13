import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as schema from './schema';
import { createUserCommuteSetupStore } from './commuteSetupStore';

const createTestDatabase = () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(readFileSync('drizzle/0000_bootstrap_daily.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0010_add_commute_setup.sql', 'utf8'));
  return { sqlite, database: drizzle(sqlite, { schema }) };
};

const saveUser = (sqlite: Database.Database, id: string) => {
  sqlite.prepare('insert into users (id, google_subject, email, created_at, updated_at) values (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)').run(id, `google-${id}`, `${id}@example.com`);
};

const routeDraft = (name: string) => ({
  name,
  origin: { label: 'Home', latitude: 52.2297, longitude: 21.0122 },
  destination: { label: 'Office', latitude: 52.2318, longitude: 21.0067 }
});

describe('SQLite User Commute setup store', () => {
  let sqlite: Database.Database;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    ({ sqlite, database } = createTestDatabase());
    saveUser(sqlite, 'user-1');
    saveUser(sqlite, 'user-2');
  });

  afterEach(() => sqlite.close());

  test('persists ordered routes and shared days for their owning User only', async () => {
    const store = createUserCommuteSetupStore(database);
    const first = await store.createRoute('user-1', routeDraft('Morning commute'));
    const second = await store.createRoute('user-1', routeDraft('Evening commute'));
    await store.createRoute('user-2', routeDraft('Other User route'));
    await store.saveDays('user-1', ['monday', 'wednesday', 'sunday']);

    expect(first).not.toBe('route-limit-reached');
    expect(second).not.toBe('route-limit-reached');
    await expect(store.load('user-1')).resolves.toMatchObject({
      routes: [{ name: 'Morning commute', enabled: true }, { name: 'Evening commute', enabled: true }],
      days: ['monday', 'wednesday', 'sunday']
    });
    await expect(store.load('user-2')).resolves.toMatchObject({
      routes: [{ name: 'Other User route' }],
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    });

    if (first === 'route-limit-reached') throw new Error('expected route');
    await expect(store.updateRoute('user-2', first.id, { ...first, enabled: false })).resolves.toBeNull();
    await expect(store.deleteRoute('user-2', first.id)).resolves.toBe(false);
    expect((await store.load('user-1'))?.routes[0]).toMatchObject({ enabled: true });
  });

  test('atomically rejects a sixth route at the persistence boundary', async () => {
    const store = createUserCommuteSetupStore(database);
    for (const name of ['One', 'Two', 'Three', 'Four', 'Five']) {
      await expect(store.createRoute('user-1', routeDraft(name))).resolves.not.toBe('route-limit-reached');
    }

    await expect(store.createRoute('user-1', routeDraft('Six'))).resolves.toBe('route-limit-reached');
    const saved = await store.load('user-1');
    expect(saved?.routes.map((route) => route.name)).toEqual(['One', 'Two', 'Three', 'Four', 'Five']);
  });
});
