import { describe, expect, test, vi } from 'vitest';
import {
  runScheduledDailySummaryWorker,
  type ScheduledDailySummaryWorkerEvent
} from './scheduledDailySummaryWorker';
import type { DueScheduledDailySummaryOccurrence } from './db/scheduledDailySummaryOccurrenceStore';
import {
  executeScheduledDailySummaryWorkerCommand,
  runScheduledDailySummaryWorkerCommand
} from './scheduledDailySummaryWorkerCommand';

const occurrence = (
  userId: string,
  scheduledAt: string,
  workId = `new:${userId}`
): DueScheduledDailySummaryOccurrence => ({
  userId,
  summaryRecipient: `${userId}@private.example`,
  scheduledAt,
  workId
});

describe('scheduled Daily Summary worker command', () => {
  test('processes exact-boundary work across stable bounded batches and reports counts', async () => {
    const due = [
      occurrence('user-1', '2026-07-14T07:00:00.000Z'),
      occurrence('user-2', '2026-07-14T07:00:00.000Z'),
      occurrence('user-3', '2026-07-14T07:00:00.000Z')
    ];
    const loadProcessableBatch = vi
      .fn()
      .mockResolvedValueOnce(due.slice(0, 2))
      .mockResolvedValueOnce(due.slice(2))
      .mockResolvedValueOnce([]);
    const processOccurrence = vi
      .fn()
      .mockResolvedValueOnce({ outcome: 'sent', occurrenceId: 'record-1' })
      .mockResolvedValueOnce({ outcome: 'not-qualifying' })
      .mockResolvedValueOnce({ outcome: 'retry-scheduled', occurrenceId: 'record-3' });
    const events: ScheduledDailySummaryWorkerEvent[] = [];

    const result = await executeScheduledDailySummaryWorkerCommand({
      loadDependencies: async () => ({
        occurrenceStore: { loadProcessableBatch },
        delivery: { processOccurrence }
      }),
      workerOptions: {
        batchSize: 2,
        now: () => new Date('2026-07-14T07:00:00.000Z'),
        monotonicNow: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(14)
      },
      emit: (event) => events.push(event)
    });

    expect(result).toEqual({
      exitCode: 0,
      counts: { due: 3, sent: 1, skipped: 1, retrying: 1, failed: 0, isolatedError: 0 }
    });
    expect(loadProcessableBatch).toHaveBeenNthCalledWith(1, {
      now: '2026-07-14T07:00:00.000Z',
      limit: 2,
      after: null
    });
    expect(loadProcessableBatch).toHaveBeenNthCalledWith(2, {
      now: '2026-07-14T07:00:00.000Z',
      limit: 2,
      after: { scheduledAt: due[1].scheduledAt, workId: due[1].workId }
    });
    expect(loadProcessableBatch).toHaveBeenNthCalledWith(3, {
      now: '2026-07-14T07:00:00.000Z',
      limit: 2,
      after: { scheduledAt: due[2].scheduledAt, workId: due[2].workId }
    });
    expect(events.at(-1)).toEqual({
      event: 'scheduled-daily-summary-worker-completed',
      counts: result.counts,
      durationMilliseconds: 4
    });
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
      occurrence('user-1', '2026-07-14T06:59:00.000Z'),
      occurrence('user-2', '2026-07-14T07:00:00.000Z')
    ];
    const processOccurrence = vi
      .fn()
      .mockRejectedValueOnce(new Error(privateValues.join(' | ')))
      .mockResolvedValueOnce({
        outcome: 'delivery-failed',
        occurrenceId: 'record-2',
        errorClassification: 'provider-rejected'
      });
    const lines: string[] = [];

    const result = await executeScheduledDailySummaryWorkerCommand({
      loadDependencies: async () => ({
        occurrenceStore: {
          loadProcessableBatch: vi.fn().mockResolvedValueOnce(due).mockResolvedValueOnce([])
        },
        delivery: { processOccurrence }
      }),
      workerOptions: { now: () => new Date('2026-07-14T07:00:00.000Z') },
      emit: (event) => lines.push(JSON.stringify(event))
    });

    expect(result).toEqual({
      exitCode: 0,
      counts: { due: 2, sent: 0, skipped: 0, retrying: 0, failed: 1, isolatedError: 1 }
    });
    expect(processOccurrence).toHaveBeenCalledTimes(2);
    const output = lines.join('\n');
    for (const privateValue of privateValues) {
      expect(output).not.toContain(privateValue);
    }
    expect(output).not.toContain('user-1');
    expect(output).not.toContain('user-2');
    expect(output).toMatch(/"occurrenceId":"[a-f0-9]{16}"/);
    expect(output).toContain('"classification":"provider-rejected"');
  });

  test('returns a failing process status when querying due work fails', async () => {
    const events: ScheduledDailySummaryWorkerEvent[] = [];

    const result = await runScheduledDailySummaryWorker({
      occurrenceStore: {
        loadProcessableBatch: vi.fn().mockRejectedValue(new Error('database path and credentials'))
      },
      delivery: { processOccurrence: vi.fn() },
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

  test('returns a failing process status when production dependencies cannot open', async () => {
    const events: ScheduledDailySummaryWorkerEvent[] = [];

    const result = await executeScheduledDailySummaryWorkerCommand({
      loadDependencies: vi.fn().mockRejectedValue(new Error('private database path')),
      emit: (event) => events.push(event)
    });

    expect(result.exitCode).toBe(1);
    expect(events).toEqual([
      {
        event: 'scheduled-daily-summary-worker-failed',
        classification: 'worker-initialization-failed',
        counts: result.counts,
        durationMilliseconds: 0
      }
    ]);
    expect(JSON.stringify(events)).not.toContain('private database path');
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
