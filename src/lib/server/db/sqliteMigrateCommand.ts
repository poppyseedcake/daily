import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

type ExecuteSqliteMigrateCommandOptions = {
  databasePath: string;
  migrationsDirectory: string;
  busyTimeoutMilliseconds?: number;
};

export const executeSqliteMigrateCommand = ({
  databasePath,
  migrationsDirectory,
  busyTimeoutMilliseconds = 30_000
}: ExecuteSqliteMigrateCommandOptions) => {
  if (!databasePath.trim() || !migrationsDirectory.trim()) {
    return { exitCode: 1 as const };
  }

  let sqlite: Database.Database | undefined;
  try {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    sqlite = new Database(databasePath);
    sqlite.pragma(`busy_timeout = ${busyTimeoutMilliseconds}`);
    migrate(drizzle(sqlite), { migrationsFolder: migrationsDirectory });
    if (sqlite.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('SQLite migration integrity verification failed.');
    }
    return { exitCode: 0 as const };
  } catch {
    return { exitCode: 1 as const };
  } finally {
    sqlite?.close();
  }
};
