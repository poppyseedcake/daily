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
import type { createTechnicalEventRecorder } from '../technicalEventRecorder';

export type SqliteBackupPurpose = 'daily' | 'pre-migration';

type ExecuteSqliteBackupCommandOptions = {
  purpose: SqliteBackupPurpose;
  sourceDatabasePath: string;
  backupDirectory: string;
  retentionDays?: number;
  now?: () => Date;
  monotonicNow?: () => number;
  randomUUID?: () => string;
  recordTechnicalEvent?: ReturnType<typeof createTechnicalEventRecorder>['record'];
  onlineBackup?: (sourceDatabasePath: string, destinationPath: string) => Promise<void>;
};

type RecoveryPoint = {
  name: string;
  purpose: SqliteBackupPurpose;
  createdAt: string;
};

const recoveryPointNamePattern =
  /^(daily|pre-migration)-\d{8}T\d{9}Z-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const readRecoveryPoint = (backupDirectory: string, name: string): RecoveryPoint | null => {
  if (!recoveryPointNamePattern.test(name)) return null;

  try {
    const metadata = JSON.parse(
      readFileSync(join(backupDirectory, name, 'metadata.json'), 'utf8')
    ) as Record<string, unknown>;
    if (
      metadata.formatVersion !== 1 ||
      (metadata.purpose !== 'daily' && metadata.purpose !== 'pre-migration') ||
      typeof metadata.createdAt !== 'string' ||
      Number.isNaN(Date.parse(metadata.createdAt)) ||
      metadata.integrityCheck !== 'ok' ||
      metadata.checksumAlgorithm !== 'sha256' ||
      typeof metadata.checksum !== 'string' ||
      !/^[a-f0-9]{64}$/.test(metadata.checksum) ||
      metadata.databaseFile !== 'backup.sqlite3' ||
      !statSync(join(backupDirectory, name, 'backup.sqlite3')).isFile()
    ) {
      return null;
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

const applyRetention = (backupDirectory: string, now: Date, retentionDays: number) => {
  let recoveryPoints: RecoveryPoint[];
  try {
    recoveryPoints = readdirSync(backupDirectory)
      .map((name) => readRecoveryPoint(backupDirectory, name))
      .filter((recoveryPoint): recoveryPoint is RecoveryPoint => recoveryPoint !== null);
  } catch {
    return;
  }
  const newestByPurpose = new Map<SqliteBackupPurpose, RecoveryPoint>();
  for (const recoveryPoint of recoveryPoints) {
    const newest = newestByPurpose.get(recoveryPoint.purpose);
    if (!newest || recoveryPoint.createdAt > newest.createdAt) {
      newestByPurpose.set(recoveryPoint.purpose, recoveryPoint);
    }
  }

  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1_000;
  for (const recoveryPoint of recoveryPoints) {
    if (
      Date.parse(recoveryPoint.createdAt) < cutoff &&
      newestByPurpose.get(recoveryPoint.purpose)?.name !== recoveryPoint.name
    ) {
      try {
        rmSync(join(backupDirectory, recoveryPoint.name), { recursive: true });
      } catch {
        // A verified new recovery point remains successful even if old-point cleanup is unavailable.
      }
    }
  }
};

const checksumFile = async (path: string) => {
  const checksum = createHash('sha256');
  for await (const chunk of createReadStream(path)) checksum.update(chunk);
  return checksum.digest('hex');
};

const backupQueues = new Map<string, Promise<void>>();

const withBackupSerialization = async <Result>(
  backupDirectory: string,
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
    lockDatabase.pragma('busy_timeout = 300000');
    lockDatabase.exec(
      'CREATE TABLE IF NOT EXISTS backup_operation_lock (singleton INTEGER PRIMARY KEY CHECK (singleton = 1))'
    );
    lockDatabase.exec('BEGIN EXCLUSIVE');
    return await operation();
  } finally {
    lockDatabase?.close();
    releaseQueue();
    if (backupQueues.get(queueKey) === queued) backupQueues.delete(queueKey);
  }
};

const performOnlineBackup = async (sourceDatabasePath: string, destinationPath: string) => {
  const source = new Database(sourceDatabasePath, { fileMustExist: true });
  try {
    await source.backup(destinationPath);
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
  onlineBackup = performOnlineBackup
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
    return await withBackupSerialization(backupDirectory, async () => {
      mkdirSync(temporaryDirectory, { mode: 0o700 });

      if (!statSync(sourceDatabasePath).isFile()) {
        throw new Error('DATABASE_URL must identify an existing SQLite file.');
      }
      failureClassification = 'backup-failed';
      await onlineBackup(sourceDatabasePath, backupPath);

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
      applyRetention(backupDirectory, createdAt, retentionDays);

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
