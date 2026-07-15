import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { DeliveryErrorClassification } from '$lib/deliveryRecords';
import { deliveryErrorClassifications } from '$lib/deliveryRecords';
import type { db } from '$lib/server/db';
import type {
  ScheduledDailySummaryWorkerCounts,
  ScheduledDailySummaryWorkerFailureClassification
} from '../scheduledDailySummaryWorker';
import { scheduledDailySummaryWorkerFailureClassifications } from '../scheduledDailySummaryWorker';
import { deliveryRecords, scheduledWorkerRuns } from './schema';

type DeliveryHealthDatabase = typeof db;

export const defaultScheduledWorkerOverdueMinutes = 5;
const maximumScheduledWorkerOverdueMinutes = 24 * 60;

export const scheduledWorkerOverdueMinutesFromEnvironment = (
  configuredValue = process.env.SCHEDULED_WORKER_OVERDUE_MINUTES
) => {
  if (configuredValue === undefined || configuredValue === '') {
    return defaultScheduledWorkerOverdueMinutes;
  }

  const minutes = Number(configuredValue);
  if (
    !Number.isSafeInteger(minutes) ||
    minutes < 2 ||
    minutes > maximumScheduledWorkerOverdueMinutes
  ) {
    throw new Error(
      'SCHEDULED_WORKER_OVERDUE_MINUTES must be an integer between 2 and 1440.'
    );
  }

  return minutes;
};

export type DeliveryHealthWorkerRun = {
  completedAt: string;
  durationMilliseconds: number;
  outcome: 'succeeded' | 'completed-with-isolated-errors' | 'failed';
  failureClassification: ScheduledDailySummaryWorkerFailureClassification | null;
  counts: ScheduledDailySummaryWorkerCounts;
};

export type DeliveryHealthWindow = {
  key: '24-hours' | '7-days';
  label: 'Last 24 hours' | 'Last 7 days';
  totals: {
    sent: number;
    retrying: number;
    failed: number;
    activeProcessing: number;
    expiredProcessing: number;
  };
  failureClassifications: Array<{
    classification: DeliveryErrorClassification;
    count: number;
  }>;
};

export type DeliveryHealth = {
  timeBasis: 'UTC';
  worker: {
    status: 'healthy' | 'overdue' | 'missing';
    overdueThresholdMinutes: number;
    latestRun: DeliveryHealthWorkerRun | null;
  };
  windows: DeliveryHealthWindow[];
};

const workerFailureClassification = (
  value: string | null
): ScheduledDailySummaryWorkerFailureClassification | null => {
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

const deliveryFailureClassification = (value: string): DeliveryErrorClassification => {
  if (deliveryErrorClassifications.includes(value as DeliveryErrorClassification)) {
    return value as DeliveryErrorClassification;
  }
  throw new Error('Delivery Record has an unknown failure classification.');
};

const healthWorkerRun = (
  row: typeof scheduledWorkerRuns.$inferSelect | undefined
): DeliveryHealthWorkerRun | null =>
  row
    ? {
        completedAt: row.completedAt,
        durationMilliseconds: row.durationMilliseconds,
        outcome: row.outcome,
        failureClassification: workerFailureClassification(row.failureClassification),
        counts: {
          due: row.dueCount,
          sent: row.sentCount,
          skipped: row.skippedCount,
          retrying: row.retryingCount,
          failed: row.failedCount,
          isolatedError: row.isolatedErrorCount
        }
      }
    : null;

const recentWindows = [
  { key: '24-hours', label: 'Last 24 hours', milliseconds: 24 * 60 * 60 * 1_000 },
  { key: '7-days', label: 'Last 7 days', milliseconds: 7 * 24 * 60 * 60 * 1_000 }
] as const;

export const createDeliveryHealthStore = (database: DeliveryHealthDatabase) => {
  const loadWindow = async (
    window: (typeof recentWindows)[number],
    now: string
  ): Promise<DeliveryHealthWindow> => {
    const cutoff = new Date(new Date(now).getTime() - window.milliseconds).toISOString();
    const scheduledInWindow = and(
      eq(deliveryRecords.attemptType, 'scheduled'),
      gte(deliveryRecords.requestedAt, cutoff)
    );
    const totals = await database
      .select({
        sent: sql<number>`sum(case when ${deliveryRecords.deliveryStatus} = 'sent' then 1 else 0 end)`.mapWith(
          Number
        ),
        retrying:
          sql<number>`sum(case when ${deliveryRecords.deliveryStatus} = 'retrying' then 1 else 0 end)`.mapWith(
            Number
          ),
        failed:
          sql<number>`sum(case when ${deliveryRecords.deliveryStatus} = 'failed' then 1 else 0 end)`.mapWith(
            Number
          ),
        activeProcessing:
          sql<number>`sum(case when ${deliveryRecords.deliveryStatus} = 'processing' and ${deliveryRecords.claimExpiresAt} > ${now} then 1 else 0 end)`.mapWith(
            Number
          ),
        expiredProcessing:
          sql<number>`sum(case when ${deliveryRecords.deliveryStatus} = 'processing' and (${deliveryRecords.claimExpiresAt} is null or ${deliveryRecords.claimExpiresAt} <= ${now}) then 1 else 0 end)`.mapWith(
            Number
          )
      })
      .from(deliveryRecords)
      .where(scheduledInWindow)
      .get();

    const stableClassification = sql<string>`coalesce(${deliveryRecords.errorClassification}, 'unexpected')`;
    const failureClassifications = await database
      .select({
        classification: stableClassification,
        count: sql<number>`count(*)`.mapWith(Number)
      })
      .from(deliveryRecords)
      .where(
        and(
          scheduledInWindow,
          inArray(deliveryRecords.deliveryStatus, ['retrying', 'failed'])
        )
      )
      .groupBy(stableClassification)
      .orderBy(desc(sql`count(*)`), asc(stableClassification));

    return {
      key: window.key,
      label: window.label,
      totals: totals ?? {
        sent: 0,
        retrying: 0,
        failed: 0,
        activeProcessing: 0,
        expiredProcessing: 0
      },
      failureClassifications: failureClassifications.map(({ classification, count }) => ({
        classification: deliveryFailureClassification(classification),
        count
      }))
    };
  };

  return {
    async load({
      now,
      overdueThresholdMinutes
    }: {
      now: string;
      overdueThresholdMinutes: number;
    }): Promise<DeliveryHealth> {
      const latestRunRows = await database
        .select()
        .from(scheduledWorkerRuns)
        .orderBy(desc(scheduledWorkerRuns.completedAt))
        .limit(1);
      const latestSuccessfulRunRows = await database
        .select({ completedAt: scheduledWorkerRuns.completedAt })
        .from(scheduledWorkerRuns)
        .where(
          inArray(scheduledWorkerRuns.outcome, ['succeeded', 'completed-with-isolated-errors'])
        )
        .orderBy(desc(scheduledWorkerRuns.completedAt))
        .limit(1);
      const latestSuccessfulCompletedAt = latestSuccessfulRunRows[0]?.completedAt;
      const overdueCutoff = new Date(
        new Date(now).getTime() - overdueThresholdMinutes * 60 * 1_000
      ).toISOString();
      const status = latestSuccessfulCompletedAt
        ? latestSuccessfulCompletedAt < overdueCutoff
          ? 'overdue'
          : 'healthy'
        : 'missing';

      return {
        timeBasis: 'UTC',
        worker: {
          status,
          overdueThresholdMinutes,
          latestRun: healthWorkerRun(latestRunRows[0])
        },
        windows: await Promise.all(recentWindows.map((window) => loadWindow(window, now)))
      };
    }
  };
};

export type DeliveryHealthStore = ReturnType<typeof createDeliveryHealthStore>;
