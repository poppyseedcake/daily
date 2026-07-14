import { createHash } from 'node:crypto';
import type {
  DueScheduledDailySummaryOccurrence,
  ScheduledDailySummaryOccurrenceCursor
} from './db/scheduledDailySummaryOccurrenceStore';

export type ScheduledDailySummaryWorkerCounts = {
  due: number;
  sent: number;
  skipped: number;
  retrying: number;
  failed: number;
  isolatedError: number;
};

export type ScheduledDailySummaryWorkerEvent =
  | {
      event: 'scheduled-daily-summary-occurrence-completed';
      occurrenceId: string;
      outcome: 'sent' | 'skipped' | 'retrying' | 'failed';
    }
  | {
      event: 'scheduled-daily-summary-occurrence-isolated-error';
      occurrenceId: string;
      classification: 'isolated-error';
    }
  | {
      event: 'scheduled-daily-summary-worker-completed';
      counts: ScheduledDailySummaryWorkerCounts;
      durationMilliseconds: number;
    }
  | {
      event: 'scheduled-daily-summary-worker-failed';
      counts: ScheduledDailySummaryWorkerCounts;
      durationMilliseconds: number;
      classification: 'due-work-query-failed' | 'worker-initialization-failed';
    };

type WorkerOutcome = {
  outcome: string;
};

export type ScheduledDailySummaryWorkerDependencies = {
  occurrenceStore: {
    loadProcessableBatch(query: {
      now: string;
      limit: number;
      after: ScheduledDailySummaryOccurrenceCursor | null;
    }): Promise<DueScheduledDailySummaryOccurrence[]>;
  };
  delivery: {
    processOccurrence(occurrence: DueScheduledDailySummaryOccurrence): Promise<WorkerOutcome>;
  };
  batchSize?: number;
  now?: () => Date;
  monotonicNow?: () => number;
  emit?: (event: ScheduledDailySummaryWorkerEvent) => void;
};

const emptyCounts = (): ScheduledDailySummaryWorkerCounts => ({
  due: 0,
  sent: 0,
  skipped: 0,
  retrying: 0,
  failed: 0,
  isolatedError: 0
});

const opaqueOccurrenceId = (occurrence: DueScheduledDailySummaryOccurrence) =>
  createHash('sha256')
    .update('scheduled-daily-summary-worker\0')
    .update(occurrence.userId)
    .update('\0')
    .update(occurrence.scheduledAt)
    .digest('hex')
    .slice(0, 16);

const countOutcome = (counts: ScheduledDailySummaryWorkerCounts, outcome: string) => {
  if (outcome === 'sent') {
    counts.sent += 1;
    return 'sent' as const;
  }

  if (outcome === 'retry-scheduled' || outcome === 'retry-pending') {
    counts.retrying += 1;
    return 'retrying' as const;
  }

  if (
    outcome === 'delivery-failed' ||
    outcome === 'retry-exhausted' ||
    outcome === 'stale-occurrence' ||
    outcome === 'provider-missing-message-id'
  ) {
    counts.failed += 1;
    return 'failed' as const;
  }

  counts.skipped += 1;
  return 'skipped' as const;
};

export const runScheduledDailySummaryWorker = async ({
  occurrenceStore,
  delivery,
  batchSize = 50,
  now = () => new Date(),
  monotonicNow = () => performance.now(),
  emit = (event) => console.log(JSON.stringify(event))
}: ScheduledDailySummaryWorkerDependencies) => {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error('Scheduled Daily Summary worker batch size must be a positive integer.');
  }

  const startedAt = monotonicNow();
  const processingTime = now().toISOString();
  const counts = emptyCounts();
  let after: ScheduledDailySummaryOccurrenceCursor | null = null;

  while (true) {
    let batch: DueScheduledDailySummaryOccurrence[];

    try {
      batch = await occurrenceStore.loadProcessableBatch({
        now: processingTime,
        limit: batchSize,
        after
      });
    } catch {
      emit({
        event: 'scheduled-daily-summary-worker-failed',
        classification: 'due-work-query-failed',
        counts,
        durationMilliseconds: monotonicNow() - startedAt
      });
      return { exitCode: 1 as const, counts };
    }

    if (batch.length === 0) {
      break;
    }

    for (const occurrence of batch) {
      counts.due += 1;
      const occurrenceId = opaqueOccurrenceId(occurrence);

      try {
        const result = await delivery.processOccurrence(occurrence);
        emit({
          event: 'scheduled-daily-summary-occurrence-completed',
          occurrenceId,
          outcome: countOutcome(counts, result.outcome)
        });
      } catch {
        counts.isolatedError += 1;
        emit({
          event: 'scheduled-daily-summary-occurrence-isolated-error',
          occurrenceId,
          classification: 'isolated-error'
        });
      }
    }

    const lastOccurrence = batch.at(-1)!;
    after = {
      scheduledAt: lastOccurrence.scheduledAt,
      workId: lastOccurrence.workId
    };
  }

  emit({
    event: 'scheduled-daily-summary-worker-completed',
    counts,
    durationMilliseconds: monotonicNow() - startedAt
  });

  return { exitCode: 0 as const, counts };
};
