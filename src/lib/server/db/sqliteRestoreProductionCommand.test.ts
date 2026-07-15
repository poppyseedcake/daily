import { describe, expect, test, vi } from 'vitest';
import { runSqliteRestoreProductionCommand } from './sqliteRestoreProductionCommand';

describe('SQLite restore production command', () => {
  test('maps the selected recovery point and deployment environment to the restore workflow', async () => {
    const execute = vi.fn().mockResolvedValue({
      exitCode: 0,
      replacedDatabasePath: '/srv/daily/shared/daily.db.recovery-example'
    });
    const setExitCode = vi.fn();
    const operations = {
      isDestinationOffline: vi.fn().mockResolvedValue(true),
      migrate: vi.fn(),
      startService: vi.fn(),
      verifyServiceActive: vi.fn(),
      verifyReadiness: vi.fn()
    };

    const result = await runSqliteRestoreProductionCommand({
      arguments_: ['/srv/daily/backups/daily-example'],
      environment: {
        DATABASE_URL: '/srv/daily/shared/daily.db',
        DAILY_SERVICE_NAME: 'daily-web.service',
        READINESS_URL: 'http://127.0.0.1:3000/health'
      },
      createOperations: vi.fn().mockReturnValue(operations),
      execute,
      writeLine: vi.fn(),
      setExitCode
    });

    expect(execute).toHaveBeenCalledWith({
      recoveryPointDirectory: '/srv/daily/backups/daily-example',
      activeDatabasePath: '/srv/daily/shared/daily.db',
      ...operations
    });
    expect(result.exitCode).toBe(0);
    expect(setExitCode).toHaveBeenCalledWith(0);
  });

  test('rejects missing configuration without invoking restore operations', async () => {
    const createOperations = vi.fn();
    const execute = vi.fn();
    const lines: string[] = [];

    const result = await runSqliteRestoreProductionCommand({
      arguments_: [],
      environment: {},
      createOperations,
      execute,
      writeLine: (line) => lines.push(line),
      setExitCode: vi.fn()
    });

    expect(result).toEqual({ exitCode: 1, failureClassification: 'invalid-configuration' });
    expect(createOperations).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(lines).toEqual(['SQLite restore rejected: invalid configuration.']);
  });
});
