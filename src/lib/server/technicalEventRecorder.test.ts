import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, test, vi } from 'vitest';
import * as schema from './db/schema';
import { createTechnicalLogStore } from './db/technicalLogStore';
import {
  createTechnicalCorrelationId,
  createTechnicalEventRecorder,
  technicalEventSchema
} from './technicalEventRecorder';

describe('Technical Event Recorder', () => {
  test('records an Admin Panel Maps control change with only previous and new state', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const lines: string[] = [];
    const recorder = createTechnicalEventRecorder({
      store: { persist },
      writeLine: (line) => lines.push(line)
    });

    const result = await recorder.record({
      eventCode: 'admin-google-maps-kill-switch-changed',
      occurredAt: '2026-07-15T12:00:00.000Z',
      previousEnabled: false,
      newEnabled: true
    });

    expect(result).toEqual({
      eventCode: 'admin-google-maps-kill-switch-changed',
      severity: 'info',
      subsystem: 'admin-controls',
      occurredAt: '2026-07-15T12:00:00.000Z',
      outcome: 'succeeded',
      metadata: { previousEnabled: false, newEnabled: true }
    });
    expect(technicalEventSchema.parse(JSON.parse(lines[0]))).toEqual(result);
    expect(persist).toHaveBeenCalledWith(result);
    expect(lines[0]).not.toMatch(/admin@example\.com|request|client|user-agent/i);
  });

  test('emits and persists one schema-valid worker completion event', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(readFileSync('drizzle/0013_add_technical_log_records.sql', 'utf8'));
    const database = drizzle(sqlite, { schema });
    const writeLine = vi.fn();
    const recorder = createTechnicalEventRecorder({
      store: createTechnicalLogStore(database),
      writeLine
    });
    const correlationId = createTechnicalCorrelationId();

    try {
      await recorder.record({
        eventCode: 'scheduled-daily-summary-worker-completed',
        occurredAt: '2026-07-15T08:30:00.000Z',
        correlationId,
        durationMilliseconds: 42,
        counts: {
          due: 3,
          sent: 2,
          skipped: 1,
          retrying: 0,
          failed: 0,
          isolatedError: 0
        }
      });

      expect(writeLine).toHaveBeenCalledTimes(1);
      const emitted = technicalEventSchema.parse(JSON.parse(writeLine.mock.calls[0][0]));
      expect(emitted).toEqual({
        eventCode: 'scheduled-daily-summary-worker-completed',
        severity: 'info',
        subsystem: 'scheduled-delivery',
        occurredAt: '2026-07-15T08:30:00.000Z',
        correlationId,
        outcome: 'succeeded',
        durationMilliseconds: 42,
        metadata: {
          dueCount: 3,
          sentCount: 2,
          skippedCount: 1,
          retryingCount: 0,
          failedCount: 0,
          isolatedErrorCount: 0
        }
      });
      expect(await createTechnicalLogStore(database).loadRecent(10)).toEqual([
        expect.objectContaining(emitted)
      ]);
    } finally {
      sqlite.close();
    }
  });

  test('classifies an unknown failure generically without exposing private canaries', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(readFileSync('drizzle/0013_add_technical_log_records.sql', 'utf8'));
    const database = drizzle(sqlite, { schema });
    const lines: string[] = [];
    const recorder = createTechnicalEventRecorder({
      store: createTechnicalLogStore(database),
      writeLine: (line) => lines.push(line)
    });
    const canaries = [
      'recipient@example.com',
      'Private Todo Task',
      'Private Calendar Event',
      'Warsaw Weather Location',
      'Home to Hospital Commute',
      '<html>Rendered Daily Summary</html>',
      '{"provider":"payload"}',
      'oauth-token-canary',
      'session-canary',
      'request-metadata-canary',
      'raw-user-id-canary'
    ];
    const failure = Object.assign(new Error(canaries.join(' | ')), {
      cause: canaries[0],
      providerPayload: canaries[6]
    });

    try {
      await recorder.record({
        eventCode: 'scheduled-daily-summary-worker-failed',
        occurredAt: '2026-07-15T08:30:00.000Z',
        durationMilliseconds: 42,
        counts: { due: 1, sent: 0, skipped: 0, retrying: 0, failed: 0, isolatedError: 1 },
        failure
      });

      const persisted = await createTechnicalLogStore(database).loadRecent(10);
      const serialized = [...lines, JSON.stringify(persisted)].join('\n');
      expect(lines.map((line) => technicalEventSchema.parse(JSON.parse(line)))).toEqual([
        expect.objectContaining({
          eventCode: 'scheduled-daily-summary-worker-failed',
          severity: 'error',
          subsystem: 'scheduled-delivery',
          outcome: 'failed',
          failureClassification: 'unexpected'
        })
      ]);
      for (const canary of canaries) {
        expect(serialized).not.toContain(canary);
      }
      expect(serialized).not.toContain('stack');
      expect(serialized).not.toContain('cause');
      expect(serialized).not.toContain('providerPayload');
    } finally {
      sqlite.close();
    }
  });

  test('still emits safe JSON and preserves the primary result when persistence fails', async () => {
    const lines: string[] = [];
    const persist = vi.fn().mockRejectedValue(new Error('database path with credentials'));
    const recorder = createTechnicalEventRecorder({
      store: { persist },
      writeLine: (line) => lines.push(line)
    });

    const result = await recorder.record({
      eventCode: 'scheduled-daily-summary-worker-completed',
      occurredAt: '2026-07-15T08:30:00.000Z',
      durationMilliseconds: 7,
      counts: { due: 0, sent: 0, skipped: 0, retrying: 0, failed: 0, isolatedError: 0 }
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(lines).toHaveLength(1);
    expect(technicalEventSchema.parse(JSON.parse(lines[0]))).toEqual(result);
    expect(lines[0]).not.toContain('database path with credentials');

    if (false) {
      await recorder.record({
        eventCode: 'scheduled-daily-summary-worker-completed',
        occurredAt: '2026-07-15T08:30:00.000Z',
        durationMilliseconds: 7,
        counts: { due: 0, sent: 0, skipped: 0, retrying: 0, failed: 0, isolatedError: 0 },
        // @ts-expect-error Technical Event call sites cannot supply arbitrary metadata maps.
        metadata: { recipientEmail: 'recipient@example.com' }
      });
    }
  });

  test('still persists and preserves the primary result when stdout fails', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const recorder = createTechnicalEventRecorder({
      store: { persist },
      writeLine: () => {
        throw new Error('stdout unavailable');
      }
    });

    const result = await recorder.record({
      eventCode: 'scheduled-daily-summary-worker-completed',
      occurredAt: '2026-07-15T08:30:00.000Z',
      durationMilliseconds: 7,
      counts: { due: 0, sent: 0, skipped: 0, retrying: 0, failed: 0, isolatedError: 0 }
    });

    expect(result.eventCode).toBe('scheduled-daily-summary-worker-completed');
    expect(persist).toHaveBeenCalledWith(result);
  });

  test('records a backup failure without exposing the source path or raw failure', async () => {
    const lines: string[] = [];
    const persist = vi.fn().mockResolvedValue(undefined);
    const recorder = createTechnicalEventRecorder({
      store: { persist },
      writeLine: (line) => lines.push(line)
    });

    const event = await recorder.record({
      eventCode: 'sqlite-backup-failed',
      occurredAt: '2026-07-15T12:00:00.000Z',
      durationMilliseconds: 12,
      purpose: 'daily',
      recoveryPointId: '123e4567-e89b-42d3-a456-426614174060',
      classification: 'backup-failed',
      failure: new Error('/private/source/daily.db recipient@example.com')
    });

    expect(event).toEqual({
      eventCode: 'sqlite-backup-failed',
      severity: 'error',
      subsystem: 'database-backup',
      occurredAt: '2026-07-15T12:00:00.000Z',
      outcome: 'failed',
      failureClassification: 'backup-failed',
      durationMilliseconds: 12,
      metadata: {
        purpose: 'daily',
        recoveryPointId: '123e4567-e89b-42d3-a456-426614174060'
      }
    });
    expect(lines[0]).not.toMatch(/private|recipient@example\.com|stack|message/);
    expect(persist).toHaveBeenCalledWith(event);
  });
});
