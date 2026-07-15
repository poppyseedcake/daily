import { createHash } from 'node:crypto';
import type {
  DueScheduledDailySummaryOccurrence,
  ScheduledDailySummaryOccurrenceCursor
} from './db/scheduledDailySummaryOccurrenceStore';
import type { DeliveryErrorClassification } from '$lib/deliveryRecords';
import type { ScheduledDailySummaryDeliveryOutcomeName } from './scheduledDailySummaryDelivery';

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
      classification?: DeliveryErrorClassification;
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
  outcome: ScheduledDailySummaryDeliveryOutcomeName;
  errorClassification?: DeliveryErrorClassification;
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

export const emptyScheduledDailySummaryWorkerCounts = (): ScheduledDailySummaryWorkerCounts => ({
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

const countOutcome = (counts: ScheduledDailySummaryWorkerCounts, result: WorkerOutcome) => {
  switch (result.outcome) {
    case 'sent':
      counts.sent += 1;
      return { outcome: 'sent' as const };
    case 'retry-scheduled':
    case 'retry-pending':
      counts.retrying += 1;
      return {
        outcome: 'retrying' as const,
        ...(result.errorClassification
          ? { classification: result.errorClassification }
          : {})
      };
    case 'delivery-failed':
    case 'retry-exhausted':
    case 'stale-occurrence':
    case 'provider-missing-message-id': {
      counts.failed += 1;
      const classification =
        result.errorClassification ??
        (result.outcome === 'delivery-failed' ? 'unexpected' : result.outcome);
      return { outcome: 'failed' as const, classification };
    }
    case 'claim-lost':
    case 'not-qualifying':
    case 'already-processed':
    case 'already-claimed':
      counts.skipped += 1;
      return { outcome: 'skipped' as const };
    default: {
      const exhaustiveOutcome: never = result.outcome;
      return exhaustiveOutcome;
    }
  }
};

export const runScheduledDailySummaryWorker = async ({
  occurrenceStore,
  delivery,
  batchSize = 50,
  now = () => new Date(),
  monotonicNow = () => performance.now(),
  emit = () => {}
}: ScheduledDailySummaryWorkerDependencies) => {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error('Scheduled Daily Summary worker batch size must be a positive integer.');
  }

  const startedAt = monotonicNow();
  const processingTime = now().toISOString();
  const counts = emptyScheduledDailySummaryWorkerCounts();
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
          ...countOutcome(counts, result)
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
