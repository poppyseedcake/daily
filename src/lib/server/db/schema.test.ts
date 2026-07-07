import { getTableName } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  deliveryRecords,
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
      getTableName(deliveryRecords),
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
      'delivery_records',
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
});
