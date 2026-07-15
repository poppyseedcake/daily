import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { createTechnicalEventRecorder } from '../technicalEventRecorder';
import * as schema from './schema';
import { createTechnicalLogStore } from './technicalLogStore';
import {
  executeSqliteBackupCommand,
  type SqliteBackupPurpose
} from './sqliteBackupCommand';

type BackupEnvironment = {
  DATABASE_URL?: string;
  BACKUP_DIRECTORY?: string;
  BACKUP_RETENTION_DAYS?: string;
};

type BackupCommandConfiguration = {
  purpose: SqliteBackupPurpose;
  sourceDatabasePath: string;
  backupDirectory: string;
  retentionDays: number;
};

type RejectionReason =
  | 'invalid-purpose'
  | 'missing-backup-directory'
  | 'invalid-retention-days';

const stdoutOnlyTechnicalEventRecorder = () =>
  createTechnicalEventRecorder({
    store: { persist: async () => Promise.reject() }
  });

const loadProductionTechnicalEventRecorder = async (sourceDatabasePath: string) => {
  const sqlite = new Database(sourceDatabasePath, { fileMustExist: true });
  const database = drizzle(sqlite, { schema });
  return createTechnicalEventRecorder({ store: createTechnicalLogStore(database) });
};

const loadRecorderWithStdoutFallback = async (sourceDatabasePath: string) => {
  try {
    return await loadProductionTechnicalEventRecorder(sourceDatabasePath);
  } catch {
    return stdoutOnlyTechnicalEventRecorder();
  }
};

const parseConfiguration = (
  arguments_: string[],
  environment: BackupEnvironment
): { configuration: BackupCommandConfiguration } | { rejection: RejectionReason } => {
  const [purpose, ...extraArguments] = arguments_;
  if ((purpose !== 'daily' && purpose !== 'pre-migration') || extraArguments.length > 0) {
    return { rejection: 'invalid-purpose' };
  }
  if (!environment.BACKUP_DIRECTORY?.trim()) {
    return { rejection: 'missing-backup-directory' };
  }
  const retentionDays = Number(environment.BACKUP_RETENTION_DAYS ?? '30');
  if (!Number.isSafeInteger(retentionDays) || retentionDays <= 0) {
    return { rejection: 'invalid-retention-days' };
  }
  return {
    configuration: {
      purpose,
      sourceDatabasePath: environment.DATABASE_URL ?? 'data/daily.db',
      backupDirectory: environment.BACKUP_DIRECTORY,
      retentionDays
    }
  };
};

export const runSqliteBackupProductionCommand = async ({
  arguments_ = process.argv.slice(2),
  environment = process.env,
  now = () => new Date(),
  loadRecorder = loadRecorderWithStdoutFallback,
  recordRejected = stdoutOnlyTechnicalEventRecorder().record,
  execute = executeSqliteBackupCommand,
  setExitCode = (exitCode: number) => {
    process.exitCode = exitCode;
  }
}: {
  arguments_?: string[];
  environment?: BackupEnvironment;
  now?: () => Date;
  loadRecorder?: typeof loadRecorderWithStdoutFallback;
  recordRejected?: ReturnType<typeof createTechnicalEventRecorder>['record'];
  execute?: typeof executeSqliteBackupCommand;
  setExitCode?: (exitCode: number) => void;
} = {}) => {
  const parsed = parseConfiguration(arguments_, environment);
  if ('rejection' in parsed) {
    await recordRejected({
      eventCode: 'sqlite-backup-command-rejected',
      occurredAt: now().toISOString(),
      reason: parsed.rejection
    });
    setExitCode(1);
    return { exitCode: 1 as const };
  }

  const recorder = await loadRecorder(parsed.configuration.sourceDatabasePath);
  const result = await execute({
    ...parsed.configuration,
    recordTechnicalEvent: recorder.record
  });
  setExitCode(result.exitCode);
  return result;
};
