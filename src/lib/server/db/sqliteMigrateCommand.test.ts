import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { executeSqliteMigrateCommand } from './sqliteMigrateCommand';
import { runSqliteMigrateProductionCommand } from './sqliteMigrateProductionCommand';

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('SQLite migration command', () => {
  test('creates an empty database and can run again without changing data', () => {
    const root = mkdtempSync(join(tmpdir(), 'daily-migrate-'));
    temporaryDirectories.push(root);
    const databasePath = join(root, 'data', 'daily.db');

    expect(existsSync(databasePath)).toBe(false);
    expect(
      executeSqliteMigrateCommand({
        databasePath,
        migrationsDirectory: join(process.cwd(), 'drizzle')
      })
    ).toEqual({ exitCode: 0 });

    const database = new Database(databasePath);
    database.prepare("INSERT INTO users (id, google_subject, email) VALUES ('u1', 's1', 'u@example.com')").run();
    database.close();

    expect(
      executeSqliteMigrateCommand({
        databasePath,
        migrationsDirectory: join(process.cwd(), 'drizzle')
      })
    ).toEqual({ exitCode: 0 });

    const reopened = new Database(databasePath, { readonly: true });
    expect(reopened.prepare('SELECT email FROM users WHERE id = ?').pluck().get('u1')).toBe(
      'u@example.com'
    );
    expect(reopened.pragma('integrity_check', { simple: true })).toBe('ok');
    reopened.close();
  });

  test('rejects a missing migration directory without damaging the database', () => {
    const root = mkdtempSync(join(tmpdir(), 'daily-migrate-'));
    temporaryDirectories.push(root);
    const databasePath = join(root, 'daily.db');

    expect(
      executeSqliteMigrateCommand({
        databasePath,
        migrationsDirectory: join(root, 'missing')
      })
    ).toEqual({ exitCode: 1 });
    expect(existsSync(databasePath)).toBe(true);
  });

  test('maps the runtime environment without requiring production secrets', () => {
    const execute = vi.fn().mockReturnValue({ exitCode: 0 });
    const setExitCode = vi.fn();
    const lines: string[] = [];

    const result = runSqliteMigrateProductionCommand({
      environment: {
        DATABASE_URL: '/var/lib/daily/daily.db',
        MIGRATIONS_DIRECTORY: '/app/drizzle'
      },
      execute,
      writeLine: (line) => lines.push(line),
      setExitCode
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(execute).toHaveBeenCalledWith({
      databasePath: '/var/lib/daily/daily.db',
      migrationsDirectory: '/app/drizzle'
    });
    expect(lines).toEqual(['SQLite migration completed.']);
    expect(setExitCode).toHaveBeenCalledWith(0);
  });
});
