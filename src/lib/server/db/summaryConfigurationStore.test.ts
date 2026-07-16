import { readFileSync } from 'node:fs';
import { Temporal } from '@js-temporal/polyfill';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { defaultSummaryConfiguration } from '$lib/summaryConfiguration';
import { saveUserSummaryConfiguration } from '../summaryConfigurationPersistence';
import * as schema from './schema';
import { createUserSummaryConfigurationStore } from './summaryConfigurationStore';

describe('SQLite User Summary Configuration store', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(readFileSync('drizzle/0000_bootstrap_daily.sql', 'utf8'));
    sqlite.exec(readFileSync('drizzle/0011_add_next_summary_at.sql', 'utf8'));
    sqlite.exec(readFileSync('drizzle/0015_add_user_lifecycle.sql', 'utf8'));
    sqlite
      .prepare(
        'insert into users (id, google_subject, email) values (?, ?, ?)'
      )
      .run('user-1', 'google-user-1', 'user-1@example.com');
  });

  afterEach(() => sqlite.close());

  test('atomically saves Summary Configuration and its freshly calculated UTC schedule', async () => {
    const database = drizzle(sqlite, { schema });
    const store = createUserSummaryConfigurationStore(database);

    await saveUserSummaryConfiguration(
      store,
      'user-1',
      { ...defaultSummaryConfiguration, summaryTime: '18:45', userTimeZone: 'Europe/Warsaw' },
      Temporal.Instant.from('2026-06-22T16:45:00Z')
    );

    expect(
      sqlite
        .prepare(
          'select summary_time, user_time_zone from summary_configurations where user_id = ?'
        )
        .get('user-1')
    ).toEqual({ summary_time: '18:45', user_time_zone: 'Europe/Warsaw' });
    expect(sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')).toEqual({
      next_summary_at: '2026-06-23T16:45:00Z'
    });
  });

  test('clears a stale schedule when Summary Delivery becomes disabled', async () => {
    sqlite.prepare('update users set next_summary_at = ? where id = ?').run(
      '2026-06-22T16:45:00Z',
      'user-1'
    );
    const store = createUserSummaryConfigurationStore(drizzle(sqlite, { schema }));

    await saveUserSummaryConfiguration(
      store,
      'user-1',
      { ...defaultSummaryConfiguration, summaryDeliveryEnabled: false },
      Temporal.Instant.from('2026-06-22T00:00:00Z')
    );

    expect(sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')).toEqual({
      next_summary_at: null
    });
  });

  test('cannot restore Summary Delivery or scheduling for a deleting User', async () => {
    sqlite.prepare("update users set lifecycle_state = 'deleting' where id = ?").run('user-1');
    const store = createUserSummaryConfigurationStore(drizzle(sqlite, { schema }));

    await saveUserSummaryConfiguration(
      store,
      'user-1',
      { ...defaultSummaryConfiguration, summaryDeliveryEnabled: true },
      Temporal.Instant.from('2026-06-22T00:00:00Z')
    );

    expect(sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')).toEqual({
      next_summary_at: null
    });
    expect(sqlite.prepare(
      'select count(*) as count from summary_configurations where user_id = ?'
    ).get('user-1')).toEqual({ count: 0 });
  });
});
