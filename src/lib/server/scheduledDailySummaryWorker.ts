import type { DeliveryErrorClassification } from '$lib/deliveryRecords';
import type {
  ScheduledDeliveryModule,
  ScheduledDeliveryOutcome
} from './scheduledDelivery';

export type ScheduledDailySummaryWorkerCounts = {
  due: number;
  sent: number;
  skipped: number;
  retrying: number;
  failed: number;
  isolatedError: number;
};

export const scheduledDailySummaryWorkerFailureClassifications = [
  'due-work-query-failed',
  'worker-initialization-failed',
  'worker-run-persistence-failed',
  'unexpected'
] as const;

export type ScheduledDailySummaryWorkerFailureClassification =
  (typeof scheduledDailySummaryWorkerFailureClassifications)[number];

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
      classification: ScheduledDailySummaryWorkerFailureClassification;
    };

export type ScheduledDailySummaryWorkerDependencies = {
  scheduledDelivery: Pick<ScheduledDeliveryModule, 'loadDueBatch' | 'process'>;
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

const countOutcome = (
  counts: ScheduledDailySummaryWorkerCounts,
  result: ScheduledDeliveryOutcome
) => {
  switch (result.outcome) {
    case 'sent':
      counts.sent += 1;
      return { outcome: 'sent' as const };
    case 'retrying':
      counts.retrying += 1;
      return {
        outcome: 'retrying' as const,
        ...(result.errorClassification
          ? { classification: result.errorClassification }
          : {})
      };
    case 'failed': {
      counts.failed += 1;
      return {
        outcome: 'failed' as const,
        classification: result.errorClassification
      };
    }
    case 'skipped':
      counts.skipped += 1;
      return {
        outcome: 'skipped' as const,
        ...(result.errorClassification ? { classification: result.errorClassification } : {})
      };
    default: {
      const exhaustiveOutcome: never = result;
      return exhaustiveOutcome;
    }
  }
};

export const runScheduledDailySummaryWorker = async ({
  scheduledDelivery,
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
  let after: string | null = null;

  while (true) {
    let batch: Awaited<ReturnType<ScheduledDeliveryModule['loadDueBatch']>>;

    try {
      batch = await scheduledDelivery.loadDueBatch({
        eligibleAt: processingTime,
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

    if (batch.work.length === 0) {
      break;
    }

    for (const work of batch.work) {
      counts.due += 1;

      try {
        const result = await scheduledDelivery.process(work);
        emit({
          event: 'scheduled-daily-summary-occurrence-completed',
          occurrenceId: work.opaqueId,
          ...countOutcome(counts, result)
        });
      } catch {
        counts.isolatedError += 1;
        emit({
          event: 'scheduled-daily-summary-occurrence-isolated-error',
          occurrenceId: work.opaqueId,
          classification: 'isolated-error'
        });
      }
    }

    if (!batch.nextCursor) {
      throw new Error('Scheduled Delivery batch did not provide a cursor.');
    }
    after = batch.nextCursor;
  }

  emit({
    event: 'scheduled-daily-summary-worker-completed',
    counts,
    durationMilliseconds: monotonicNow() - startedAt
  });

  return { exitCode: 0 as const, counts };
};
