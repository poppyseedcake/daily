import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { executeSqliteBackupCommand } from './sqliteBackupCommand';

const temporaryDirectories: string[] = [];

const temporaryDirectory = () => {
  const directory = mkdtempSync(join(tmpdir(), 'daily-sqlite-backup-'));
  temporaryDirectories.push(directory);
  return directory;
};

const seedRecoveryPoint = (
  backupDirectory: string,
  name: string,
  purpose: 'daily' | 'pre-migration',
  createdAt: string
) => {
  const directory = join(backupDirectory, name);
  mkdirSync(directory, { recursive: true });
  const backupPath = join(directory, 'backup.sqlite3');
  const backup = new Database(backupPath);
  backup.exec('CREATE TABLE verified_recovery_point (id INTEGER PRIMARY KEY)');
  backup.close();
  const backupContents = readFileSync(backupPath);
  writeFileSync(
    join(directory, 'metadata.json'),
    JSON.stringify({
      formatVersion: 1,
      backupId: name.slice(-36),
      purpose,
      createdAt,
      databaseFile: 'backup.sqlite3',
      checksumAlgorithm: 'sha256',
      checksum: createHash('sha256').update(backupContents).digest('hex'),
      sizeBytes: backupContents.byteLength,
      integrityCheck: 'ok'
    })
  );
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('SQLite backup operator command', () => {
  test('publishes a verified daily recovery point with a collision-safe UTC name', async () => {
    const root = temporaryDirectory();
    const sourcePath = join(root, 'daily.db');
    const backupDirectory = join(root, 'backups');
    const source = new Database(sourcePath);
    source.pragma('journal_mode = WAL');
    source.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL)');
    source.prepare('INSERT INTO notes (title) VALUES (?)').run('private value');
    const recordTechnicalEvent = vi.fn().mockResolvedValue(undefined);

    try {
      const result = await executeSqliteBackupCommand({
        purpose: 'daily',
        sourceDatabasePath: sourcePath,
        backupDirectory,
        now: () => new Date('2026-07-15T12:34:56.789Z'),
        randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
        recordTechnicalEvent
      });

      expect(result).toEqual({
        exitCode: 0,
        recoveryPointName:
          'daily-20260715T123456789Z-123e4567-e89b-42d3-a456-426614174000'
      });
      if (result.exitCode !== 0) throw new Error('Expected a finalized recovery point.');
      const [recoveryPointName] = readdirSync(backupDirectory).filter(
        (name) => !name.startsWith('.')
      );
      expect(recoveryPointName).toBe(result.recoveryPointName);

      const recoveryPointDirectory = join(backupDirectory, recoveryPointName);
      const backupPath = join(recoveryPointDirectory, 'backup.sqlite3');
      const metadataPath = join(recoveryPointDirectory, 'metadata.json');
      expect(readdirSync(recoveryPointDirectory).sort()).toEqual([
        'backup.sqlite3',
        'metadata.json'
      ]);
      const restored = new Database(backupPath, { readonly: true });
      try {
        expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
        expect(restored.prepare('SELECT title FROM notes').pluck().all()).toEqual([
          'private value'
        ]);
      } finally {
        restored.close();
      }

      const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as Record<string, unknown>;
      expect(metadata).toEqual({
        formatVersion: 1,
        backupId: '123e4567-e89b-42d3-a456-426614174000',
        purpose: 'daily',
        createdAt: '2026-07-15T12:34:56.789Z',
        databaseFile: 'backup.sqlite3',
        checksumAlgorithm: 'sha256',
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        sizeBytes: expect.any(Number),
        integrityCheck: 'ok'
      });
      expect(metadata.checksum).toBe(
        createHash('sha256').update(readFileSync(backupPath)).digest('hex')
      );
      expect(JSON.stringify(metadata)).not.toMatch(/private value|daily\.db/);
      expect(statSync(recoveryPointDirectory).mode & 0o777).toBe(0o750);
      expect(statSync(backupPath).mode & 0o777).toBe(0o640);
      expect(statSync(metadataPath).mode & 0o777).toBe(0o640);
      expect(recordTechnicalEvent).toHaveBeenCalledWith({
        eventCode: 'sqlite-backup-completed',
        occurredAt: '2026-07-15T12:34:56.789Z',
        durationMilliseconds: expect.any(Number),
        purpose: 'daily',
        recoveryPointId: '123e4567-e89b-42d3-a456-426614174000'
      });
    } finally {
      source.close();
    }
  });

  test('publishes no recovery point and cannot run retention when verification fails', async () => {
    const root = temporaryDirectory();
    const backupDirectory = join(root, 'backups');
    const recordTechnicalEvent = vi.fn().mockResolvedValue(undefined);
    const sourcePath = join(root, 'source.db');
    new Database(sourcePath).close();
    seedRecoveryPoint(
      backupDirectory,
      'daily-20260501T000000000Z-123e4567-e89b-42d3-a456-426614174050',
      'daily',
      '2026-05-01T00:00:00.000Z'
    );
    const removeRecoveryPoint = vi.fn();

    const result = await executeSqliteBackupCommand({
      purpose: 'pre-migration',
      sourceDatabasePath: sourcePath,
      backupDirectory,
      now: () => new Date('2026-07-15T12:34:56.789Z'),
      monotonicNow: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(15),
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174001',
      recordTechnicalEvent,
      onlineBackup: async (_sourceDatabasePath, destinationPath) => {
        writeFileSync(destinationPath, 'not a sqlite database');
      },
      removeRecoveryPoint
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(readdirSync(backupDirectory).filter((name) => !name.startsWith('.'))).toEqual([
      'daily-20260501T000000000Z-123e4567-e89b-42d3-a456-426614174050'
    ]);
    expect(recordTechnicalEvent).toHaveBeenCalledWith({
      eventCode: 'sqlite-backup-failed',
      occurredAt: '2026-07-15T12:34:56.789Z',
      durationMilliseconds: 5,
      purpose: 'pre-migration',
      recoveryPointId: '123e4567-e89b-42d3-a456-426614174001',
      classification: 'verification-failed',
      failure: null
    });
    expect(removeRecoveryPoint).not.toHaveBeenCalled();
    expect(JSON.stringify(recordTechnicalEvent.mock.calls)).not.toContain(
      'not a sqlite database'
    );
  });

  test('removes only items above the retention boundary and preserves each purpose newest', async () => {
    const root = temporaryDirectory();
    const sourcePath = join(root, 'daily.db');
    const backupDirectory = join(root, 'backups');
    const source = new Database(sourcePath);
    source.exec('CREATE TABLE settings (value TEXT NOT NULL)');
    seedRecoveryPoint(
      backupDirectory,
      'daily-20260614T235959999Z-123e4567-e89b-42d3-a456-426614174010',
      'daily',
      '2026-06-14T23:59:59.999Z'
    );
    seedRecoveryPoint(
      backupDirectory,
      'daily-20260615T000000000Z-123e4567-e89b-42d3-a456-426614174011',
      'daily',
      '2026-06-15T00:00:00.000Z'
    );
    seedRecoveryPoint(
      backupDirectory,
      'daily-20260615T000000001Z-123e4567-e89b-42d3-a456-426614174014',
      'daily',
      '2026-06-15T00:00:00.001Z'
    );
    seedRecoveryPoint(
      backupDirectory,
      'pre-migration-20260501T000000000Z-123e4567-e89b-42d3-a456-426614174012',
      'pre-migration',
      '2026-05-01T00:00:00.000Z'
    );
    seedRecoveryPoint(
      backupDirectory,
      'pre-migration-20260601T000000000Z-123e4567-e89b-42d3-a456-426614174013',
      'pre-migration',
      '2026-06-01T00:00:00.000Z'
    );

    try {
      const result = await executeSqliteBackupCommand({
        purpose: 'daily',
        sourceDatabasePath: sourcePath,
        backupDirectory,
        retentionDays: 30,
        now: () => new Date('2026-07-15T00:00:00.000Z'),
        randomUUID: () => '123e4567-e89b-42d3-a456-426614174002'
      });

      expect(result.exitCode).toBe(0);
      expect(
        readdirSync(backupDirectory)
          .filter((name) => !name.startsWith('.'))
          .sort()
      ).toEqual([
        'daily-20260615T000000000Z-123e4567-e89b-42d3-a456-426614174011',
        'daily-20260615T000000001Z-123e4567-e89b-42d3-a456-426614174014',
        'daily-20260715T000000000Z-123e4567-e89b-42d3-a456-426614174002',
        'pre-migration-20260601T000000000Z-123e4567-e89b-42d3-a456-426614174013'
      ]);
    } finally {
      source.close();
    }
  });

  test('ignores finalized-looking directories that are mismatched or no longer verified', async () => {
    const root = temporaryDirectory();
    const sourcePath = join(root, 'daily.db');
    const backupDirectory = join(root, 'backups');
    const source = new Database(sourcePath);
    source.exec('CREATE TABLE settings (value TEXT NOT NULL)');
    const mismatchedName =
      'daily-20260501T000000000Z-123e4567-e89b-42d3-a456-426614174080';
    seedRecoveryPoint(
      backupDirectory,
      mismatchedName,
      'pre-migration',
      '2026-05-01T00:00:00.000Z'
    );
    seedRecoveryPoint(
      backupDirectory,
      'pre-migration-20260601T000000000Z-123e4567-e89b-42d3-a456-426614174082',
      'pre-migration',
      '2026-06-01T00:00:00.000Z'
    );
    const corruptName =
      'daily-20260502T000000000Z-123e4567-e89b-42d3-a456-426614174083';
    seedRecoveryPoint(
      backupDirectory,
      corruptName,
      'daily',
      '2026-05-02T00:00:00.000Z'
    );
    writeFileSync(join(backupDirectory, corruptName, 'backup.sqlite3'), 'corrupt');
    const removeRecoveryPoint = vi.fn();

    try {
      const result = await executeSqliteBackupCommand({
        purpose: 'daily',
        sourceDatabasePath: sourcePath,
        backupDirectory,
        now: () => new Date('2026-07-15T00:00:00.000Z'),
        randomUUID: () => '123e4567-e89b-42d3-a456-426614174081',
        removeRecoveryPoint
      });

      expect(result.exitCode).toBe(0);
      expect(removeRecoveryPoint).not.toHaveBeenCalledWith(
        join(backupDirectory, mismatchedName)
      );
      expect(removeRecoveryPoint).not.toHaveBeenCalledWith(
        join(backupDirectory, corruptName)
      );
    } finally {
      source.close();
    }
  });

  test('reports retention failure without discarding a verified new recovery point', async () => {
    const root = temporaryDirectory();
    const sourcePath = join(root, 'daily.db');
    const backupDirectory = join(root, 'backups');
    const source = new Database(sourcePath);
    source.exec('CREATE TABLE settings (value TEXT NOT NULL)');
    seedRecoveryPoint(
      backupDirectory,
      'daily-20260501T000000000Z-123e4567-e89b-42d3-a456-426614174070',
      'daily',
      '2026-05-01T00:00:00.000Z'
    );
    const recordTechnicalEvent = vi.fn().mockResolvedValue(undefined);

    try {
      const result = await executeSqliteBackupCommand({
        purpose: 'daily',
        sourceDatabasePath: sourcePath,
        backupDirectory,
        now: () => new Date('2026-07-15T00:00:00.000Z'),
        randomUUID: () => '123e4567-e89b-42d3-a456-426614174071',
        removeRecoveryPoint: () => {
          throw new Error('/private/backup/path is read-only');
        },
        recordTechnicalEvent
      });

      expect(result).toEqual({
        exitCode: 0,
        recoveryPointName:
          'daily-20260715T000000000Z-123e4567-e89b-42d3-a456-426614174071'
      });
      expect(recordTechnicalEvent.mock.calls.map(([event]) => event.eventCode)).toEqual([
        'sqlite-backup-retention-failed',
        'sqlite-backup-completed'
      ]);
      expect(JSON.stringify(recordTechnicalEvent.mock.calls)).not.toContain(
        '/private/backup/path'
      );
    } finally {
      source.close();
    }
  });

  test('serializes concurrent daily and pre-migration attempts without output collision', async () => {
    const root = temporaryDirectory();
    const sourcePath = join(root, 'daily.db');
    const backupDirectory = join(root, 'backups');
    const source = new Database(sourcePath);
    source.exec('CREATE TABLE values_to_keep (value TEXT NOT NULL)');
    let activeBackups = 0;
    let maximumActiveBackups = 0;
    const onlineBackup = async (sourceDatabasePath: string, destinationPath: string) => {
      activeBackups += 1;
      maximumActiveBackups = Math.max(maximumActiveBackups, activeBackups);
      try {
        await new Promise((resolve) => setTimeout(resolve, 20));
        const database = new Database(sourceDatabasePath, { fileMustExist: true });
        try {
          await database.backup(destinationPath);
        } finally {
          database.close();
        }
      } finally {
        activeBackups -= 1;
      }
    };
    const backupIds = [
      '123e4567-e89b-42d3-a456-426614174020',
      '123e4567-e89b-42d3-a456-426614174021'
    ];

    try {
      const results = await Promise.all(
        (['daily', 'pre-migration'] as const).map((purpose) =>
          executeSqliteBackupCommand({
            purpose,
            sourceDatabasePath: sourcePath,
            backupDirectory,
            now: () => new Date('2026-07-15T00:00:00.000Z'),
            randomUUID: () => backupIds.shift()!,
            onlineBackup
          })
        )
      );

      expect(maximumActiveBackups).toBe(1);
      expect(results).toEqual([
        {
          exitCode: 0,
          recoveryPointName:
            'daily-20260715T000000000Z-123e4567-e89b-42d3-a456-426614174020'
        },
        {
          exitCode: 0,
          recoveryPointName:
            'pre-migration-20260715T000000000Z-123e4567-e89b-42d3-a456-426614174021'
        }
      ]);
    } finally {
      source.close();
    }
  });

  test('waits for another process beyond one lock-attempt timeout', async () => {
    const root = temporaryDirectory();
    const sourcePath = join(root, 'daily.db');
    const backupDirectory = join(root, 'backups');
    const lockPath = join(backupDirectory, '.backup-operation-lock.sqlite3');
    const source = new Database(sourcePath);
    source.exec('CREATE TABLE values_to_keep (value TEXT NOT NULL)');
    mkdirSync(backupDirectory, { recursive: true });

    const lockHolder = new Worker(
      `
        const Database = require('better-sqlite3');
        const { parentPort, workerData } = require('node:worker_threads');
        const lock = new Database(workerData.lockPath);
        lock.exec('BEGIN EXCLUSIVE');
        parentPort.postMessage('locked');
        setTimeout(() => {
          lock.close();
          parentPort.postMessage('released');
        }, 50);
      `,
      { eval: true, workerData: { lockPath } }
    );
    await new Promise<void>((resolve, reject) => {
      lockHolder.once('message', () => resolve());
      lockHolder.once('error', reject);
    });

    try {
      const result = await executeSqliteBackupCommand({
        purpose: 'pre-migration',
        sourceDatabasePath: sourcePath,
        backupDirectory,
        lockAttemptTimeoutMilliseconds: 5,
        now: () => new Date('2026-07-15T00:00:00.000Z'),
        randomUUID: () => '123e4567-e89b-42d3-a456-426614174022'
      });

      expect(result).toEqual({
        exitCode: 0,
        recoveryPointName:
          'pre-migration-20260715T000000000Z-123e4567-e89b-42d3-a456-426614174022'
      });
    } finally {
      await lockHolder.terminate();
      source.close();
    }
  });

  test('restores a consistent snapshot while committed WAL writes continue', async () => {
    const root = temporaryDirectory();
    const sourcePath = join(root, 'daily.db');
    const backupDirectory = join(root, 'backups');
    const writer = new Database(sourcePath);
    writer.pragma('journal_mode = WAL');
    writer.exec(`
      CREATE TABLE batches (id INTEGER PRIMARY KEY, expected_items INTEGER NOT NULL);
      CREATE TABLE batch_items (
        batch_id INTEGER NOT NULL REFERENCES batches(id),
        item_index INTEGER NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (batch_id, item_index)
      );
    `);
    const insertBatch = writer.transaction((batchId: number, itemCount: number) => {
      writer
        .prepare('INSERT INTO batches (id, expected_items) VALUES (?, ?)')
        .run(batchId, itemCount);
      const insertItem = writer.prepare(
        'INSERT INTO batch_items (batch_id, item_index, payload) VALUES (?, ?, ?)'
      );
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
        insertItem.run(batchId, itemIndex, 'x'.repeat(8_000));
      }
    });
    for (let batchId = 1; batchId <= 40; batchId += 1) insertBatch(batchId, 5);
    let committedDuringBackup = 0;

    try {
      const result = await executeSqliteBackupCommand({
        purpose: 'daily',
        sourceDatabasePath: sourcePath,
        backupDirectory,
        now: () => new Date('2026-07-15T01:00:00.000Z'),
        randomUUID: () => '123e4567-e89b-42d3-a456-426614174030',
        onlineBackupProgress: () => {
          if (committedDuringBackup < 3) {
            insertBatch(41 + committedDuringBackup, 5);
            committedDuringBackup += 1;
          }
          return 1;
        }
      });

      expect(result.exitCode).toBe(0);
      expect(committedDuringBackup).toBe(3);
      if (result.exitCode !== 0) throw new Error('Expected a finalized recovery point.');
      const restoredPath = join(root, 'restored.db');
      copyFileSync(
        join(backupDirectory, result.recoveryPointName, 'backup.sqlite3'),
        restoredPath
      );
      const restored = new Database(restoredPath, { readonly: true });
      try {
        expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
        expect(
          restored
            .prepare(
              `SELECT batches.id
               FROM batches
               LEFT JOIN batch_items ON batch_items.batch_id = batches.id
               GROUP BY batches.id
               HAVING COUNT(batch_items.item_index) != batches.expected_items`
            )
            .all()
        ).toEqual([]);
      } finally {
        restored.close();
      }
    } finally {
      writer.close();
    }
  });
});
