import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, test } from 'vitest';
import * as schema from './schema';
import type { TechnicalEvent } from '../technicalEventRecorder';
import {
  createTechnicalLogStore,
  defaultTechnicalLogRetentionDays
} from './technicalLogStore';

const completedEvent = (occurredAt: string): TechnicalEvent => ({
  eventCode: 'scheduled-daily-summary-worker-completed',
  severity: 'info',
  subsystem: 'scheduled-delivery',
  occurredAt,
  outcome: 'succeeded',
  durationMilliseconds: 1,
  metadata: {
    dueCount: 0,
    sentCount: 0,
    skippedCount: 0,
    retryingCount: 0,
    failedCount: 0,
    isolatedErrorCount: 0
  }
});

const failedEvent = (occurredAt: string): TechnicalEvent => ({
  eventCode: 'scheduled-daily-summary-worker-failed',
  severity: 'error',
  subsystem: 'scheduled-delivery',
  occurredAt,
  outcome: 'failed',
  failureClassification: 'unexpected',
  durationMilliseconds: 2,
  metadata: {
    dueCount: 1,
    sentCount: 0,
    skippedCount: 0,
    retryingCount: 0,
    failedCount: 1,
    isolatedErrorCount: 1
  }
});

describe('Technical Log Store', () => {
  test('lists newest records through bounded filtered cursor pages', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(readFileSync('drizzle/0013_add_technical_log_records.sql', 'utf8'));
    const database = drizzle(sqlite, { schema });
    const store = createTechnicalLogStore(database);

    try {
      await store.persist(completedEvent('2026-07-15T08:00:00.000Z'));
      await store.persist(failedEvent('2026-07-15T09:00:00.000Z'));
      await store.persist(completedEvent('2026-07-15T10:00:00.000Z'));
      await store.persist(failedEvent('2026-07-15T11:00:00.000Z'));

      const firstPage = await store.list({
        pageSize: 1,
        fromUtc: '2026-07-15T08:30:00.000Z',
        toUtc: '2026-07-15T11:30:00.000Z',
        severity: 'error',
        subsystem: 'scheduled-delivery',
        eventCode: 'scheduled-daily-summary-worker-failed'
      });
      expect(firstPage.records).toEqual([
        expect.objectContaining({ occurredAt: '2026-07-15T11:00:00.000Z', severity: 'error' })
      ]);
      expect(firstPage.nextCursor).toEqual(expect.any(String));

      const secondPage = await store.list({
        pageSize: 1,
        cursor: firstPage.nextCursor,
        fromUtc: '2026-07-15T08:30:00.000Z',
        toUtc: '2026-07-15T11:30:00.000Z',
        severity: 'error',
        subsystem: 'scheduled-delivery',
        eventCode: 'scheduled-daily-summary-worker-failed'
      });
      expect(secondPage).toEqual({
        records: [
          expect.objectContaining({ occurredAt: '2026-07-15T09:00:00.000Z', severity: 'error' })
        ],
        nextCursor: null
      });

      await expect(store.list({ pageSize: 101 })).rejects.toThrow(
        'pageSize must be a positive bounded integer.'
      );
      await expect(store.list({ pageSize: 10, cursor: 'not-a-cursor' })).rejects.toThrow(
        'Invalid Technical Log cursor.'
      );
    } finally {
      sqlite.close();
    }
  });

  test('uses 30-day retention and bounds each cleanup batch', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(readFileSync('drizzle/0013_add_technical_log_records.sql', 'utf8'));
    const database = drizzle(sqlite, { schema });
    let now = new Date('2026-06-01T00:00:00.000Z');
    const store = createTechnicalLogStore(database, {
      now: () => now,
      cleanupBatchSize: 2
    });

    try {
      expect(defaultTechnicalLogRetentionDays).toBe(30);
      for (const occurredAt of [
        '2026-06-12T00:00:00.000Z',
        '2026-06-13T00:00:00.000Z',
        '2026-06-14T00:00:00.000Z',
        '2026-06-15T00:00:00.000Z',
        '2026-06-16T00:00:00.000Z'
      ]) {
        await store.persist(completedEvent(occurredAt));
      }

      now = new Date('2026-07-15T00:00:00.000Z');
      await store.persist(completedEvent(now.toISOString()));

      const afterFirstBatch = await store.loadRecent(10);
      expect(afterFirstBatch.filter(({ occurredAt }) => occurredAt < '2026-06-15T00:00:00.000Z'))
        .toHaveLength(1);
      expect(afterFirstBatch.map(({ occurredAt }) => occurredAt)).toContain(
        '2026-06-15T00:00:00.000Z'
      );

      await store.persist(completedEvent('2026-07-15T00:00:01.000Z'));
      expect(
        (await store.loadRecent(10)).filter(
          ({ occurredAt }) => occurredAt < '2026-06-15T00:00:00.000Z'
        )
      ).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });
});
