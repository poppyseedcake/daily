import { getTableName } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { summaryConfigurations, todoCategories, todoTasks, users } from './schema';

describe('Daily database schema', () => {
  test('defines core Daily tables for the walking skeleton', () => {
    expect([
      getTableName(users),
      getTableName(summaryConfigurations),
      getTableName(todoCategories),
      getTableName(todoTasks)
    ]).toEqual(['users', 'summary_configurations', 'todo_categories', 'todo_tasks']);
  });

  test('ships an initial SQLite migration for the core schema', () => {
    const migrationPath = 'drizzle/0000_bootstrap_daily.sql';

    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('CREATE TABLE `users`');
    expect(migration).toContain('CREATE TABLE `summary_configurations`');
    expect(migration).toContain('CREATE TABLE `todo_categories`');
    expect(migration).toContain('CREATE TABLE `todo_tasks`');
  });
});
