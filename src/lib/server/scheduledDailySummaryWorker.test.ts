import { describe, expect, test, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema';
import { createTechnicalLogStore } from './db/technicalLogStore';
import { createScheduledWorkerRunStore } from './db/scheduledWorkerRunStore';
import { createTechnicalEventRecorder } from './technicalEventRecorder';
import {
  runScheduledDailySummaryWorker,
  type ScheduledDailySummaryWorkerEvent
} from './scheduledDailySummaryWorker';
import type { ScheduledDeliveryWork } from './scheduledDelivery';
import {
  executeScheduledDailySummaryWorkerCommand,
  runScheduledDailySummaryWorkerCommand
} from './scheduledDailySummaryWorkerCommand';

const work = (opaqueId: string): ScheduledDeliveryWork => ({ opaqueId });

const emptyBatch = { work: [], nextCursor: null };

describe('scheduled Daily Summary worker command', () => {
  test('records an empty invocation as a healthy completed Scheduled Worker Run', async () => {
    const persistScheduledWorkerRun = vi.fn().mockResolvedValue(undefined);
    const eventNow = vi
      .fn()
      .mockReturnValueOnce(new Date('2026-07-15T08:30:00.000Z'))
      .mockReturnValueOnce(new Date('2026-07-15T08:30:00.004Z'));

    const result = await executeScheduledDailySummaryWorkerCommand({
      loadDependencies: async () => ({
        scheduledDelivery: {
          loadDueBatch: vi.fn().mockResolvedValue(emptyBatch),
          process: vi.fn()
        }
      }),
      emit: vi.fn(),
      eventNow,
      invocationMonotonicNow: vi.fn().mockReturnValueOnce(20).mockReturnValueOnce(24),
      persistScheduledWorkerRun,
      workerOptions: { monotonicNow: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(14) }
    });

    expect(result).toEqual({
      exitCode: 0,
      counts: { due: 0, sent: 0, skipped: 0, retrying: 0, failed: 0, isolatedError: 0 }
    });
    expect(persistScheduledWorkerRun).toHaveBeenCalledWith({
      startedAt: '2026-07-15T08:30:00.000Z',
      completedAt: '2026-07-15T08:30:00.004Z',
      durationMilliseconds: 4,
      outcome: 'succeeded',
      failureClassification: null,
      counts: result.counts
    });
  });

  test('uses the default Scheduled Worker Run store when only an event callback is injected', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const loadScheduledWorkerRunStore = vi.fn().mockResolvedValue({ persist });

    const result = await executeScheduledDailySummaryWorkerCommand({
      loadDependencies: async () => ({
        scheduledDelivery: {
          loadDueBatch: vi.fn().mockResolvedValue(emptyBatch),
          process: vi.fn()
        }
      }),
      loadScheduledWorkerRunStore,
      emit: vi.fn(),
      recordTechnicalEvent: vi.fn().mockResolvedValue(undefined)
    });

    expect(result.exitCode).toBe(0);
    expect(loadScheduledWorkerRunStore).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'succeeded',
        counts: result.counts
      })
    );
  });

  test('records a privacy-safe completion event through stdout and SQLite', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(readFileSync('drizzle/0013_add_technical_log_records.sql', 'utf8'));
    sqlite.exec(readFileSync('drizzle/0014_add_scheduled_worker_runs.sql', 'utf8'));
    const database = drizzle(sqlite, { schema });
    const store = createTechnicalLogStore(database);
    const runStore = createScheduledWorkerRunStore(database);
    const lines: string[] = [];
    const recorder = createTechnicalEventRecorder({
      store,
      writeLine: (line) => lines.push(line)
    });
    const privateCanaries = [
      'recipient@example.com',
      'unhashed-user-id',
      'Private Todo Task',
      'Private Calendar Event',
      'Weather at 52.2297,21.0122',
      'Home to Hospital Commute',
      '<html>Rendered Daily Summary</html>',
      '{"provider":"payload"}',
      'oauth-token-canary',
      'session-canary',
      'request-ip-and-user-agent-canary'
    ];

    try {
      const result = await executeScheduledDailySummaryWorkerCommand({
        loadDependencies: async () => ({
          scheduledDelivery: {
            loadDueBatch: vi
              .fn()
              .mockResolvedValueOnce({
                work: [work('a1b2c3d4e5f60718')],
                nextCursor: 'private-safe-cursor'
              })
              .mockResolvedValueOnce(emptyBatch),
            process: vi.fn().mockRejectedValue(new Error(privateCanaries.join(' | ')))
          }
        }),
        eventNow: () => new Date('2026-07-15T08:30:01.000Z'),
        recordTechnicalEvent: recorder.record,
        persistScheduledWorkerRun: runStore.persist
      });

      expect(result).toEqual({
        exitCode: 0,
        counts: { due: 1, sent: 0, skipped: 0, retrying: 0, failed: 0, isolatedError: 1 }
      });
      const serialized = [
        ...lines,
        JSON.stringify(await store.loadRecent(10)),
        JSON.stringify(await runStore.loadRecent(10))
      ].join('\n');
      expect(lines).toHaveLength(1);
      expect(serialized).toContain('scheduled-daily-summary-worker-completed');
      for (const canary of privateCanaries) {
        expect(serialized).not.toContain(canary);
      }
    } finally {
      sqlite.close();
    }
  });

  test('processes exact-boundary work across stable bounded batches and reports counts', async () => {
    const due = [
      work('1111111111111111'),
      work('2222222222222222'),
      work('3333333333333333')
    ];
    const loadDueBatch = vi
      .fn()
      .mockResolvedValueOnce({ work: due.slice(0, 2), nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ work: due.slice(2), nextCursor: 'cursor-2' })
      .mockResolvedValueOnce(emptyBatch);
    const process = vi
      .fn()
      .mockResolvedValueOnce({ outcome: 'sent' })
      .mockResolvedValueOnce({ outcome: 'skipped' })
      .mockResolvedValueOnce({
        outcome: 'retrying',
        errorClassification: 'provider-unavailable'
      });
    const events: ScheduledDailySummaryWorkerEvent[] = [];
    const persistScheduledWorkerRun = vi.fn().mockResolvedValue(undefined);

    const result = await executeScheduledDailySummaryWorkerCommand({
      loadDependencies: async () => ({
        scheduledDelivery: { loadDueBatch, process }
      }),
      workerOptions: {
        batchSize: 2,
        now: () => new Date('2026-07-14T07:00:00.000Z'),
        monotonicNow: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(14)
      },
      invocationMonotonicNow: vi.fn().mockReturnValueOnce(20).mockReturnValueOnce(24),
      persistScheduledWorkerRun,
      emit: (event) => events.push(event)
    });

    expect(result).toEqual({
      exitCode: 0,
      counts: { due: 3, sent: 1, skipped: 1, retrying: 1, failed: 0, isolatedError: 0 }
    });
    expect(loadDueBatch).toHaveBeenNthCalledWith(1, {
      eligibleAt: '2026-07-14T07:00:00.000Z',
      limit: 2,
      after: null
    });
    expect(loadDueBatch).toHaveBeenNthCalledWith(2, {
      eligibleAt: '2026-07-14T07:00:00.000Z',
      limit: 2,
      after: 'cursor-1'
    });
    expect(loadDueBatch).toHaveBeenNthCalledWith(3, {
      eligibleAt: '2026-07-14T07:00:00.000Z',
      limit: 2,
      after: 'cursor-2'
    });
    expect(events.at(-1)).toEqual({
      event: 'scheduled-daily-summary-worker-completed',
      counts: result.counts,
      durationMilliseconds: 4
    });
    expect(persistScheduledWorkerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'succeeded',
        counts: result.counts
      })
    );
  });

  test('records a repeated duplicate-safe invocation without a second send', async () => {
    const repeatedWork = work('1111111111111111');
    const loadDueBatch = vi
      .fn()
      .mockResolvedValueOnce({ work: [repeatedWork], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce(emptyBatch)
      .mockResolvedValueOnce({ work: [repeatedWork], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce(emptyBatch);
    let acceptedByProvider = false;
    const providerSend = vi.fn();
    const process = vi.fn().mockImplementation(async () => {
      if (acceptedByProvider) return { outcome: 'skipped' as const };
      acceptedByProvider = true;
      providerSend();
      return { outcome: 'sent' as const };
    });
    const persistedRuns: unknown[] = [];
    const dependencies = {
      scheduledDelivery: { loadDueBatch, process }
    };

    const first = await executeScheduledDailySummaryWorkerCommand({
      loadDependencies: async () => dependencies,
      emit: vi.fn(),
      persistScheduledWorkerRun: async (run) => {
        persistedRuns.push(run);
      }
    });
    const repeated = await executeScheduledDailySummaryWorkerCommand({
      loadDependencies: async () => dependencies,
      emit: vi.fn(),
      persistScheduledWorkerRun: async (run) => {
        persistedRuns.push(run);
      }
    });

    expect(first.counts).toMatchObject({ sent: 1, skipped: 0 });
    expect(repeated.counts).toMatchObject({ sent: 0, skipped: 1 });
    expect(providerSend).toHaveBeenCalledTimes(1);
    expect(persistedRuns).toEqual([
      expect.objectContaining({ counts: first.counts }),
      expect.objectContaining({ counts: repeated.counts })
    ]);
  });

  test('isolates one occurrence failure, continues the batch, and never emits private values', async () => {
    const privateValues = [
      'person@example.com',
      'Private Todo title',
      'Private Calendar event',
      'Private weather content',
      'Private commute location',
      'raw provider payload',
      'secret-token'
    ];
    const due = [
      work('1111111111111111'),
      work('2222222222222222')
    ];
    const process = vi
      .fn()
      .mockRejectedValueOnce(new Error(privateValues.join(' | ')))
      .mockResolvedValueOnce({
        outcome: 'failed',
        errorClassification: 'provider-rejected'
      });
    const lines: string[] = [];
    const persistScheduledWorkerRun = vi.fn().mockResolvedValue(undefined);

    const result = await executeScheduledDailySummaryWorkerCommand({
      loadDependencies: async () => ({
        scheduledDelivery: {
          loadDueBatch: vi
            .fn()
            .mockResolvedValueOnce({ work: due, nextCursor: 'cursor-1' })
            .mockResolvedValueOnce(emptyBatch),
          process
        }
      }),
      workerOptions: { now: () => new Date('2026-07-14T07:00:00.000Z') },
      persistScheduledWorkerRun,
      emit: (event) => lines.push(JSON.stringify(event))
    });

    expect(result).toEqual({
      exitCode: 0,
      counts: { due: 2, sent: 0, skipped: 0, retrying: 0, failed: 1, isolatedError: 1 }
    });
    expect(process).toHaveBeenCalledTimes(2);
    const output = lines.join('\n');
    for (const privateValue of privateValues) {
      expect(output).not.toContain(privateValue);
    }
    expect(output).not.toContain('user-1');
    expect(output).not.toContain('user-2');
    expect(output).toMatch(/"occurrenceId":"[a-f0-9]{16}"/);
    expect(output).toContain('"classification":"provider-rejected"');
    expect(persistScheduledWorkerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'completed-with-isolated-errors',
        failureClassification: null,
        counts: result.counts
      })
    );
  });

  test('returns a failing process status when querying due work fails', async () => {
    const events: ScheduledDailySummaryWorkerEvent[] = [];

    const result = await runScheduledDailySummaryWorker({
      scheduledDelivery: {
        loadDueBatch: vi.fn().mockRejectedValue(new Error('database path and credentials')),
        process: vi.fn()
      },
      now: () => new Date('2026-07-14T07:00:00.000Z'),
      emit: (event) => events.push(event)
    });

    expect(result.exitCode).toBe(1);
    expect(result.counts).toEqual({
      due: 0,
      sent: 0,
      skipped: 0,
      retrying: 0,
      failed: 0,
      isolatedError: 0
    });
    expect(JSON.stringify(events)).not.toContain('database path and credentials');
    expect(events.at(-1)).toMatchObject({
      event: 'scheduled-daily-summary-worker-failed',
      classification: 'due-work-query-failed'
    });
  });

  test('records a due-work query failure as a failed Scheduled Worker Run', async () => {
    const persistScheduledWorkerRun = vi.fn().mockResolvedValue(undefined);

    const result = await executeScheduledDailySummaryWorkerCommand({
      loadDependencies: async () => ({
        scheduledDelivery: {
          loadDueBatch: vi.fn().mockRejectedValue(new Error('private database path')),
          process: vi.fn()
        }
      }),
      eventNow: vi
        .fn()
        .mockReturnValueOnce(new Date('2026-07-15T08:30:00.000Z'))
        .mockReturnValueOnce(new Date('2026-07-15T08:30:00.007Z')),
      invocationMonotonicNow: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(17),
      persistScheduledWorkerRun,
      emit: vi.fn()
    });

    expect(result.exitCode).toBe(1);
    expect(persistScheduledWorkerRun).toHaveBeenCalledWith({
      startedAt: '2026-07-15T08:30:00.000Z',
      completedAt: '2026-07-15T08:30:00.007Z',
      durationMilliseconds: 7,
      outcome: 'failed',
      failureClassification: 'due-work-query-failed',
      counts: result.counts
    });
  });

  test('classifies an unexpected late top-level failure with best-known counts', async () => {
    const events: ScheduledDailySummaryWorkerEvent[] = [];
    const persistScheduledWorkerRun = vi.fn().mockResolvedValue(undefined);
    const due = work('1111111111111111');

    const result = await executeScheduledDailySummaryWorkerCommand({
      loadDependencies: async () => ({
        scheduledDelivery: {
          loadDueBatch: vi
            .fn()
            .mockResolvedValueOnce({ work: [due], nextCursor: 'cursor-1' })
            .mockResolvedValueOnce(emptyBatch),
          process: vi.fn().mockResolvedValue({ outcome: 'sent' })
        }
      }),
      workerOptions: {
        monotonicNow: vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(2)
      },
      eventNow: () => new Date('2026-07-15T08:30:00.000Z'),
      invocationMonotonicNow: vi
        .fn()
        .mockReturnValueOnce(10)
        .mockImplementationOnce(() => {
          throw new Error('recipient@example.com | private-token');
        })
        .mockReturnValueOnce(12),
      persistScheduledWorkerRun,
      emit: (event) => events.push(event)
    });

    expect(result).toEqual({
      exitCode: 1,
      counts: { due: 1, sent: 1, skipped: 0, retrying: 0, failed: 0, isolatedError: 0 }
    });
    expect(events.at(-1)).toEqual({
        event: 'scheduled-daily-summary-worker-failed',
        classification: 'unexpected',
        durationMilliseconds: 2,
        counts: result.counts
      });
    expect(JSON.stringify(events)).not.toMatch(/recipient@example.com|private-token/);
    expect(persistScheduledWorkerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failed',
        failureClassification: 'unexpected'
      })
    );
  });

  test('returns failure and emits a stable event when a completed run cannot be persisted', async () => {
    const events: ScheduledDailySummaryWorkerEvent[] = [];
    const recordTechnicalEvent = vi.fn().mockResolvedValue(undefined);

    const result = await executeScheduledDailySummaryWorkerCommand({
      loadDependencies: async () => ({
        scheduledDelivery: {
          loadDueBatch: vi.fn().mockResolvedValue(emptyBatch),
          process: vi.fn()
        }
      }),
      eventNow: () => new Date('2026-07-15T08:30:00.000Z'),
      invocationMonotonicNow: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(12),
      persistScheduledWorkerRun: vi
        .fn()
        .mockRejectedValue(new Error('private database path and credentials')),
      recordTechnicalEvent,
      emit: (event) => events.push(event)
    });

    expect(result.exitCode).toBe(1);
    expect(events).toEqual([
      {
        event: 'scheduled-daily-summary-worker-failed',
        classification: 'worker-run-persistence-failed',
        durationMilliseconds: 2,
        counts: result.counts
      }
    ]);
    expect(JSON.stringify(events)).not.toContain('private database path and credentials');
    expect(recordTechnicalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: 'scheduled-daily-summary-worker-failed',
        classification: 'worker-run-persistence-failed'
      })
    );
  });

  test('returns a failing process status when production dependencies cannot open', async () => {
    const events: ScheduledDailySummaryWorkerEvent[] = [];
    const persistScheduledWorkerRun = vi.fn().mockResolvedValue(undefined);
    const eventNow = vi
      .fn()
      .mockReturnValueOnce(new Date('2026-07-15T08:30:00.000Z'))
      .mockReturnValueOnce(new Date('2026-07-15T08:30:00.003Z'));

    const result = await executeScheduledDailySummaryWorkerCommand({
      loadDependencies: vi.fn().mockRejectedValue(new Error('private database path')),
      eventNow,
      invocationMonotonicNow: vi.fn().mockReturnValueOnce(20).mockReturnValueOnce(23),
      persistScheduledWorkerRun,
      emit: (event) => events.push(event)
    });

    expect(result.exitCode).toBe(1);
    expect(events).toEqual([
      {
        event: 'scheduled-daily-summary-worker-failed',
        classification: 'worker-initialization-failed',
        counts: result.counts,
        durationMilliseconds: 3
      }
    ]);
    expect(JSON.stringify(events)).not.toContain('private database path');
    expect(persistScheduledWorkerRun).toHaveBeenCalledWith({
      startedAt: '2026-07-15T08:30:00.000Z',
      completedAt: '2026-07-15T08:30:00.003Z',
      durationMilliseconds: 3,
      outcome: 'failed',
      failureClassification: 'worker-initialization-failed',
      counts: result.counts
    });
  });

  test('persists an initialization failure when the technical log database remains available', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(readFileSync('drizzle/0013_add_technical_log_records.sql', 'utf8'));
    sqlite.exec(readFileSync('drizzle/0014_add_scheduled_worker_runs.sql', 'utf8'));
    const database = drizzle(sqlite, { schema });
    const store = createTechnicalLogStore(database);
    const runStore = createScheduledWorkerRunStore(database);
    const recorder = createTechnicalEventRecorder({ store, writeLine: vi.fn() });

    try {
      const result = await executeScheduledDailySummaryWorkerCommand({
        loadDependencies: vi.fn().mockRejectedValue(new Error('private database path')),
        loadTechnicalEventRecorder: vi.fn().mockResolvedValue(recorder),
        eventNow: () => new Date('2026-07-15T08:30:00.000Z'),
        persistScheduledWorkerRun: runStore.persist
      });

      expect(result.exitCode).toBe(1);
      expect(await store.loadRecent(10)).toEqual([
        expect.objectContaining({
          eventCode: 'scheduled-daily-summary-worker-failed',
          failureClassification: 'worker-initialization-failed'
        })
      ]);
      expect(await runStore.loadRecent(10)).toEqual([
        expect.objectContaining({
          outcome: 'failed',
          failureClassification: 'worker-initialization-failed'
        })
      ]);
    } finally {
      sqlite.close();
    }
  });

  test('applies the command result to the real process-exit boundary', async () => {
    const setExitCode = vi.fn();
    const counts = {
      due: 0,
      sent: 0,
      skipped: 0,
      retrying: 0,
      failed: 0,
      isolatedError: 0
    };

    const result = await runScheduledDailySummaryWorkerCommand({
      execute: vi.fn().mockResolvedValue({ exitCode: 1, counts }),
      setExitCode
    });

    expect(result).toEqual({ exitCode: 1, counts });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});
