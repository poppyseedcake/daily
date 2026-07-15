import Database from 'better-sqlite3';
import { createHash, randomUUID as createRandomUUID } from 'node:crypto';
import {
  chmodSync,
  createReadStream,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  createTechnicalEventRecorder,
  SqliteBackupPurpose
} from '../technicalEventRecorder';

export type { SqliteBackupPurpose } from '../technicalEventRecorder';

type ExecuteSqliteBackupCommandOptions = {
  purpose: SqliteBackupPurpose;
  sourceDatabasePath: string;
  backupDirectory: string;
  retentionDays?: number;
  now?: () => Date;
  monotonicNow?: () => number;
  randomUUID?: () => string;
  recordTechnicalEvent?: ReturnType<typeof createTechnicalEventRecorder>['record'];
  onlineBackup?: (
    sourceDatabasePath: string,
    destinationPath: string,
    progress?: (progress: { totalPages: number; remainingPages: number }) => number
  ) => Promise<void>;
  onlineBackupProgress?: (progress: {
    totalPages: number;
    remainingPages: number;
  }) => number;
  lockAttemptTimeoutMilliseconds?: number;
  removeRecoveryPoint?: (path: string) => void;
};

type RecoveryPoint = {
  name: string;
  purpose: SqliteBackupPurpose;
  createdAt: string;
};

const recoveryPointNamePattern =
  /^(?<purpose>daily|pre-migration)-(?<createdAtToken>\d{8}T\d{9}Z)-(?<backupId>[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

const checksumFile = async (path: string) => {
  const checksum = createHash('sha256');
  for await (const chunk of createReadStream(path)) checksum.update(chunk);
  return checksum.digest('hex');
};

const readRecoveryPoint = async (
  backupDirectory: string,
  name: string
): Promise<RecoveryPoint | null> => {
  const identity = recoveryPointNamePattern.exec(name)?.groups;
  if (!identity) return null;

  try {
    const metadata = JSON.parse(
      readFileSync(join(backupDirectory, name, 'metadata.json'), 'utf8')
    ) as Record<string, unknown>;
    if (
      metadata.formatVersion !== 1 ||
      (metadata.purpose !== 'daily' && metadata.purpose !== 'pre-migration') ||
      metadata.purpose !== identity.purpose ||
      typeof metadata.createdAt !== 'string' ||
      Number.isNaN(Date.parse(metadata.createdAt)) ||
      metadata.createdAt.replaceAll('-', '').replaceAll(':', '').replace('.', '') !==
        identity.createdAtToken ||
      metadata.backupId !== identity.backupId ||
      metadata.integrityCheck !== 'ok' ||
      metadata.checksumAlgorithm !== 'sha256' ||
      typeof metadata.checksum !== 'string' ||
      !/^[a-f0-9]{64}$/.test(metadata.checksum) ||
      metadata.databaseFile !== 'backup.sqlite3' ||
      typeof metadata.sizeBytes !== 'number'
    ) {
      return null;
    }

    const backupPath = join(backupDirectory, name, 'backup.sqlite3');
    const backupStat = statSync(backupPath);
    if (
      !backupStat.isFile() ||
      backupStat.size !== metadata.sizeBytes ||
      (await checksumFile(backupPath)) !== metadata.checksum
    ) {
      return null;
    }
    const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
    try {
      if (backup.pragma('integrity_check', { simple: true }) !== 'ok') return null;
    } finally {
      backup.close();
    }
    return { name, purpose: metadata.purpose, createdAt: metadata.createdAt };
  } catch {
    return null;
  }
};

const validateRetentionDays = (retentionDays: number) => {
  if (!Number.isSafeInteger(retentionDays) || retentionDays <= 0) {
    throw new Error('BACKUP_RETENTION_DAYS must be a positive integer.');
  }
};

const applyRetention = async (
  backupDirectory: string,
  now: Date,
  retentionDays: number,
  removeRecoveryPoint: (path: string) => void
) => {
  let recoveryPoints: RecoveryPoint[];
  try {
    recoveryPoints = [];
    for (const name of readdirSync(backupDirectory)) {
      const recoveryPoint = await readRecoveryPoint(backupDirectory, name);
      if (recoveryPoint) recoveryPoints.push(recoveryPoint);
    }
  } catch {
    return false;
  }
  const newestByPurpose = new Map<SqliteBackupPurpose, RecoveryPoint>();
  for (const recoveryPoint of recoveryPoints) {
    const newest = newestByPurpose.get(recoveryPoint.purpose);
    if (!newest || recoveryPoint.createdAt > newest.createdAt) {
      newestByPurpose.set(recoveryPoint.purpose, recoveryPoint);
    }
  }

  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1_000;
  let succeeded = true;
  for (const recoveryPoint of recoveryPoints) {
    if (
      Date.parse(recoveryPoint.createdAt) < cutoff &&
      newestByPurpose.get(recoveryPoint.purpose)?.name !== recoveryPoint.name
    ) {
      try {
        removeRecoveryPoint(join(backupDirectory, recoveryPoint.name));
      } catch {
        succeeded = false;
      }
    }
  }
  return succeeded;
};

const backupQueues = new Map<string, Promise<void>>();

const beginExclusiveWhenAvailable = (lockDatabase: Database.Database) => {
  while (true) {
    try {
      lockDatabase.exec('BEGIN EXCLUSIVE');
      return;
    } catch (error) {
      if (!(error instanceof Database.SqliteError) || error.code !== 'SQLITE_BUSY') throw error;
    }
  }
};

const withBackupSerialization = async <Result>(
  backupDirectory: string,
  lockAttemptTimeoutMilliseconds: number,
  operation: () => Promise<Result>
) => {
  const queueKey = resolve(backupDirectory);
  const previous = backupQueues.get(queueKey) ?? Promise.resolve();
  let releaseQueue!: () => void;
  const turn = new Promise<void>((resolveTurn) => {
    releaseQueue = resolveTurn;
  });
  const queued = previous.then(() => turn);
  backupQueues.set(queueKey, queued);
  await previous;

  let lockDatabase: Database.Database | undefined;
  try {
    mkdirSync(backupDirectory, { recursive: true, mode: 0o750 });
    const lockPath = join(backupDirectory, '.backup-operation-lock.sqlite3');
    lockDatabase = new Database(lockPath);
    chmodSync(lockPath, 0o640);
    lockDatabase.pragma(`busy_timeout = ${lockAttemptTimeoutMilliseconds}`);
    beginExclusiveWhenAvailable(lockDatabase);
    return await operation();
  } finally {
    lockDatabase?.close();
    releaseQueue();
    if (backupQueues.get(queueKey) === queued) backupQueues.delete(queueKey);
  }
};

const performOnlineBackup = async (
  sourceDatabasePath: string,
  destinationPath: string,
  progress?: (progress: { totalPages: number; remainingPages: number }) => number
) => {
  const source = new Database(sourceDatabasePath, { fileMustExist: true });
  try {
    await source.backup(destinationPath, progress ? { progress } : undefined);
  } finally {
    source.close();
  }
};

const utcNameTimestamp = (date: Date) =>
  date.toISOString().replaceAll('-', '').replaceAll(':', '').replace('.', '');

export const executeSqliteBackupCommand = async ({
  purpose,
  sourceDatabasePath,
  backupDirectory,
  retentionDays = 30,
  now = () => new Date(),
  monotonicNow = () => performance.now(),
  randomUUID = createRandomUUID,
  recordTechnicalEvent,
  onlineBackup = performOnlineBackup,
  onlineBackupProgress,
  lockAttemptTimeoutMilliseconds = 300_000,
  removeRecoveryPoint = (path) => rmSync(path, { recursive: true })
}: ExecuteSqliteBackupCommandOptions) => {
  const createdAt = now();
  const backupId = randomUUID();
  const recoveryPointName = `${purpose}-${utcNameTimestamp(createdAt)}-${backupId}`;
  const temporaryDirectory = join(backupDirectory, `.${recoveryPointName}.tmp`);
  const recoveryPointDirectory = join(backupDirectory, recoveryPointName);
  const backupPath = join(temporaryDirectory, 'backup.sqlite3');
  const metadataPath = join(temporaryDirectory, 'metadata.json');
  const startedAt = monotonicNow();
  let failureClassification:
    | 'invalid-configuration'
    | 'backup-failed'
    | 'verification-failed'
    | 'finalization-failed' = 'invalid-configuration';

  try {
    validateRetentionDays(retentionDays);
    return await withBackupSerialization(backupDirectory, lockAttemptTimeoutMilliseconds, async () => {
      mkdirSync(temporaryDirectory, { mode: 0o700 });

      if (!statSync(sourceDatabasePath).isFile()) {
        throw new Error('DATABASE_URL must identify an existing SQLite file.');
      }
      failureClassification = 'backup-failed';
      await onlineBackup(sourceDatabasePath, backupPath, onlineBackupProgress);

      failureClassification = 'verification-failed';
      const backup = new Database(backupPath, { fileMustExist: true });
      try {
        backup.pragma('journal_mode = DELETE');
        if (backup.pragma('integrity_check', { simple: true }) !== 'ok') {
          throw new Error('SQLite backup integrity verification failed.');
        }
      } finally {
        backup.close();
      }

      const checksum = await checksumFile(backupPath);
      const metadata = {
        formatVersion: 1,
        backupId,
        purpose,
        createdAt: createdAt.toISOString(),
        databaseFile: 'backup.sqlite3',
        checksumAlgorithm: 'sha256',
        checksum,
        sizeBytes: statSync(backupPath).size,
        integrityCheck: 'ok'
      };
      writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600
      });
      chmodSync(backupPath, 0o640);
      chmodSync(metadataPath, 0o640);
      chmodSync(temporaryDirectory, 0o750);
      failureClassification = 'finalization-failed';
      renameSync(temporaryDirectory, recoveryPointDirectory);
      const retentionSucceeded = await applyRetention(
        backupDirectory,
        createdAt,
        retentionDays,
        removeRecoveryPoint
      );

      if (!retentionSucceeded) {
        try {
          await recordTechnicalEvent?.({
            eventCode: 'sqlite-backup-retention-failed',
            occurredAt: createdAt.toISOString(),
            durationMilliseconds: Math.max(0, monotonicNow() - startedAt),
            purpose,
            recoveryPointId: backupId,
            failure: null
          });
        } catch {
          // Observability is best effort and cannot replace a completed backup result.
        }
      }

      try {
        await recordTechnicalEvent?.({
          eventCode: 'sqlite-backup-completed',
          occurredAt: createdAt.toISOString(),
          durationMilliseconds: Math.max(0, monotonicNow() - startedAt),
          purpose,
          recoveryPointId: backupId
        });
      } catch {
        // Observability is best effort and cannot replace a completed backup result.
      }

      return { exitCode: 0 as const, recoveryPointName };
    });
  } catch {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    try {
      await recordTechnicalEvent?.({
        eventCode: 'sqlite-backup-failed',
        occurredAt: createdAt.toISOString(),
        durationMilliseconds: Math.max(0, monotonicNow() - startedAt),
        purpose,
        recoveryPointId: backupId,
        classification: failureClassification,
        failure: null
      });
    } catch {
      // Observability is best effort and cannot replace the failing backup result.
    }
    return { exitCode: 1 as const };
  }
};
