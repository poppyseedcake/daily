import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  calendarConnections,
  deliveryRecords,
  googleMapsControl,
  googleMapsUsage,
  googleMapsPersonUsage,
  selectedCalendars,
  summaryConfigurations,
  todoCategories,
  todoTasks,
  users,
  weatherLocations
} from './schema';

describe('Daily database schema', () => {
  test('defines core Daily tables for the walking skeleton', () => {
    expect([
      getTableName(users),
      getTableName(summaryConfigurations),
      getTableName(todoCategories),
      getTableName(todoTasks),
      getTableName(weatherLocations),
      getTableName(calendarConnections),
      getTableName(selectedCalendars),
      getTableName(deliveryRecords),
      getTableName(googleMapsControl),
      getTableName(googleMapsUsage),
      getTableName(googleMapsPersonUsage),
      getTableName(authUser),
      getTableName(authSession),
      getTableName(authAccount),
      getTableName(authVerification)
    ]).toEqual([
      'users',
      'summary_configurations',
      'todo_categories',
      'todo_tasks',
      'weather_locations',
      'calendar_connections',
      'selected_calendars',
      'delivery_records',
      'google_maps_control',
      'google_maps_usage',
      'google_maps_person_usage',
      'auth_user',
      'auth_session',
      'auth_account',
      'auth_verification'
    ]);
  });

  test('ships an initial SQLite migration for the core schema', () => {
    const migrationPath = 'drizzle/0000_bootstrap_daily.sql';

    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('CREATE TABLE `users`');
    expect(migration).toContain('CREATE TABLE `summary_configurations`');
    expect(migration).toContain('CREATE TABLE `todo_categories`');
    expect(migration).toContain('CREATE TABLE `todo_tasks`');
    expect(migration).not.toContain('CREATE TABLE `delivery_records`');
    expect(migration).not.toContain('CREATE TABLE `auth_user`');
    expect(migration).not.toContain('CREATE TABLE `auth_session`');
    expect(migration).not.toContain('CREATE TABLE `auth_account`');
    expect(migration).not.toContain('CREATE TABLE `auth_verification`');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX `summary_configurations_user_id_unique` ON `summary_configurations` (`user_id`)'
    );
  });

  test('ships auth tables in an upgrade migration', () => {
    const migrationPath = 'drizzle/0001_add_better_auth_tables.sql';

    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('CREATE TABLE `auth_user`');
    expect(migration).toContain('CREATE TABLE `auth_session`');
    expect(migration).toContain('CREATE TABLE `auth_account`');
    expect(migration).toContain('CREATE TABLE `auth_verification`');
    expect(migration).toContain('CREATE UNIQUE INDEX `auth_user_email_idx` ON `auth_user` (`email`)');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX `auth_session_token_idx` ON `auth_session` (`token`)'
    );
  });

  test('ships Delivery Records in an upgrade migration', () => {
    const migrationPath = 'drizzle/0002_add_delivery_records.sql';

    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('CREATE TABLE `delivery_records`');
    expect(migration).toContain('`attempt_type` text NOT NULL');
    expect(migration).toContain('`provider_message_id` text');
    expect(migration).toContain('`error_classification` text');
    expect(migration).toContain('FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)');
    expect(migration).toContain(
      'CREATE INDEX `delivery_records_user_requested_at_idx` ON `delivery_records` (`user_id`,`requested_at`)'
    );
  });

  test('ships privacy-safe Google Maps usage counters in an upgrade migration', () => {
    const migrationPath = 'drizzle/0006_add_google_maps_usage.sql';
    const journalPath = 'drizzle/meta/_journal.json';

    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(journalPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(migration).toContain('CREATE TABLE `google_maps_usage`');
    expect(migration).toContain('`period_start_utc` text NOT NULL');
    expect(migration).toContain("CHECK (`period_kind` IN ('day', 'month'))");
    expect(migration).toContain(
      "CHECK (`category` IN ('map-point-selection', 'commute-estimate'))"
    );
    expect(migration).toContain('`request_count` integer NOT NULL');
    expect(migration).not.toMatch(/origin|destination|route_name|provider_payload|rendered/i);
    expect(journal.entries.find(({ idx }) => idx === 6)).toEqual({
      idx: 6,
      tag: '0006_add_google_maps_usage',
      version: '6',
      when: 1783843200006,
      breakpoints: true
    });
  });

  test('ships opaque per-person Google Maps counters without Admin-facing metadata', () => {
    const migration = readFileSync('drizzle/0007_add_google_maps_person_usage.sql', 'utf8');
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(migration).toContain('CREATE TABLE `google_maps_person_usage`');
    expect(migration).toContain('`period_start_utc` text NOT NULL');
    expect(migration).toContain('`person_usage_identity` text NOT NULL');
    expect(migration).not.toMatch(/user_id|email|visitor_token|attribution_secret|category/i);
    expect(journal.entries.find(({ idx }) => idx === 7)).toMatchObject({
      idx: 7,
      tag: '0007_add_google_maps_person_usage'
    });
  });

  test('ships the SQLite-backed Google Maps control without private Maps data', () => {
    const migration = readFileSync('drizzle/0008_add_google_maps_control.sql', 'utf8');
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(migration).toContain('CREATE TABLE `google_maps_control`');
    expect(migration).toContain("CHECK (`control_key` = 'admin-kill-switch')");
    expect(migration).toContain('CHECK (`enabled` IN (0, 1))');
    expect(migration).not.toMatch(/user_id|email|origin|destination|route|provider|summary/i);
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 8,
      tag: '0008_add_google_maps_control'
    });
  });

  test('ships Weather Locations in an upgrade migration without forecast snapshots', () => {
    const migrationPath = 'drizzle/0003_add_weather_locations.sql';

    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('CREATE TABLE `weather_locations`');
    expect(migration).toContain('`label` text NOT NULL');
    expect(migration).toContain('`latitude` real NOT NULL');
    expect(migration).toContain('`longitude` real NOT NULL');
    expect(migration).toContain('FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX `weather_locations_user_id_unique` ON `weather_locations` (`user_id`)'
    );
    expect(migration).not.toContain('forecast');
    expect(migration).not.toContain('payload');
    expect(migration).not.toContain('rendered');
  });

  test('ships Calendar Connections and Selected Calendars in an upgrade migration', () => {
    const migrationPath = 'drizzle/0004_add_calendar_connections.sql';

    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('CREATE TABLE `calendar_connections`');
    expect(migration).toContain('`connection_status` text NOT NULL');
    expect(migration).toContain('`granted_scopes` text DEFAULT');
    expect(migration).toContain('`access_token_available` integer DEFAULT false NOT NULL');
    expect(migration).toContain('`refresh_token_available` integer DEFAULT false NOT NULL');
    expect(migration).toContain('`access_token_expires_at` integer');
    expect(migration).toContain('CREATE TABLE `selected_calendars`');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX `calendar_connections_user_id_unique` ON `calendar_connections` (`user_id`)'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX `selected_calendars_user_calendar_idx` ON `selected_calendars` (`user_id`,`calendar_id`)'
    );
  });

  test('does not define durable weather forecast snapshot storage in migrations', () => {
    const migrations = readdirSync('drizzle')
      .filter((fileName) => fileName.endsWith('.sql'))
      .map((fileName) => readFileSync(`drizzle/${fileName}`, 'utf8').toLowerCase())
      .join('\n');

    expect(migrations).not.toContain('weather_forecast');
    expect(migrations).not.toContain('forecast_snapshot');
    expect(migrations).not.toContain('weather_payload');
    expect(migrations).not.toContain('forecast_payload');
    expect(migrations).not.toContain('open_meteo_payload');
  });

  test('keeps Calendar Event and rendered Calendar content out of durable tables', () => {
    expect(Object.keys(getTableColumns(deliveryRecords))).toEqual([
      'id',
      'userId',
      'attemptType',
      'requestedAt',
      'completedAt',
      'deliveryStatus',
      'providerName',
      'providerMessageId',
      'providerStatusMetadata',
      'errorClassification'
    ]);

    const migrations = readdirSync('drizzle')
      .filter((fileName) => fileName.endsWith('.sql'))
      .map((fileName) => readFileSync(`drizzle/${fileName}`, 'utf8').toLowerCase())
      .join('\n');

    for (const forbiddenStorage of [
      'create table `calendar_events`',
      'calendar_event_payload',
      'event_title',
      'event_description',
      'event_location',
      'event_attendees',
      'rendered_calendar',
      'calendar_webhook',
      'calendar_sync',
      'calendar_event_cache'
    ]) {
      expect(migrations).not.toContain(forbiddenStorage);
    }
  });

  test('does not expose Calendar sync, webhook, or scheduled-worker entry points', () => {
    const productionRoutePaths = readdirSync('src/routes', {
      recursive: true,
      encoding: 'utf8'
    }).filter((path) => !path.includes('.test.'));
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(productionRoutePaths.filter((path) => /webhook|sync|worker|calendar-events?/i.test(path))).toEqual([]);
    expect(Object.keys(packageJson.scripts).filter((script) => /webhook|sync|worker|cron/i.test(script))).toEqual([]);
  });
});
