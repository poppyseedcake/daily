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

describe('Technical Log Store', () => {
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
