import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { executeSqliteRestoreCommand } from './sqliteRestoreCommand';

const temporaryDirectories: string[] = [];

const createDatabase = (path: string, value: string) => {
  const database = new Database(path);
  database.exec('CREATE TABLE marker (value TEXT NOT NULL)');
  database.prepare('INSERT INTO marker (value) VALUES (?)').run(value);
  database.close();
};

const readMarker = (path: string) => {
  const database = new Database(path, { readonly: true });
  try {
    return database.prepare('SELECT value FROM marker').pluck().get();
  } finally {
    database.close();
  }
};

const createRecoveryPoint = (root: string) => {
  const recoveryPointDirectory = join(root, 'daily-20260715T100000000Z-backup');
  mkdirSync(recoveryPointDirectory);
  const backupPath = join(recoveryPointDirectory, 'backup.sqlite3');
  createDatabase(backupPath, 'backup');
  const checksum = createHash('sha256').update(readFileSync(backupPath)).digest('hex');
  writeFileSync(
    join(recoveryPointDirectory, 'metadata.json'),
    JSON.stringify({
      formatVersion: 1,
      databaseFile: 'backup.sqlite3',
      checksumAlgorithm: 'sha256',
      checksum,
      integrityCheck: 'ok'
    })
  );
  return { recoveryPointDirectory, backupPath };
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('SQLite restore command', () => {
  test.each([
    ['missing checksum', (metadata: Record<string, unknown>) => delete metadata.checksum],
    ['checksum mismatch', (metadata: Record<string, unknown>) => (metadata.checksum = '0'.repeat(64))]
  ])('rejects a recovery point with %s without modifying the active database', async (_, mutate) => {
    const root = mkdtempSync(join(tmpdir(), 'daily-restore-'));
    temporaryDirectories.push(root);
    const activeDatabasePath = join(root, 'daily.db');
    createDatabase(activeDatabasePath, 'active');
    const { recoveryPointDirectory } = createRecoveryPoint(root);
    const metadataPath = join(recoveryPointDirectory, 'metadata.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as Record<string, unknown>;
    mutate(metadata);
    writeFileSync(metadataPath, JSON.stringify(metadata));
    const migrate = vi.fn();

    const result = await executeSqliteRestoreCommand({
      recoveryPointDirectory,
      activeDatabasePath,
      isDestinationOffline: async () => true,
      migrate,
      startService: vi.fn(),
      verifyServiceActive: vi.fn(),
      verifyReadiness: vi.fn()
    });

    expect(result).toEqual({ exitCode: 1, failureClassification: 'invalid-recovery-point' });
    expect(readMarker(activeDatabasePath)).toBe('active');
    expect(migrate).not.toHaveBeenCalled();
  });

  test('rejects a restore when the destination service is online', async () => {
    const root = mkdtempSync(join(tmpdir(), 'daily-restore-'));
    temporaryDirectories.push(root);
    const activeDatabasePath = join(root, 'daily.db');
    createDatabase(activeDatabasePath, 'active');
    const { recoveryPointDirectory } = createRecoveryPoint(root);

    const result = await executeSqliteRestoreCommand({
      recoveryPointDirectory,
      activeDatabasePath,
      isDestinationOffline: async () => false,
      migrate: vi.fn(),
      startService: vi.fn(),
      verifyServiceActive: vi.fn(),
      verifyReadiness: vi.fn()
    });

    expect(result).toEqual({ exitCode: 1, failureClassification: 'destination-online' });
    expect(readMarker(activeDatabasePath)).toBe('active');
  });

  test.each(['-wal', '-shm'])('rejects an offline destination with a SQLite %s sidecar', async (suffix) => {
    const root = mkdtempSync(join(tmpdir(), 'daily-restore-'));
    temporaryDirectories.push(root);
    const activeDatabasePath = join(root, 'daily.db');
    createDatabase(activeDatabasePath, 'active');
    writeFileSync(`${activeDatabasePath}${suffix}`, 'stale sidecar');
    const { recoveryPointDirectory } = createRecoveryPoint(root);

    const result = await executeSqliteRestoreCommand({
      recoveryPointDirectory,
      activeDatabasePath,
      isDestinationOffline: async () => true,
      migrate: vi.fn(),
      startService: vi.fn(),
      verifyServiceActive: vi.fn(),
      verifyReadiness: vi.fn()
    });

    expect(result).toEqual({ exitCode: 1, failureClassification: 'invalid-destination' });
    expect(readMarker(activeDatabasePath)).toBe('active');
  });

  test('rejects a missing active database without creating it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'daily-restore-'));
    temporaryDirectories.push(root);
    const activeDatabasePath = join(root, 'missing.db');
    const { recoveryPointDirectory } = createRecoveryPoint(root);

    const result = await executeSqliteRestoreCommand({
      recoveryPointDirectory,
      activeDatabasePath,
      isDestinationOffline: async () => true,
      migrate: vi.fn(),
      startService: vi.fn(),
      verifyServiceActive: vi.fn(),
      verifyReadiness: vi.fn()
    });

    expect(result).toEqual({ exitCode: 1, failureClassification: 'invalid-destination' });
    expect(existsSync(activeDatabasePath)).toBe(false);
  });

  test('rejects a checksum-valid file that fails SQLite integrity without modifying the active database', async () => {
    const root = mkdtempSync(join(tmpdir(), 'daily-restore-'));
    temporaryDirectories.push(root);
    const activeDatabasePath = join(root, 'daily.db');
    createDatabase(activeDatabasePath, 'active');
    const { recoveryPointDirectory, backupPath } = createRecoveryPoint(root);
    writeFileSync(backupPath, 'not a SQLite database');
    const metadataPath = join(recoveryPointDirectory, 'metadata.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as Record<string, unknown>;
    metadata.checksum = createHash('sha256').update(readFileSync(backupPath)).digest('hex');
    writeFileSync(metadataPath, JSON.stringify(metadata));

    const result = await executeSqliteRestoreCommand({
      recoveryPointDirectory,
      activeDatabasePath,
      isDestinationOffline: async () => true,
      migrate: vi.fn(),
      startService: vi.fn(),
      verifyServiceActive: vi.fn(),
      verifyReadiness: vi.fn()
    });

    expect(result).toEqual({ exitCode: 1, failureClassification: 'invalid-recovery-point' });
    expect(readMarker(activeDatabasePath)).toBe('active');
  });

  test('installs a valid backup and verifies migrations, service state, and readiness in order', async () => {
    const root = mkdtempSync(join(tmpdir(), 'daily-restore-'));
    temporaryDirectories.push(root);
    const activeDatabasePath = join(root, 'daily.db');
    createDatabase(activeDatabasePath, 'active');
    const { recoveryPointDirectory } = createRecoveryPoint(root);
    const calls: string[] = [];

    const result = await executeSqliteRestoreCommand({
      recoveryPointDirectory,
      activeDatabasePath,
      isDestinationOffline: async () => true,
      now: () => new Date('2026-07-15T10:30:00.000Z'),
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
      migrate: async () => void calls.push(`migrate:${readMarker(activeDatabasePath)}`),
      startService: async () => void calls.push('start'),
      verifyServiceActive: async () => void calls.push('service-active'),
      verifyReadiness: async () => void calls.push('readiness')
    });

    const replacedDatabasePath = join(
      root,
      'daily.db.recovery-20260715T103000000Z-123e4567-e89b-42d3-a456-426614174000'
    );
    expect(result).toEqual({ exitCode: 0, replacedDatabasePath });
    expect(readMarker(activeDatabasePath)).toBe('backup');
    expect(readMarker(replacedDatabasePath)).toBe('active');
    expect(calls).toEqual(['migrate:backup', 'start', 'service-active', 'readiness']);
    expect(existsSync(`${activeDatabasePath}.restore.tmp`)).toBe(false);
  });

  test('rechecks the offline destination immediately before replacement', async () => {
    const root = mkdtempSync(join(tmpdir(), 'daily-restore-'));
    temporaryDirectories.push(root);
    const activeDatabasePath = join(root, 'daily.db');
    createDatabase(activeDatabasePath, 'active');
    const { recoveryPointDirectory } = createRecoveryPoint(root);
    const isDestinationOffline = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await executeSqliteRestoreCommand({
      recoveryPointDirectory,
      activeDatabasePath,
      isDestinationOffline,
      migrate: vi.fn(),
      startService: vi.fn(),
      verifyServiceActive: vi.fn(),
      verifyReadiness: vi.fn()
    });

    expect(result).toEqual({ exitCode: 1, failureClassification: 'destination-online' });
    expect(isDestinationOffline).toHaveBeenCalledTimes(2);
    expect(readMarker(activeDatabasePath)).toBe('active');
  });

  test.each([
    ['migration', 'migration-failed', async () => Promise.reject(new Error('migration'))],
    ['service state', 'service-failed', async () => Promise.reject(new Error('service'))],
    ['readiness', 'readiness-failed', async () => Promise.reject(new Error('readiness'))]
  ] as const)('preserves the replaced database when %s verification fails', async (step, failure, fail) => {
    const root = mkdtempSync(join(tmpdir(), 'daily-restore-'));
    temporaryDirectories.push(root);
    const activeDatabasePath = join(root, 'daily.db');
    createDatabase(activeDatabasePath, 'active');
    const { recoveryPointDirectory } = createRecoveryPoint(root);

    const result = await executeSqliteRestoreCommand({
      recoveryPointDirectory,
      activeDatabasePath,
      isDestinationOffline: async () => true,
      migrate: step === 'migration' ? fail : async () => undefined,
      startService: async () => undefined,
      verifyServiceActive: step === 'service state' ? fail : async () => undefined,
      verifyReadiness: step === 'readiness' ? fail : async () => undefined
    });

    expect(result).toMatchObject({ exitCode: 1, failureClassification: failure });
    expect(readMarker(activeDatabasePath)).toBe('backup');
    expect(result.replacedDatabasePath).toBeDefined();
    expect(readMarker(result.replacedDatabasePath!)).toBe('active');
  });
});
