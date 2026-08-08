import { readFileSync } from 'node:fs';
import { Temporal } from '@js-temporal/polyfill';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { defaultSummaryConfiguration } from '$lib/summaryConfiguration';
import { saveUserSummaryConfiguration } from '../summaryConfigurationPersistence';
import * as schema from './schema';
import { createUserSummaryConfigurationStore } from './summaryConfigurationStore';

const insertSummaryConfiguration = (
  sqlite: Database.Database,
  configuration: {
    summaryDeliveryEnabled: boolean;
    userTimeZone: string;
    sectionPauses: typeof defaultSummaryConfiguration.sectionPauses;
  }
) =>
  sqlite
    .prepare(
      `insert into summary_configurations (
        id, user_id, summary_time, user_time_zone, summary_delivery_enabled,
        weather_section_paused, commute_section_paused, calendar_section_paused, todo_section_paused
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'configuration-1',
      'user-1',
      '07:00',
      configuration.userTimeZone,
      configuration.summaryDeliveryEnabled ? 1 : 0,
      configuration.sectionPauses.weather ? 1 : 0,
      configuration.sectionPauses.commute ? 1 : 0,
      configuration.sectionPauses.calendar ? 1 : 0,
      configuration.sectionPauses.todo ? 1 : 0
    );

describe('SQLite User Summary Configuration store', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(readFileSync('drizzle/0000_bootstrap_daily.sql', 'utf8'));
    sqlite.exec(readFileSync('drizzle/0002_add_delivery_records.sql', 'utf8'));
    sqlite.exec(readFileSync('drizzle/0011_add_next_summary_at.sql', 'utf8'));
    sqlite.exec(readFileSync('drizzle/0012_add_scheduled_delivery_claims.sql', 'utf8'));
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

    const result = await saveUserSummaryConfiguration(
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
    expect(result).toEqual({ outcome: 'saved' });
    expect(sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')).toEqual({
      next_summary_at: '2026-06-23T16:45:00Z'
    });
  });

  test('persists canonical Summary Section pause settings', async () => {
    const database = drizzle(sqlite, { schema });
    const store = createUserSummaryConfigurationStore(database);

    await saveUserSummaryConfiguration(
      store,
      'user-1',
      {
        ...defaultSummaryConfiguration,
        sectionPauses: { weather: true, commute: false, calendar: true, todo: false }
      },
      Temporal.Instant.from('2026-06-22T16:45:00Z')
    );

    expect(
      sqlite
        .prepare(
          `select weather_section_paused, calendar_section_paused
           from summary_configurations where user_id = ?`
        )
        .get('user-1')
    ).toEqual({
      weather_section_paused: 1,
      calendar_section_paused: 1
    });
    await expect(store.load('user-1')).resolves.toMatchObject({
      sectionPauses: { weather: true, calendar: true }
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

  test('cancels retrying scheduled records when Summary Delivery becomes disabled', async () => {
    insertSummaryConfiguration(sqlite, {
      summaryDeliveryEnabled: true,
      userTimeZone: 'UTC',
      sectionPauses: { weather: false, commute: false, calendar: false, todo: false }
    });
    sqlite
      .prepare(
        `insert into delivery_records (
          id, user_id, attempt_type, requested_at, delivery_status, provider_name,
          scheduled_at, attempt_count, last_attempt_at, next_retry_at
        ) values (?, ?, 'scheduled', ?, 'retrying', ?, ?, ?, ?, ?)`
      )
      .run(
        'retrying-delivery',
        'user-1',
        '2026-06-22T07:00:00Z',
        'resend',
        '2026-06-22T07:00:00Z',
        2,
        '2026-06-22T07:05:00Z',
        '2026-06-22T07:10:00Z'
      );
    sqlite
      .prepare(
        `insert into delivery_records (
          id, user_id, attempt_type, requested_at, delivery_status, provider_name,
          scheduled_at, attempt_count, last_attempt_at, claim_expires_at
        ) values (?, ?, 'scheduled', ?, 'processing', ?, ?, ?, ?, ?)`
      )
      .run(
        'processing-delivery',
        'user-1',
        '2026-06-22T07:01:00Z',
        'resend',
        '2026-06-22T07:01:00Z',
        1,
        '2026-06-22T07:05:00Z',
        '2026-06-22T07:10:00Z'
      );
    const store = createUserSummaryConfigurationStore(drizzle(sqlite, { schema }));

    await saveUserSummaryConfiguration(
      store,
      'user-1',
      { ...defaultSummaryConfiguration, summaryDeliveryEnabled: false },
      Temporal.Instant.from('2026-06-22T07:06:00Z')
    );

    expect(
      sqlite
        .prepare(
          `select id, delivery_status, attempt_count, completed_at, next_retry_at,
                  claim_expires_at, error_classification
             from delivery_records order by id`
        )
        .all()
    ).toEqual([
      {
        id: 'processing-delivery',
        delivery_status: 'processing',
        attempt_count: 1,
        completed_at: null,
        next_retry_at: null,
        claim_expires_at: '2026-06-22T07:10:00Z',
        error_classification: null
      },
      {
        id: 'retrying-delivery',
        delivery_status: 'cancelled',
        attempt_count: 2,
        completed_at: '2026-06-22T07:06:00Z',
        next_retry_at: null,
        claim_expires_at: null,
        error_classification: 'summary-delivery-disabled'
      }
    ]);
  });

  test('schedules an enabled Summary Delivery even when every Summary Section is paused', async () => {
    insertSummaryConfiguration(sqlite, {
      summaryDeliveryEnabled: false,
      userTimeZone: 'Europe/Warsaw',
      sectionPauses: { weather: true, commute: true, calendar: true, todo: true }
    });
    const store = createUserSummaryConfigurationStore(drizzle(sqlite, { schema }));

    const result = await saveUserSummaryConfiguration(
      store,
      'user-1',
      {
        ...defaultSummaryConfiguration,
        userTimeZone: 'Europe/Warsaw',
        sectionPauses: { weather: true, commute: true, calendar: true, todo: true }
      },
      Temporal.Instant.from('2026-06-22T00:00:00Z')
    );

    expect(result).toEqual({ outcome: 'saved' });
    expect(sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')).toEqual({
      next_summary_at: '2026-06-22T05:00:00Z'
    });
  });

  test('preserves the scheduled occurrence when only a Summary Section pause changes', async () => {
    insertSummaryConfiguration(sqlite, {
      summaryDeliveryEnabled: true,
      userTimeZone: 'UTC',
      sectionPauses: { weather: false, commute: false, calendar: false, todo: false }
    });
    sqlite
      .prepare('update users set next_summary_at = ? where id = ?')
      .run('2026-06-23T07:00:00Z', 'user-1');
    const store = createUserSummaryConfigurationStore(drizzle(sqlite, { schema }));

    const result = await saveUserSummaryConfiguration(
      store,
      'user-1',
      {
        ...defaultSummaryConfiguration,
        sectionPauses: { weather: true, commute: false, calendar: false, todo: false }
      },
      Temporal.Instant.from('2026-06-22T08:00:00Z')
    );

    expect(result).toEqual({ outcome: 'saved' });
    expect(sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')).toEqual({
      next_summary_at: '2026-06-23T07:00:00Z'
    });
    await expect(store.load('user-1')).resolves.toMatchObject({
      sectionPauses: { weather: true }
    });
  });

  test('cannot restore Summary Delivery or scheduling for a deleting User', async () => {
    sqlite.prepare("update users set lifecycle_state = 'deleting' where id = ?").run('user-1');
    const store = createUserSummaryConfigurationStore(drizzle(sqlite, { schema }));

    const result = await saveUserSummaryConfiguration(
      store,
      'user-1',
      { ...defaultSummaryConfiguration, summaryDeliveryEnabled: true },
      Temporal.Instant.from('2026-06-22T00:00:00Z')
    );

    expect(result).toEqual({ outcome: 'save-failed' });
    expect(sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')).toEqual({
      next_summary_at: null
    });
    expect(sqlite.prepare(
      'select count(*) as count from summary_configurations where user_id = ?'
    ).get('user-1')).toEqual({ count: 0 });
  });
});
