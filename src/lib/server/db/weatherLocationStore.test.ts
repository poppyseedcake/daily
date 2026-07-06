import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as schema from './schema';
import { createUserWeatherLocationStore } from './weatherLocationStore';

const createTestDatabase = () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(readFileSync('drizzle/0000_bootstrap_daily.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0003_add_weather_locations.sql', 'utf8'));

  return {
    sqlite,
    database: drizzle(sqlite, { schema })
  };
};

const saveUser = (sqlite: Database.Database, id: string) => {
  sqlite
    .prepare(
      'insert into users (id, google_subject, email, created_at, updated_at) values (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
    )
    .run(id, `google-${id}`, `${id}@example.com`);
};

describe('SQLite User Weather Location store', () => {
  let sqlite: Database.Database;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    const testDatabase = createTestDatabase();
    sqlite = testDatabase.sqlite;
    database = testDatabase.database;
    saveUser(sqlite, 'user-1');
    saveUser(sqlite, 'user-2');
  });

  afterEach(() => {
    sqlite.close();
  });

  test('persists and replaces the signed-in User Weather Location without leaking between Users', async () => {
    const store = createUserWeatherLocationStore(database);

    await expect(store.load('user-1')).resolves.toBeNull();

    await store.save('user-1', {
      label: 'Springfield, Illinois, United States',
      latitude: 39.799,
      longitude: -89.644
    });
    await store.save('user-2', {
      label: 'Springfield, Massachusetts, United States',
      latitude: 42.101,
      longitude: -72.589
    });

    await expect(store.load('user-1')).resolves.toEqual({
      label: 'Springfield, Illinois, United States',
      latitude: 39.799,
      longitude: -89.644
    });
    await expect(store.load('user-2')).resolves.toEqual({
      label: 'Springfield, Massachusetts, United States',
      latitude: 42.101,
      longitude: -72.589
    });

    await store.save('user-1', {
      label: 'Warsaw, Masovian Voivodeship, Poland',
      latitude: 52.2297,
      longitude: 21.0122
    });

    await expect(store.load('user-1')).resolves.toEqual({
      label: 'Warsaw, Masovian Voivodeship, Poland',
      latitude: 52.2297,
      longitude: 21.0122
    });
    await expect(store.load('user-2')).resolves.toEqual({
      label: 'Springfield, Massachusetts, United States',
      latitude: 42.101,
      longitude: -72.589
    });
  });
});
