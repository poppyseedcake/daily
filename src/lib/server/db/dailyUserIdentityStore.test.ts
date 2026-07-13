import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as schema from './schema';
import { createDailyUserIdentityStore } from './dailyUserIdentityStore';

describe('SQLite Daily User identity store', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.exec(readFileSync('drizzle/0000_bootstrap_daily.sql', 'utf8'));
    sqlite.exec(readFileSync('drizzle/0011_add_next_summary_at.sql', 'utf8'));
  });

  afterEach(() => sqlite.close());

  test('initializes a new eligible User schedule without replacing it on a later sign-in', async () => {
    const store = createDailyUserIdentityStore(drizzle(sqlite, { schema }));
    const identity = {
      id: 'user-1',
      googleSubject: 'google-user-1',
      email: 'user-1@example.com'
    };

    await store.upsertGoogleUser(identity, '2026-06-23T07:00:00Z');
    await store.upsertGoogleUser(
      { ...identity, email: 'updated@example.com' },
      '2026-06-24T07:00:00Z'
    );

    expect(
      sqlite.prepare('select email, next_summary_at from users where id = ?').get('user-1')
    ).toEqual({
      email: 'updated@example.com',
      next_summary_at: '2026-06-23T07:00:00Z'
    });
  });
});
