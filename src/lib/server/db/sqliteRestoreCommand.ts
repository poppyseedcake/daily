import Database from 'better-sqlite3';
import { createHash, randomUUID as createRandomUUID } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync
} from 'node:fs';
import { join } from 'node:path';

type RestoreFailureClassification =
  | 'destination-online'
  | 'invalid-destination'
  | 'invalid-recovery-point'
  | 'installation-failed'
  | 'migration-failed'
  | 'service-failed'
  | 'readiness-failed';

type ExecuteSqliteRestoreCommandOptions = {
  recoveryPointDirectory: string;
  activeDatabasePath: string;
  isDestinationOffline: () => Promise<boolean>;
  now?: () => Date;
  randomUUID?: () => string;
  migrate: () => Promise<void>;
  startService: () => Promise<void>;
  verifyServiceActive: () => Promise<void>;
  verifyReadiness: () => Promise<void>;
};

const checksumFile = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

const isValidRecoveryPoint = (
  recoveryPointDirectory: string
): { backupPath: string } | undefined => {
  try {
    const metadata = JSON.parse(
      readFileSync(join(recoveryPointDirectory, 'metadata.json'), 'utf8')
    ) as Record<string, unknown>;
    if (
      metadata.formatVersion !== 1 ||
      metadata.databaseFile !== 'backup.sqlite3' ||
      metadata.checksumAlgorithm !== 'sha256' ||
      typeof metadata.checksum !== 'string' ||
      !/^[a-f0-9]{64}$/.test(metadata.checksum) ||
      metadata.integrityCheck !== 'ok'
    ) {
      return undefined;
    }
    const backupPath = join(recoveryPointDirectory, 'backup.sqlite3');
    if (!statSync(backupPath).isFile() || checksumFile(backupPath) !== metadata.checksum) {
      return undefined;
    }
    const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
    try {
      if (backup.pragma('integrity_check', { simple: true }) !== 'ok') return undefined;
    } finally {
      backup.close();
    }
    return { backupPath };
  } catch {
    return undefined;
  }
};

export const executeSqliteRestoreCommand = async ({
  recoveryPointDirectory,
  activeDatabasePath,
  isDestinationOffline,
  now = () => new Date(),
  randomUUID = createRandomUUID,
  migrate,
  startService,
  verifyServiceActive,
  verifyReadiness
}: ExecuteSqliteRestoreCommandOptions): Promise<
  | { exitCode: 0; replacedDatabasePath: string }
  | { exitCode: 1; failureClassification: RestoreFailureClassification }
> => {
  let destinationOffline: boolean;
  try {
    destinationOffline = await isDestinationOffline();
  } catch {
    return { exitCode: 1, failureClassification: 'invalid-destination' };
  }
  if (!destinationOffline) {
    return { exitCode: 1, failureClassification: 'destination-online' };
  }
  try {
    if (
      !statSync(activeDatabasePath).isFile() ||
      existsSync(`${activeDatabasePath}-wal`) ||
      existsSync(`${activeDatabasePath}-shm`)
    ) {
      return { exitCode: 1, failureClassification: 'invalid-destination' };
    }
  } catch {
    return { exitCode: 1, failureClassification: 'invalid-destination' };
  }
  const recoveryPoint = isValidRecoveryPoint(recoveryPointDirectory);
  if (!recoveryPoint) {
    return { exitCode: 1, failureClassification: 'invalid-recovery-point' };
  }

  const recoveryToken = `${now().toISOString().replaceAll('-', '').replaceAll(':', '').replace('.', '')}-${randomUUID()}`;
  const replacedDatabasePath = `${activeDatabasePath}.recovery-${recoveryToken}`;
  const installationPath = `${activeDatabasePath}.restore-${recoveryToken}.tmp`;
  try {
    copyFileSync(recoveryPoint.backupPath, installationPath);
    chmodSync(installationPath, statSync(activeDatabasePath).mode & 0o777);
    renameSync(activeDatabasePath, replacedDatabasePath);
    try {
      renameSync(installationPath, activeDatabasePath);
    } catch (error) {
      renameSync(replacedDatabasePath, activeDatabasePath);
      throw error;
    }
  } catch {
    rmSync(installationPath, { force: true });
    return { exitCode: 1, failureClassification: 'installation-failed' };
  }

  try {
    await migrate();
  } catch {
    return { exitCode: 1, failureClassification: 'migration-failed' };
  }
  try {
    await startService();
    await verifyServiceActive();
  } catch {
    return { exitCode: 1, failureClassification: 'service-failed' };
  }
  try {
    await verifyReadiness();
  } catch {
    return { exitCode: 1, failureClassification: 'readiness-failed' };
  }
  return { exitCode: 0, replacedDatabasePath };
};
