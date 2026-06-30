import { getTableName } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  summaryConfigurations,
  todoCategories,
  todoTasks,
  users
} from './schema';

describe('Daily database schema', () => {
  test('defines core Daily tables for the walking skeleton', () => {
    expect([
      getTableName(users),
      getTableName(summaryConfigurations),
      getTableName(todoCategories),
      getTableName(todoTasks),
      getTableName(authUser),
      getTableName(authSession),
      getTableName(authAccount),
      getTableName(authVerification)
    ]).toEqual([
      'users',
      'summary_configurations',
      'todo_categories',
      'todo_tasks',
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
});
