import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as schema from './schema';
import { createUserCalendarConnectionStore } from './calendarConnectionStore';

const createTestDatabase = () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(readFileSync('drizzle/0000_bootstrap_daily.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0001_add_better_auth_tables.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0004_add_calendar_connections.sql', 'utf8'));

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

const saveAuthGoogleAccount = (sqlite: Database.Database, userId: string) => {
  sqlite
    .prepare(
      'insert into auth_user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, true, ?, ?)'
    )
    .run(userId, 'Daily User', `${userId}@example.com`, 1783521000000, 1783521000000);
  sqlite
    .prepare(
      'insert into auth_account (id, account_id, provider_id, user_id, access_token, refresh_token, access_token_expires_at, scope, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      `account-${userId}`,
      `google-${userId}`,
      'google',
      userId,
      `access-${userId}`,
      `refresh-${userId}`,
      1783521000,
      'openid email profile https://www.googleapis.com/auth/calendar.readonly',
      1783519200000,
      1783519200000
    );
};

describe('SQLite User Calendar Connection store', () => {
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

  test('persists connected Calendar state per signed-in User', async () => {
    const store = createUserCalendarConnectionStore(database);

    await store.saveConnected('user-1', {
      providerAccountId: 'google-user-1',
      grantedScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      accessTokenAvailable: true,
      refreshTokenAvailable: true,
      accessTokenExpiresAt: new Date('2026-07-08T14:30:00.000Z')
    });

    await expect(store.load('user-1')).resolves.toEqual({
      status: 'connected',
      providerAccountId: 'google-user-1',
      grantedScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      accessTokenAvailable: true,
      refreshTokenAvailable: true,
      accessTokenExpiresAt: new Date('2026-07-08T14:30:00.000Z')
    });
    await expect(store.load('user-2')).resolves.toEqual({ status: 'not-connected' });
  });

  test('persists Calendar connection metadata from the signed-in User Google auth account', async () => {
    const store = createUserCalendarConnectionStore(database);
    saveAuthGoogleAccount(sqlite, 'user-1');

    await expect(store.saveConnectedFromGoogleAuthAccount('user-1')).resolves.toBe(true);

    await expect(store.load('user-1')).resolves.toEqual({
      status: 'connected',
      providerAccountId: 'google-user-1',
      grantedScopes: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/calendar.readonly'
      ],
      accessTokenAvailable: true,
      refreshTokenAvailable: true,
      accessTokenExpiresAt: new Date('2026-07-08T14:30:00.000Z')
    });
  });

  test('records failed consent without breaking the User connection surface', async () => {
    const store = createUserCalendarConnectionStore(database);

    await store.markFailed('user-1');

    await expect(store.load('user-1')).resolves.toEqual({ status: 'failed' });
    await expect(store.load('user-2')).resolves.toEqual({ status: 'not-connected' });
  });

  test('disconnect clears Calendar credentials and selected-calendar configuration for that User only', async () => {
    const store = createUserCalendarConnectionStore(database);

    await store.saveConnected('user-1', {
      providerAccountId: 'google-user-1',
      grantedScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      accessTokenAvailable: true,
      refreshTokenAvailable: true,
      accessTokenExpiresAt: null
    });
    await store.saveSelectedCalendars('user-1', ['primary', 'work']);
    await store.saveConnected('user-2', {
      providerAccountId: 'google-user-2',
      grantedScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      accessTokenAvailable: true,
      refreshTokenAvailable: false,
      accessTokenExpiresAt: null
    });
    await store.saveSelectedCalendars('user-2', ['primary']);

    await store.disconnect('user-1');

    await expect(store.load('user-1')).resolves.toEqual({ status: 'not-connected' });
    await expect(store.loadSelectedCalendarIds('user-1')).resolves.toEqual([]);
    await expect(store.load('user-2')).resolves.toMatchObject({
      status: 'connected',
      providerAccountId: 'google-user-2'
    });
    await expect(store.loadSelectedCalendarIds('user-2')).resolves.toEqual(['primary']);
  });
});
