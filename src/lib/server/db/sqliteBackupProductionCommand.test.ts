import { describe, expect, test, vi } from 'vitest';
import { createTechnicalEventRecorder } from '../technicalEventRecorder';
import { runSqliteBackupProductionCommand } from './sqliteBackupProductionCommand';

describe('SQLite backup production command', () => {
  test('maps the operator purpose and environment to the application backup command', async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue({
      exitCode: 0,
      recoveryPointName:
        'pre-migration-20260715T000000000Z-123e4567-e89b-42d3-a456-426614174040'
    });
    const setExitCode = vi.fn();

    const result = await runSqliteBackupProductionCommand({
      arguments_: ['pre-migration'],
      environment: {
        DATABASE_URL: '/srv/daily/shared/daily.db',
        BACKUP_DIRECTORY: '/srv/daily/backups',
        BACKUP_RETENTION_DAYS: '45'
      },
      loadRecorder: vi.fn().mockResolvedValue({ record }),
      execute,
      setExitCode
    });

    expect(execute).toHaveBeenCalledWith({
      purpose: 'pre-migration',
      sourceDatabasePath: '/srv/daily/shared/daily.db',
      backupDirectory: '/srv/daily/backups',
      retentionDays: 45,
      recordTechnicalEvent: record
    });
    expect(result.exitCode).toBe(0);
    expect(setExitCode).toHaveBeenCalledWith(0);
  });

  test('rejects invalid configuration with one privacy-safe event and no database load', async () => {
    const lines: string[] = [];
    const recorder = createTechnicalEventRecorder({
      store: { persist: vi.fn().mockResolvedValue(undefined) },
      writeLine: (line) => lines.push(line)
    });
    const loadRecorder = vi.fn();
    const execute = vi.fn();
    const setExitCode = vi.fn();

    const result = await runSqliteBackupProductionCommand({
      arguments_: ['daily'],
      environment: {
        DATABASE_URL: '/private/source/path.db',
        BACKUP_RETENTION_DAYS: '30'
      },
      now: () => new Date('2026-07-15T12:00:00.000Z'),
      loadRecorder,
      recordRejected: recorder.record,
      execute,
      setExitCode
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(loadRecorder).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(JSON.parse(lines[0])).toEqual({
      eventCode: 'sqlite-backup-command-rejected',
      severity: 'error',
      subsystem: 'database-backup',
      occurredAt: '2026-07-15T12:00:00.000Z',
      outcome: 'failed',
      failureClassification: 'invalid-configuration',
      metadata: { reason: 'missing-backup-directory' }
    });
    expect(lines[0]).not.toContain('/private/source/path.db');
  });
});
