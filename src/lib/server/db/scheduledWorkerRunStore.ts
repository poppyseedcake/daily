import { asc, desc, inArray, lt } from 'drizzle-orm';
import type { db } from '$lib/server/db';
import type {
  ScheduledDailySummaryWorkerCounts,
  ScheduledDailySummaryWorkerFailureClassification
} from '../scheduledDailySummaryWorker';
import { scheduledDailySummaryWorkerFailureClassifications } from '../scheduledDailySummaryWorker';
import {
  operationalRetentionCutoff,
  operationalRetentionDaysFromEnvironment,
  positiveBoundedInteger
} from './operationalRetention';
import { scheduledWorkerRuns } from './schema';

type ScheduledWorkerRunDatabase = typeof db;

export type ScheduledWorkerRunOutcome =
  | 'succeeded'
  | 'completed-with-isolated-errors'
  | 'failed';

export type ScheduledWorkerRun = {
  startedAt: string;
  completedAt: string;
  durationMilliseconds: number;
  outcome: ScheduledWorkerRunOutcome;
  failureClassification: ScheduledDailySummaryWorkerFailureClassification | null;
  counts: ScheduledDailySummaryWorkerCounts;
};

const defaultCleanupBatchSize = 100;
const maximumCleanupBatchSize = 1_000;

const storedFailureClassification = (value: string | null) => {
  if (value === null) return null;
  if (
    scheduledDailySummaryWorkerFailureClassifications.includes(
      value as ScheduledDailySummaryWorkerFailureClassification
    )
  ) {
    return value as ScheduledDailySummaryWorkerFailureClassification;
  }
  throw new Error('Scheduled Worker Run has an unknown failure classification.');
};

const storedRun = (row: typeof scheduledWorkerRuns.$inferSelect): ScheduledWorkerRun & { id: string } => ({
  id: row.id,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
  durationMilliseconds: row.durationMilliseconds,
  outcome: row.outcome,
  failureClassification: storedFailureClassification(row.failureClassification),
  counts: {
    due: row.dueCount,
    sent: row.sentCount,
    skipped: row.skippedCount,
    retrying: row.retryingCount,
    failed: row.failedCount,
    isolatedError: row.isolatedErrorCount
  }
});

export const createScheduledWorkerRunStore = (
  database: ScheduledWorkerRunDatabase,
  {
    retentionDays = operationalRetentionDaysFromEnvironment(),
    cleanupBatchSize = defaultCleanupBatchSize,
    now = () => new Date()
  }: {
    retentionDays?: number;
    cleanupBatchSize?: number;
    now?: () => Date;
  } = {}
) => {
  const boundedRetentionDays = positiveBoundedInteger(retentionDays, 'retentionDays');
  const boundedCleanupBatchSize = positiveBoundedInteger(
    cleanupBatchSize,
    'cleanupBatchSize',
    maximumCleanupBatchSize
  );

  const deleteExpiredBatch = async () => {
    const expiredRunIds = database
      .select({ id: scheduledWorkerRuns.id })
      .from(scheduledWorkerRuns)
      .where(
        lt(scheduledWorkerRuns.completedAt, operationalRetentionCutoff(now(), boundedRetentionDays))
      )
      .orderBy(asc(scheduledWorkerRuns.completedAt))
      .limit(boundedCleanupBatchSize);

    await database.delete(scheduledWorkerRuns).where(inArray(scheduledWorkerRuns.id, expiredRunIds)).run();
  };

  return {
    async persist(run: ScheduledWorkerRun) {
      await database
        .insert(scheduledWorkerRuns)
        .values({
          id: crypto.randomUUID(),
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          durationMilliseconds: run.durationMilliseconds,
          outcome: run.outcome,
          failureClassification: run.failureClassification,
          dueCount: run.counts.due,
          sentCount: run.counts.sent,
          skippedCount: run.counts.skipped,
          retryingCount: run.counts.retrying,
          failedCount: run.counts.failed,
          isolatedErrorCount: run.counts.isolatedError
        })
        .run();
      try {
        await deleteExpiredBatch();
      } catch {
        // Bounded maintenance is best effort after the invocation record is durable.
      }
    },
    async loadRecent(limit: number) {
      const rows = await database
        .select()
        .from(scheduledWorkerRuns)
        .orderBy(desc(scheduledWorkerRuns.completedAt))
        .limit(limit);

      return rows.map(storedRun);
    }
  };
};

export type ScheduledWorkerRunStore = ReturnType<typeof createScheduledWorkerRunStore>;
