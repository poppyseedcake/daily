import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, test } from 'vitest';
import * as schema from './schema';
import { createScheduledWorkerRunStore } from './scheduledWorkerRunStore';

const completedRun = (startedAt: string, completedAt: string) => ({
  startedAt,
  completedAt,
  durationMilliseconds: 1,
  outcome: 'succeeded' as const,
  failureClassification: null,
  counts: {
    due: 0,
    sent: 0,
    skipped: 0,
    retrying: 0,
    failed: 0,
    isolatedError: 0
  }
});

describe('Scheduled Worker Run Store', () => {
  test('persists aggregate-only successful, isolated-error, and failed runs', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(readFileSync('drizzle/0014_add_scheduled_worker_runs.sql', 'utf8'));
    const store = createScheduledWorkerRunStore(drizzle(sqlite, { schema }));

    try {
      await store.persist(completedRun('2026-07-15T08:30:00.000Z', '2026-07-15T08:30:00.001Z'));
      await store.persist({
        ...completedRun('2026-07-15T08:31:00.000Z', '2026-07-15T08:31:00.005Z'),
        durationMilliseconds: 5,
        outcome: 'completed-with-isolated-errors',
        counts: {
          due: 2,
          sent: 1,
          skipped: 0,
          retrying: 0,
          failed: 0,
          isolatedError: 1
        }
      });
      await store.persist({
        ...completedRun('2026-07-15T08:32:00.000Z', '2026-07-15T08:32:00.003Z'),
        durationMilliseconds: 3,
        outcome: 'failed',
        failureClassification: 'due-work-query-failed'
      });

      expect(await store.loadRecent(10)).toEqual([
        expect.objectContaining({
          startedAt: '2026-07-15T08:32:00.000Z',
          completedAt: '2026-07-15T08:32:00.003Z',
          durationMilliseconds: 3,
          outcome: 'failed',
          failureClassification: 'due-work-query-failed'
        }),
        expect.objectContaining({
          outcome: 'completed-with-isolated-errors',
          counts: {
            due: 2,
            sent: 1,
            skipped: 0,
            retrying: 0,
            failed: 0,
            isolatedError: 1
          }
        }),
        expect.objectContaining({ outcome: 'succeeded' })
      ]);
      expect(JSON.stringify(await store.loadRecent(10))).not.toMatch(
        /userId|recipient|content|providerPayload|providerMessageId/
      );
    } finally {
      sqlite.close();
    }
  });

  test('uses the shared operational retention window and bounds cleanup', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(readFileSync('drizzle/0014_add_scheduled_worker_runs.sql', 'utf8'));
    let now = new Date('2026-06-01T00:00:00.000Z');
    const store = createScheduledWorkerRunStore(drizzle(sqlite, { schema }), {
      retentionDays: 30,
      cleanupBatchSize: 2,
      now: () => now
    });

    try {
      for (const startedAt of [
        '2026-06-12T00:00:00.000Z',
        '2026-06-13T00:00:00.000Z',
        '2026-06-14T00:00:00.000Z',
        '2026-06-15T00:00:00.000Z'
      ]) {
        await store.persist(completedRun(startedAt, startedAt));
      }

      now = new Date('2026-07-15T00:00:00.000Z');
      await store.persist(completedRun(now.toISOString(), now.toISOString()));
      expect((await store.loadRecent(10)).filter(({ completedAt }) => completedAt < '2026-06-15T00:00:00.000Z'))
        .toHaveLength(1);

      await store.persist(completedRun('2026-07-15T00:00:01.000Z', '2026-07-15T00:00:01.000Z'));
      expect((await store.loadRecent(10)).filter(({ completedAt }) => completedAt < '2026-06-15T00:00:00.000Z'))
        .toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });

  test('keeps a persisted run successful when post-insert retention cleanup fails', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(readFileSync('drizzle/0014_add_scheduled_worker_runs.sql', 'utf8'));
    const database = drizzle(sqlite, { schema });
    const store = createScheduledWorkerRunStore(database, {
      now: () => new Date('invalid maintenance clock')
    });

    try {
      await expect(
        store.persist(
          completedRun('2026-07-15T08:30:00.000Z', '2026-07-15T08:30:00.001Z')
        )
      ).resolves.toBeUndefined();
      expect(await store.loadRecent(10)).toEqual([
        expect.objectContaining({ outcome: 'succeeded' })
      ]);
    } finally {
      sqlite.close();
    }
  });
});
