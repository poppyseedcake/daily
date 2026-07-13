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
  sqlite.exec(readFileSync('drizzle/0005_add_selected_calendar_metadata.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0011_add_next_summary_at.sql', 'utf8'));

  return {
    sqlite,
    database: drizzle(sqlite, { schema })
  };
};

const saveUser = (sqlite: Database.Database, id: string, googleSubject = `google-${id}`) => {
  sqlite
    .prepare(
      'insert into users (id, google_subject, email, created_at, updated_at) values (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
    )
    .run(id, googleSubject, `${id}@example.com`);
};

const saveAuthGoogleAccount = (
  sqlite: Database.Database,
  userId: string,
  overrides: Partial<{
    id: string;
    accountId: string;
    accessToken: string;
    refreshToken: string;
    scope: string;
    createdAt: number;
    updatedAt: number;
  }> = {}
) => {
  sqlite
    .prepare(
      'insert or ignore into auth_user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, true, ?, ?)'
    )
    .run(userId, 'Daily User', `${userId}@example.com`, 1783521000000, 1783521000000);
  sqlite
    .prepare(
      'insert into auth_account (id, account_id, provider_id, user_id, access_token, refresh_token, access_token_expires_at, scope, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      overrides.id ?? `account-${userId}`,
      overrides.accountId ?? `google-${userId}`,
      'google',
      userId,
      overrides.accessToken ?? `access-${userId}`,
      overrides.refreshToken ?? `refresh-${userId}`,
      1783521000,
      overrides.scope ?? 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
      overrides.createdAt ?? 1783519200000,
      overrides.updatedAt ?? 1783519200000
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

  test('persists Calendar connection to the Daily user matched by Google subject', async () => {
    const store = createUserCalendarConnectionStore(database);
    saveUser(sqlite, 'daily-user-1', 'google-subject-1');
    saveAuthGoogleAccount(sqlite, 'auth-user-1', {
      accountId: 'google-subject-1'
    });

    await expect(store.saveConnectedFromGoogleAuthAccount('auth-user-1')).resolves.toBe(true);

    await expect(store.load('daily-user-1')).resolves.toMatchObject({
      status: 'connected',
      providerAccountId: 'google-subject-1'
    });
  });

  test('uses the newest Calendar-scoped Google auth account for the signed-in auth user', async () => {
    const store = createUserCalendarConnectionStore(database);
    saveAuthGoogleAccount(sqlite, 'user-1', {
      id: 'account-user-1-stale',
      scope: 'openid email profile',
      updatedAt: 1783519200000
    });
    saveAuthGoogleAccount(sqlite, 'user-1', {
      id: 'account-user-1-calendar',
      accessToken: 'access-calendar',
      scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
      updatedAt: 1783522800000
    });

    await expect(store.saveConnectedFromGoogleAuthAccount('user-1')).resolves.toBe(true);

    await expect(store.load('user-1')).resolves.toMatchObject({
      status: 'connected',
      accessTokenAvailable: true,
      grantedScopes: expect.arrayContaining(['https://www.googleapis.com/auth/calendar.readonly'])
    });
  });

  test('ignores newer Google auth accounts that do not include the Calendar scope', async () => {
    const store = createUserCalendarConnectionStore(database);
    saveAuthGoogleAccount(sqlite, 'user-1', {
      id: 'account-user-1-calendar',
      accessToken: 'access-calendar',
      scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
      updatedAt: 1783519200000
    });
    saveAuthGoogleAccount(sqlite, 'user-1', {
      id: 'account-user-1-identity-only',
      scope: 'openid email profile',
      updatedAt: 1783522800000
    });

    await expect(store.saveConnectedFromGoogleAuthAccount('user-1')).resolves.toBe(true);

    await expect(store.load('user-1')).resolves.toMatchObject({
      status: 'connected',
      accessTokenAvailable: true,
      grantedScopes: expect.arrayContaining(['https://www.googleapis.com/auth/calendar.readonly'])
    });
  });

  test('rolls back selected Calendar replacement when an insert fails', async () => {
    const store = createUserCalendarConnectionStore(database);
    await store.saveSelectedCalendars('user-1', [
      { id: 'primary', summary: 'Ada Lovelace', backgroundColor: '#3f51b5', primary: true },
      { id: 'work', summary: 'Work', backgroundColor: '#0b8043', primary: false }
    ]);

    await expect(
      store.saveSelectedCalendars('user-1', [
        { id: 'personal', summary: 'Personal', backgroundColor: null, primary: false },
        { id: 'personal', summary: 'Duplicate', backgroundColor: null, primary: false }
      ])
    ).rejects.toThrow();

    await expect(store.loadSelectedCalendarIds('user-1')).resolves.toEqual(['primary', 'work']);
  });

  test('persists selected Calendar display metadata per User without event content', async () => {
    const store = createUserCalendarConnectionStore(database);

    await store.saveSelectedCalendars('user-1', [
      {
        id: 'primary',
        summary: 'Ada Lovelace',
        backgroundColor: '#3f51b5',
        primary: true
      },
      {
        id: 'work',
        summary: 'Work',
        backgroundColor: null,
        primary: false
      }
    ]);
    await store.saveSelectedCalendars('user-2', [
      {
        id: 'family',
        summary: 'Family',
        backgroundColor: '#d50000',
        primary: false
      }
    ]);

    await expect(store.loadSelectedCalendars('user-1')).resolves.toEqual([
      {
        id: 'primary',
        summary: 'Ada Lovelace',
        backgroundColor: '#3f51b5',
        primary: true
      },
      {
        id: 'work',
        summary: 'Work',
        backgroundColor: null,
        primary: false
      }
    ]);
    await expect(store.loadSelectedCalendarIds('user-1')).resolves.toEqual(['primary', 'work']);
    await expect(store.loadSelectedCalendars('user-2')).resolves.toEqual([
      {
        id: 'family',
        summary: 'Family',
        backgroundColor: '#d50000',
        primary: false
      }
    ]);
    expect(JSON.stringify(await store.loadSelectedCalendars('user-1'))).not.toContain('event');
    expect(JSON.stringify(await store.loadSelectedCalendars('user-1'))).not.toContain('attendees');
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
    await store.saveSelectedCalendars('user-1', [
      { id: 'primary', summary: 'Ada Lovelace', backgroundColor: '#3f51b5', primary: true },
      { id: 'work', summary: 'Work', backgroundColor: '#0b8043', primary: false }
    ]);
    await store.saveConnected('user-2', {
      providerAccountId: 'google-user-2',
      grantedScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      accessTokenAvailable: true,
      refreshTokenAvailable: false,
      accessTokenExpiresAt: null
    });
    await store.saveSelectedCalendars('user-2', [
      { id: 'primary', summary: 'Other Primary', backgroundColor: null, primary: true }
    ]);

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
