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
    sqlite.exec(readFileSync('drizzle/0022_add_summary_section_pause_settings.sql', 'utf8'));
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

  test('persists independent Summary Section pause settings without changing legacy enablement', async () => {
    const database = drizzle(sqlite, { schema });
    const store = createUserSummaryConfigurationStore(database);

    await saveUserSummaryConfiguration(
      store,
      'user-1',
      {
        ...defaultSummaryConfiguration,
        sections: { weather: false, commute: true, calendar: true, todo: true },
        sectionPauses: { weather: true, commute: false, calendar: true, todo: false }
      },
      Temporal.Instant.from('2026-06-22T16:45:00Z')
    );

    expect(
      sqlite
        .prepare(
          `select weather_section_enabled, weather_section_paused,
             calendar_section_enabled, calendar_section_paused
           from summary_configurations where user_id = ?`
        )
        .get('user-1')
    ).toEqual({
      weather_section_enabled: 0,
      weather_section_paused: 1,
      calendar_section_enabled: 1,
      calendar_section_paused: 1
    });
    await expect(store.load('user-1')).resolves.toMatchObject({
      sections: { weather: false, calendar: true },
      sectionPauses: { weather: true, calendar: true }
    });
  });

  test('gives legacy rows a not-paused default during the additive migration', () => {
    const legacySqlite = new Database(':memory:');

    try {
      legacySqlite.exec(readFileSync('drizzle/0000_bootstrap_daily.sql', 'utf8'));
      legacySqlite
        .prepare('insert into users (id, google_subject, email) values (?, ?, ?)')
        .run('legacy-user-1', 'legacy-google-user-1', 'legacy-user-1@example.com');
      legacySqlite
        .prepare(
          `insert into summary_configurations (
             id, user_id, summary_time, user_time_zone, summary_theme,
             summary_delivery_enabled, weather_section_enabled, commute_section_enabled,
             calendar_section_enabled, todo_section_enabled
           ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run('legacy-summary-1', 'legacy-user-1', '07:00', 'UTC', 'light', 1, 1, 1, 1, 1);

      legacySqlite.exec(
        readFileSync('drizzle/0022_add_summary_section_pause_settings.sql', 'utf8')
      );

      expect(
        legacySqlite
          .prepare(
            `select weather_section_paused, commute_section_paused,
               calendar_section_paused, todo_section_paused
             from summary_configurations where id = ?`
          )
          .get('legacy-summary-1')
      ).toEqual({
        weather_section_paused: 0,
        commute_section_paused: 0,
        calendar_section_paused: 0,
        todo_section_paused: 0
      });
    } finally {
      legacySqlite.close();
    }
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
