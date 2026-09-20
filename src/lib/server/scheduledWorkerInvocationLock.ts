import Database from 'better-sqlite3';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const scheduledWorkerLockPath = (databasePath: string) =>
  join(dirname(databasePath), '.scheduled-worker-lock.sqlite3');

export const tryWithScheduledWorkerInvocationLock = async <Result>(
  databasePath: string,
  operation: () => Promise<Result>,
  lockPath = scheduledWorkerLockPath(databasePath)
): Promise<{ acquired: true; result: Result } | { acquired: false }> => {
  mkdirSync(dirname(lockPath), { recursive: true, mode: 0o750 });
  const lockDatabase = new Database(lockPath);
  chmodSync(lockPath, 0o640);
  lockDatabase.pragma('busy_timeout = 0');

  try {
    lockDatabase.exec('BEGIN EXCLUSIVE');
  } catch (error) {
    lockDatabase.close();
    if (error instanceof Database.SqliteError && error.code === 'SQLITE_BUSY') {
      return { acquired: false };
    }
    throw error;
  }

  try {
    return { acquired: true, result: await operation() };
  } finally {
    try {
      lockDatabase.exec('ROLLBACK');
    } finally {
      lockDatabase.close();
    }
  }
};
