import { describe, expect, test, vi } from 'vitest';
import { runSqliteRestoreContainerCommand } from './sqliteRestoreContainerCommand';

describe('SQLite container restore command', () => {
  test('requires explicit offline mode and disabled Scheduled Delivery', async () => {
    const execute = vi.fn();
    const setExitCode = vi.fn();
    const lines: string[] = [];

    const result = await runSqliteRestoreContainerCommand({
      arguments_: ['/var/backups/daily/pre-migration-example'],
      environment: {
        DATABASE_URL: '/var/lib/daily/daily.db',
        DAILY_RESTORE_OFFLINE: 'true',
        SCHEDULED_DELIVERY_ENABLED: 'true'
      },
      execute,
      writeLine: (line) => lines.push(line),
      setExitCode
    });

    expect(result).toEqual({ exitCode: 1, failureClassification: 'invalid-configuration' });
    expect(execute).not.toHaveBeenCalled();
    expect(lines).toEqual(['SQLite container restore rejected: invalid offline configuration.']);
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  test('runs the shared verified restore without systemd or service callbacks', async () => {
    const execute = vi.fn().mockResolvedValue({
      exitCode: 0,
      replacedDatabasePath: '/var/lib/daily/daily.db.recovery-example'
    });
    const migrate = vi.fn().mockReturnValue({ exitCode: 0 });
    const setExitCode = vi.fn();
    const lines: string[] = [];

    const result = await runSqliteRestoreContainerCommand({
      arguments_: ['/var/backups/daily/pre-migration-example'],
      environment: {
        DATABASE_URL: '/var/lib/daily/daily.db',
        DAILY_RESTORE_OFFLINE: 'true',
        MIGRATIONS_DIRECTORY: '/app/drizzle',
        SCHEDULED_DELIVERY_ENABLED: 'false'
      },
      execute,
      migrate,
      writeLine: (line) => lines.push(line),
      setExitCode
    });

    expect(execute).toHaveBeenCalledWith({
      recoveryPointDirectory: '/var/backups/daily/pre-migration-example',
      activeDatabasePath: '/var/lib/daily/daily.db',
      isDestinationOffline: expect.any(Function),
      migrate: expect.any(Function)
    });
    await execute.mock.calls[0][0].migrate();
    expect(migrate).toHaveBeenCalledWith({
      databasePath: '/var/lib/daily/daily.db',
      migrationsDirectory: '/app/drizzle'
    });
    expect(result.exitCode).toBe(0);
    expect(lines[0]).toContain('SQLite container restore succeeded');
    expect(setExitCode).toHaveBeenCalledWith(0);
  });
});
