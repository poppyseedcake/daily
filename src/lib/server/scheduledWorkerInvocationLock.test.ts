import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  scheduledWorkerLockPath,
  tryWithScheduledWorkerInvocationLock
} from './scheduledWorkerInvocationLock';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('scheduled worker invocation lock', () => {
  test('skips a concurrent invocation until the first one releases the SQLite lock', async () => {
    const root = mkdtempSync(join(tmpdir(), 'daily-worker-lock-'));
    temporaryDirectories.push(root);
    const databasePath = join(root, 'daily.db');
    let entered = false;
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = tryWithScheduledWorkerInvocationLock(databasePath, async () => {
      entered = true;
      await released;
      return 'first';
    });

    while (!entered) await new Promise((resolve) => setImmediate(resolve));
    const second = await tryWithScheduledWorkerInvocationLock(databasePath, async () => 'second');

    expect(second).toEqual({ acquired: false });
    expect(scheduledWorkerLockPath(databasePath)).toBe(join(root, '.scheduled-worker-lock.sqlite3'));

    release();
    await expect(first).resolves.toEqual({ acquired: true, result: 'first' });
    await expect(
      tryWithScheduledWorkerInvocationLock(databasePath, async () => 'after-release')
    ).resolves.toEqual({ acquired: true, result: 'after-release' });
  });
});
