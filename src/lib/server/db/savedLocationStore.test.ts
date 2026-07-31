import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as schema from './schema';
import {
  createUserSavedCommuteAddressStore,
  createUserSavedWeatherCityStore
} from './savedLocationStore';

const createTestDatabase = () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(readFileSync('drizzle/0000_bootstrap_daily.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0010_add_commute_setup.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0020_add_saved_locations.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0021_split_saved_locations.sql', 'utf8'));

  return { sqlite, database: drizzle(sqlite, { schema }) };
};

const saveUser = (sqlite: Database.Database, id: string) => {
  sqlite
    .prepare(
      'insert into users (id, google_subject, email, created_at, updated_at) values (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
    )
    .run(id, `google-${id}`, `${id}@example.com`);
};

describe('SQLite Saved Weather City and Saved Commute Address stores', () => {
  let sqlite: Database.Database;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    const testDatabase = createTestDatabase();
    sqlite = testDatabase.sqlite;
    database = testDatabase.database;
    saveUser(sqlite, 'user-1');
    saveUser(sqlite, 'user-2');
  });

  afterEach(() => sqlite.close());

  test('replaces each ordered list without leaking between Users or purposes', async () => {
    const weatherCityStore = createUserSavedWeatherCityStore(database);
    const commuteAddressStore = createUserSavedCommuteAddressStore(database);

    await weatherCityStore.replace('user-1', [
      { label: 'Warsaw, Poland', latitude: 52.2297, longitude: 21.0122 },
      { label: 'Wrocław, Poland', latitude: 51.1079, longitude: 17.0385 }
    ]);
    await weatherCityStore.replace('user-2', [
      { label: 'New York, United States', latitude: 40.7128, longitude: -74.006 }
    ]);
    await commuteAddressStore.replace('user-1', [
      { label: 'Home', latitude: 52.2297, longitude: 21.0122 },
      { label: 'Office', latitude: 52.2318, longitude: 21.0067 }
    ]);

    await expect(weatherCityStore.load('user-1')).resolves.toEqual([
      { label: 'Warsaw, Poland', latitude: 52.2297, longitude: 21.0122 },
      { label: 'Wrocław, Poland', latitude: 51.1079, longitude: 17.0385 }
    ]);
    await expect(weatherCityStore.load('user-2')).resolves.toEqual([
      { label: 'New York, United States', latitude: 40.7128, longitude: -74.006 }
    ]);
    await expect(commuteAddressStore.load('user-1')).resolves.toEqual([
      { label: 'Home', latitude: 52.2297, longitude: 21.0122 },
      { label: 'Office', latitude: 52.2318, longitude: 21.0067 }
    ]);

    await commuteAddressStore.replace('user-1', [
      { label: 'Updated address', latitude: 51.1, longitude: 17.03 }
    ]);
    await expect(weatherCityStore.load('user-1')).resolves.toEqual([
      { label: 'Warsaw, Poland', latitude: 52.2297, longitude: 21.0122 },
      { label: 'Wrocław, Poland', latitude: 51.1079, longitude: 17.0385 }
    ]);
    await expect(commuteAddressStore.load('user-1')).resolves.toEqual([
      { label: 'Updated address', latitude: 51.1, longitude: 17.03 }
    ]);
  });
});
