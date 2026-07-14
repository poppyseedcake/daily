import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as schema from './schema';
import { createScheduledDailySummaryOccurrenceStore } from './scheduledDailySummaryOccurrenceStore';

describe('scheduled Daily Summary occurrence batches', () => {
  let sqlite: Database.Database;
  let store: ReturnType<typeof createScheduledDailySummaryOccurrenceStore>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    for (const migration of [
      '0000_bootstrap_daily.sql',
      '0002_add_delivery_records.sql',
      '0011_add_next_summary_at.sql',
      '0012_add_scheduled_delivery_claims.sql'
    ]) {
      sqlite.exec(readFileSync(`drizzle/${migration}`, 'utf8'));
    }
    store = createScheduledDailySummaryOccurrenceStore(drizzle(sqlite, { schema }));
  });

  afterEach(() => sqlite.close());

  test('returns new occurrences and retries at the exact boundary in stable bounded pages', async () => {
    const insertUser = sqlite.prepare(
      'insert into users (id, google_subject, email, next_summary_at) values (?, ?, ?, ?)'
    );
    insertUser.run('user-before', 'google-before', 'before@private.example', '2026-07-14T06:59:00.000Z');
    insertUser.run('user-exact', 'google-exact', 'exact@private.example', '2026-07-14T07:00:00.000Z');
    insertUser.run('user-retry', 'google-retry', 'retry@private.example', null);
    insertUser.run('user-after', 'google-after', 'after@private.example', '2026-07-14T07:00:00.001Z');
    sqlite
      .prepare(
        `insert into delivery_records (
          id, user_id, attempt_type, requested_at, delivery_status, provider_name,
          scheduled_at, attempt_count, next_retry_at, error_classification
        ) values (?, ?, 'scheduled', ?, 'retrying', ?, ?, 1, ?, 'provider-unavailable')`
      )
      .run(
        'record-retry',
        'user-retry',
        '2026-07-14T06:58:00.000Z',
        'fake-delivery',
        '2026-07-14T06:58:00.000Z',
        '2026-07-14T07:00:00.000Z'
      );

    const first = await store.loadProcessableBatch({
      now: '2026-07-14T07:00:00.000Z',
      limit: 2,
      after: null
    });
    const second = await store.loadProcessableBatch({
      now: '2026-07-14T07:00:00.000Z',
      limit: 2,
      after: { scheduledAt: first[1].scheduledAt, workId: first[1].workId }
    });
    const third = await store.loadProcessableBatch({
      now: '2026-07-14T07:00:00.000Z',
      limit: 2,
      after: { scheduledAt: second[0].scheduledAt, workId: second[0].workId }
    });

    expect(first.map(({ scheduledAt, workId }) => ({ scheduledAt, workId }))).toEqual([
      { scheduledAt: '2026-07-14T06:58:00.000Z', workId: 'retry:record-retry' },
      { scheduledAt: '2026-07-14T06:59:00.000Z', workId: 'new:user-before' }
    ]);
    expect(second.map(({ scheduledAt, workId }) => ({ scheduledAt, workId }))).toEqual([
      { scheduledAt: '2026-07-14T07:00:00.000Z', workId: 'new:user-exact' }
    ]);
    expect(third).toEqual([]);
  });
});
