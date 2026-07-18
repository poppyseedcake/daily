import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  calendarConnections,
  commuteDays,
  commuteRoutes,
  deliveryRecords,
  googleMapsCapAlerts,
  googleMapsControl,
  googleMapsUsage,
  googleMapsPersonUsage,
  selectedCalendars,
  scheduledWorkerRuns,
  summaryConfigurations,
  technicalLogRecords,
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
      getTableName(technicalLogRecords),
      getTableName(scheduledWorkerRuns),
      getTableName(todoCategories),
      getTableName(todoTasks),
      getTableName(weatherLocations),
      getTableName(commuteRoutes),
      getTableName(commuteDays),
      getTableName(calendarConnections),
      getTableName(selectedCalendars),
      getTableName(deliveryRecords),
      getTableName(googleMapsCapAlerts),
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
      'technical_log_records',
      'scheduled_worker_runs',
      'todo_categories',
      'todo_tasks',
      'weather_locations',
      'commute_routes',
      'commute_days',
      'calendar_connections',
      'selected_calendars',
      'delivery_records',
      'google_maps_cap_alerts',
      'google_maps_control',
      'google_maps_usage',
      'google_maps_person_usage',
      'auth_user',
      'auth_session',
      'auth_account',
      'auth_verification'
    ]);
  });

  test('ships bounded privacy-safe Technical Log Records in an upgrade migration', () => {
    const migration = readFileSync('drizzle/0013_add_technical_log_records.sql', 'utf8');
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(migration).toContain('CREATE TABLE `technical_log_records`');
    expect(migration).toContain('`event_code` text NOT NULL');
    expect(migration).toContain('`failure_classification` text');
    expect(migration).toContain('`correlation_id` text');
    expect(migration).toContain('`duration_milliseconds` integer');
    expect(migration).not.toMatch(/user_id|email|message|stack|cause|payload|token|session|address/i);
    expect(journal.entries.find(({ idx }) => idx === 13)).toMatchObject({
      idx: 13,
      tag: '0013_add_technical_log_records'
    });
  });

  test('ships privacy-safe Scheduled Worker Runs in an upgrade migration', () => {
    const migration = readFileSync('drizzle/0014_add_scheduled_worker_runs.sql', 'utf8');
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(Object.keys(getTableColumns(scheduledWorkerRuns))).toEqual([
      'id',
      'startedAt',
      'completedAt',
      'durationMilliseconds',
      'outcome',
      'failureClassification',
      'dueCount',
      'sentCount',
      'skippedCount',
      'retryingCount',
      'failedCount',
      'isolatedErrorCount'
    ]);
    expect(migration).toContain('CREATE TABLE `scheduled_worker_runs`');
    expect(migration).toContain('`started_at` text NOT NULL');
    expect(migration).toContain('`completed_at` text NOT NULL');
    expect(migration).toContain('`duration_milliseconds` integer NOT NULL');
    expect(migration).toContain('`failure_classification` text');
    expect(migration).toContain('`isolated_error_count` integer NOT NULL');
    expect(migration).not.toMatch(
      /user_id|email|recipient|content|provider_payload|provider_message|token|session/i
    );
    expect(journal.entries.find(({ idx }) => idx === 14)).toMatchObject({
      idx: 14,
      tag: '0014_add_scheduled_worker_runs'
    });
  });

  test('ships the active and deleting User lifecycle with existing Users active', () => {
    const migration = readFileSync('drizzle/0015_add_user_lifecycle.sql', 'utf8');
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(getTableColumns(users).lifecycleState).toBeDefined();
    expect(migration).toContain("ADD `lifecycle_state` text DEFAULT 'active' NOT NULL");
    expect(migration).toContain("CHECK (`lifecycle_state` IN ('active', 'deleting'))");
    expect(journal.entries.find(({ idx }) => idx === 15)).toMatchObject({
      idx: 15,
      tag: '0015_add_user_lifecycle'
    });
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
    expect(journal.entries.find(({ idx }) => idx === 8)).toMatchObject({
      idx: 8,
      tag: '0008_add_google_maps_control'
    });
  });

  test('ships durable privacy-safe Google Maps cap alert deduplication state', () => {
    const migrationPath = 'drizzle/0009_add_google_maps_cap_alerts.sql';

    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(migration).toContain('CREATE TABLE `google_maps_cap_alerts`');
    expect(migration).toContain("CHECK (`cap_type` IN ('daily', 'monthly'))");
    expect(migration).toContain(
      "CHECK (`delivery_status` IN ('pending', 'delivered', 'failed'))"
    );
    expect(migration).toContain('PRIMARY KEY(`cap_type`, `period_start_utc`)');
    expect(migration).not.toMatch(
      /person|user_id|email|origin|destination|route|provider_payload|summary/i
    );
    expect(journal.entries.find(({ idx }) => idx === 9)).toMatchObject({
      idx: 9,
      tag: '0009_add_google_maps_cap_alerts'
    });
  });

  test('ships User-scoped Commute Routes and shared Commute Days in an upgrade migration', () => {
    const migration = readFileSync('drizzle/0010_add_commute_setup.sql', 'utf8');
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(migration).toContain('CREATE TABLE `commute_routes`');
    expect(migration).toContain('CREATE TABLE `commute_days`');
    expect(migration).toContain('`user_id` text NOT NULL REFERENCES `users`(`id`)');
    expect(migration).toContain('CREATE UNIQUE INDEX `commute_routes_user_position_idx`');
    expect(migration).toContain('PRIMARY KEY(`user_id`, `day`)');
    expect(journal.entries.find(({ idx }) => idx === 10)).toMatchObject({
      idx: 10,
      tag: '0010_add_commute_setup'
    });
  });

  test('ships persisted baseline Commute durations for cost-free previews', () => {
    const migration = readFileSync('drizzle/0016_add_commute_preview_duration.sql', 'utf8');
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(getTableColumns(commuteRoutes).previewDurationMinutes).toBeDefined();
    expect(migration).toContain('ADD `preview_duration_minutes` integer');
    expect(journal.entries.find(({ idx }) => idx === 16)).toMatchObject({
      idx: 16,
      tag: '0016_add_commute_preview_duration'
    });
  });

  test('ships nullable UTC next Daily Summary schedule storage in an upgrade migration', () => {
    const migration = readFileSync('drizzle/0011_add_next_summary_at.sql', 'utf8');
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(Object.keys(getTableColumns(users))).toContain('nextSummaryAt');
    expect(migration).toContain('ALTER TABLE `users` ADD `next_summary_at` text');
    expect(journal.entries.find(({ idx }) => idx === 11)).toMatchObject({
      idx: 11,
      tag: '0011_add_next_summary_at'
    });
  });

  test('ships unique Scheduled Delivery occurrence claims in an upgrade migration', () => {
    const migration = readFileSync('drizzle/0012_add_scheduled_delivery_claims.sql', 'utf8');
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(Object.keys(getTableColumns(deliveryRecords))).toEqual(
      expect.arrayContaining([
        'scheduledAt',
        'attemptCount',
        'lastAttemptAt',
        'nextRetryAt',
        'claimExpiresAt'
      ])
    );
    expect(migration).toContain('ALTER TABLE \`delivery_records\` ADD \`scheduled_at\` text');
    expect(migration).toContain('ALTER TABLE \`delivery_records\` ADD \`attempt_count\` integer');
    expect(migration).toContain('ALTER TABLE \`delivery_records\` ADD \`last_attempt_at\` text');
    expect(migration).toContain('ALTER TABLE \`delivery_records\` ADD \`next_retry_at\` text');
    expect(migration).toContain('ALTER TABLE \`delivery_records\` ADD \`claim_expires_at\` text');
    expect(migration).toContain(
      "CREATE UNIQUE INDEX \`delivery_records_scheduled_occurrence_idx\` ON \`delivery_records\` (\`user_id\`,\`scheduled_at\`) WHERE \`attempt_type\` = 'scheduled'"
    );
    expect(migration).not.toMatch(/html|plain_text|section_content|provider_response|credential|token/i);
    expect(journal.entries.find(({ idx }) => idx === 12)).toMatchObject({
      idx: 12,
      tag: '0012_add_scheduled_delivery_claims'
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
      'errorClassification',
      'scheduledAt',
      'attemptCount',
      'lastAttemptAt',
      'nextRetryAt',
      'claimExpiresAt'
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

  test('exposes scheduled delivery only as a non-interactive command, not a public route', () => {
    const productionRoutePaths = readdirSync('src/routes', {
      recursive: true,
      encoding: 'utf8'
    }).filter((path) => !path.includes('.test.'));
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(productionRoutePaths.filter((path) => /webhook|sync|worker|calendar-events?/i.test(path))).toEqual([]);
    expect(Object.keys(packageJson.scripts).filter((script) => /webhook|sync|worker|cron/i.test(script))).toEqual([
      'worker:scheduled-delivery'
    ]);
    expect(packageJson.scripts['worker:scheduled-delivery']).toBe(
      'vite-node --config vite.worker.config.ts src/lib/server/runScheduledDailySummaryWorkerCommand.ts'
    );
  });
});
