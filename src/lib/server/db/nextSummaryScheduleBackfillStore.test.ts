import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as schema from './schema';
import { createNextSummaryScheduleBackfillStore } from './nextSummaryScheduleBackfillStore';

describe('next Summary schedule backfill lifecycle eligibility', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.exec(readFileSync('drizzle/0000_bootstrap_daily.sql', 'utf8'));
    sqlite.exec(readFileSync('drizzle/0011_add_next_summary_at.sql', 'utf8'));
    sqlite.exec(readFileSync('drizzle/0015_add_user_lifecycle.sql', 'utf8'));
    sqlite.exec('PRAGMA foreign_keys = ON;');
  });

  afterEach(() => sqlite.close());

  test('does not select or restore a schedule for a deleting User', async () => {
    sqlite.prepare(
      "insert into users (id, google_subject, email, lifecycle_state) values (?, ?, ?, 'deleting')"
    ).run('user-1', 'google-1', 'private@example.com');

    const store = createNextSummaryScheduleBackfillStore(drizzle(sqlite, { schema }));
    await expect(store.loadUsers()).resolves.toEqual([]);
    await store.saveNextSummaryAt(
      'user-1',
      '2026-07-17T07:00:00Z'
    );

    expect(sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')).toEqual({
      next_summary_at: null
    });
  });
});
