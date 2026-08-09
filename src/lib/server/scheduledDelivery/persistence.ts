import { and, asc, eq, isNotNull, lte, or, sql, type SQLWrapper } from 'drizzle-orm';
import { Temporal } from '@js-temporal/polyfill';
import { calculateNextSummaryAt } from '$lib/nextSummarySchedule';
import {
  defaultSummaryConfiguration,
  type SummaryConfiguration
} from '$lib/summaryConfiguration';
import type { DeliveryErrorClassification, DeliveryRecord } from '$lib/deliveryRecords';
import { summaryConfigurationFromFlat } from '../summaryConfigurationPersistence';
import { privacyPreservingProviderStatusMetadata } from '../deliveryProviderStatusMetadata';
import type { db } from '../db';
import { deliveryRecords, summaryConfigurations, users } from '../db/schema';

export type ScheduledDeliveryDatabase = typeof db;

export type ScheduledDeliveryCursor = {
  scheduledAt: string;
  workId: string;
};

export type ScheduledDeliveryWorkDetails = ScheduledDeliveryCursor & {
  userId: string;
};

export type ScheduledDeliveryClaim = {
  record: DeliveryRecord & { attemptCount: number; scheduledAt: string };
  userId: string;
  summaryRecipient: string;
};

export type ClaimScheduledDeliveryResult =
  | { outcome: 'claimed'; claim: ScheduledDeliveryClaim }
  | {
      outcome: 'skipped';
      errorClassification?: DeliveryErrorClassification;
    }
  | {
      outcome: 'failed';
      errorClassification: Extract<
        DeliveryErrorClassification,
        'retry-exhausted' | 'stale-occurrence'
      >;
    };

const withoutUserId = ({ userId: _userId, ...record }: typeof deliveryRecords.$inferSelect) =>
  record;

const firstDeliveryRecord = (rows: Array<typeof deliveryRecords.$inferSelect>) =>
  rows[0] ? withoutUserId(rows[0]) : null;

const afterCursorCondition = (
  scheduledAt: SQLWrapper,
  workId: SQLWrapper,
  after: ScheduledDeliveryCursor | null
) =>
  after
    ? sql`(
        julianday(${scheduledAt}) > julianday(${after.scheduledAt})
        or (
          julianday(${scheduledAt}) = julianday(${after.scheduledAt})
          and ${workId} > ${after.workId}
        )
      )`
    : undefined;

const summaryConfigurationFor = (
  row: typeof summaryConfigurations.$inferSelect | undefined
): SummaryConfiguration => (row ? summaryConfigurationFromFlat(row) : defaultSummaryConfiguration);

export const createScheduledDeliveryPersistence = (database: ScheduledDeliveryDatabase) => ({
  async loadDueBatch({
    eligibleAt,
    limit,
    after
  }: {
    eligibleAt: string;
    limit: number;
    after: ScheduledDeliveryCursor | null;
  }): Promise<ScheduledDeliveryWorkDetails[]> {
    const recoverableScheduledAt = deliveryRecords.scheduledAt;
    const recoverableWorkId = sql<string>`'retry:' || ${deliveryRecords.id}`;
    const recoverable = await database
      .select({
        userId: users.id,
        scheduledAt: recoverableScheduledAt,
        workId: recoverableWorkId
      })
      .from(deliveryRecords)
      .innerJoin(users, eq(users.id, deliveryRecords.userId))
      .where(
        and(
          eq(deliveryRecords.attemptType, 'scheduled'),
          eq(users.lifecycleState, 'active'),
          isNotNull(deliveryRecords.scheduledAt),
          or(
            and(
              eq(deliveryRecords.deliveryStatus, 'processing'),
              isNotNull(deliveryRecords.claimExpiresAt),
              sql`julianday(${deliveryRecords.claimExpiresAt}) <= julianday(${eligibleAt})`
            ),
            and(
              eq(deliveryRecords.deliveryStatus, 'retrying'),
              isNotNull(deliveryRecords.nextRetryAt),
              sql`julianday(${deliveryRecords.nextRetryAt}) <= julianday(${eligibleAt})`
            )
          ),
          afterCursorCondition(recoverableScheduledAt, recoverableWorkId, after)
        )
      )
      .orderBy(asc(sql`julianday(${recoverableScheduledAt})`), asc(recoverableWorkId))
      .limit(limit);

    const newScheduledAt = users.nextSummaryAt;
    const newWorkId = sql<string>`'new:' || ${users.id}`;
    const newlyDue = await database
      .select({
        userId: users.id,
        scheduledAt: newScheduledAt,
        workId: newWorkId
      })
      .from(users)
      .where(
        and(
          isNotNull(newScheduledAt),
          eq(users.lifecycleState, 'active'),
          sql`julianday(${newScheduledAt}) <= julianday(${eligibleAt})`,
          afterCursorCondition(newScheduledAt, newWorkId, after)
        )
      )
      .orderBy(asc(sql`julianday(${newScheduledAt})`), asc(newWorkId))
      .limit(limit);

    return [...recoverable, ...newlyDue]
      .flatMap((work) =>
        work.scheduledAt ? [{ ...work, scheduledAt: work.scheduledAt }] : []
      )
      .sort(
        (left, right) =>
          new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime() ||
          (left.workId < right.workId ? -1 : left.workId > right.workId ? 1 : 0)
      )
      .slice(0, limit);
  },

  claim({
    work,
    claimedAt,
    claimExpiresAt,
    providerName,
    maximumAttempts,
    retryDeadlineMilliseconds
  }: {
    work: ScheduledDeliveryWorkDetails;
    claimedAt: string;
    claimExpiresAt: string;
    providerName: string;
    maximumAttempts: number;
    retryDeadlineMilliseconds: number;
  }): ClaimScheduledDeliveryResult {
    return database.transaction((transaction) => {
      const user = transaction
        .select({
          id: users.id,
          email: users.email,
          nextSummaryAt: users.nextSummaryAt,
          lifecycleState: users.lifecycleState
        })
        .from(users)
        .where(eq(users.id, work.userId))
        .get();
      const configurationRow = transaction
        .select()
        .from(summaryConfigurations)
        .where(eq(summaryConfigurations.userId, work.userId))
        .get();
      const existingRow = transaction
        .select()
        .from(deliveryRecords)
        .where(
          and(
            eq(deliveryRecords.userId, work.userId),
            eq(deliveryRecords.attemptType, 'scheduled'),
            eq(deliveryRecords.scheduledAt, work.scheduledAt)
          )
        )
        .get();

      if (!user || user.lifecycleState !== 'active') {
        return { outcome: 'skipped' };
      }

      const configuration = summaryConfigurationFor(configurationRow);
      if (!configuration.summaryDeliveryEnabled) {
        if (
          existingRow &&
          (existingRow.deliveryStatus === 'processing' ||
            existingRow.deliveryStatus === 'retrying')
        ) {
          transaction
            .update(deliveryRecords)
            .set({
              deliveryStatus: 'cancelled',
              completedAt: claimedAt,
              nextRetryAt: null,
              claimExpiresAt: null,
              errorClassification: 'summary-delivery-disabled'
            })
            .where(eq(deliveryRecords.id, existingRow.id))
            .run();
        }
        transaction
          .update(users)
          .set({ nextSummaryAt: null })
          .where(eq(users.id, work.userId))
          .run();
        return {
          outcome: 'skipped',
          errorClassification: 'summary-delivery-disabled'
        };
      }

      if (
        existingRow &&
        (existingRow.deliveryStatus === 'sent' ||
          existingRow.deliveryStatus === 'failed' ||
          existingRow.deliveryStatus === 'cancelled')
      ) {
        return { outcome: 'skipped' };
      }

      if (existingRow) {
        const attemptCount = existingRow.attemptCount;
        const availableAt =
          existingRow.deliveryStatus === 'processing'
            ? existingRow.claimExpiresAt
            : existingRow.deliveryStatus === 'retrying'
              ? existingRow.nextRetryAt
              : null;
        if (
          attemptCount === null ||
          availableAt === null ||
          new Date(availableAt).getTime() > new Date(claimedAt).getTime()
        ) {
          return { outcome: 'skipped' };
        }

        const errorClassification =
          attemptCount >= maximumAttempts
            ? ('retry-exhausted' as const)
            : new Date(claimedAt).getTime() >
                new Date(work.scheduledAt).getTime() + retryDeadlineMilliseconds
              ? ('stale-occurrence' as const)
              : null;

        if (errorClassification) {
          const failed = transaction
            .update(deliveryRecords)
            .set({
              deliveryStatus: 'failed',
              completedAt: claimedAt,
              nextRetryAt: null,
              claimExpiresAt: null,
              providerMessageId: null,
              errorClassification
            })
            .where(
              and(
                eq(deliveryRecords.id, existingRow.id),
                eq(deliveryRecords.attemptType, 'scheduled'),
                eq(deliveryRecords.deliveryStatus, existingRow.deliveryStatus),
                eq(deliveryRecords.attemptCount, attemptCount),
                existingRow.deliveryStatus === 'processing'
                  ? sql`julianday(${deliveryRecords.claimExpiresAt}) <= julianday(${claimedAt})`
                  : sql`julianday(${deliveryRecords.nextRetryAt}) <= julianday(${claimedAt})`
              )
            )
            .returning({ id: deliveryRecords.id })
            .get();
          return failed
            ? { outcome: 'failed', errorClassification }
            : { outcome: 'skipped' };
        }
      } else if (user.nextSummaryAt !== work.scheduledAt) {
        return { outcome: 'skipped' };
      }

      const rows = transaction
        .insert(deliveryRecords)
        .values({
          id: crypto.randomUUID(),
          userId: work.userId,
          attemptType: 'scheduled',
          requestedAt: work.scheduledAt,
          completedAt: null,
          deliveryStatus: 'processing',
          providerName,
          providerMessageId: null,
          providerStatusMetadata: null,
          errorClassification: null,
          scheduledAt: work.scheduledAt,
          attemptCount: 1,
          lastAttemptAt: claimedAt,
          nextRetryAt: null,
          claimExpiresAt
        })
        .onConflictDoUpdate({
          target: [deliveryRecords.userId, deliveryRecords.scheduledAt],
          targetWhere: sql.raw("attempt_type = 'scheduled'"),
          set: {
            deliveryStatus: 'processing',
            providerName,
            providerStatusMetadata: null,
            errorClassification: null,
            attemptCount: sql.raw('coalesce(attempt_count, 0) + 1'),
            lastAttemptAt: claimedAt,
            nextRetryAt: null,
            claimExpiresAt
          },
          setWhere: or(
            and(
              eq(deliveryRecords.deliveryStatus, 'processing'),
              lte(deliveryRecords.claimExpiresAt, claimedAt)
            ),
            and(
              eq(deliveryRecords.deliveryStatus, 'retrying'),
              lte(deliveryRecords.nextRetryAt, claimedAt)
            )
          )
        })
        .returning()
        .all();
      const record = firstDeliveryRecord(rows);
      if (!record) return { outcome: 'skipped' };
      if (record.attemptCount === null || record.scheduledAt === null) {
        throw new Error('Scheduled Delivery claim has incomplete persistence metadata.');
      }
      const claimedRecord = {
        ...record,
        attemptCount: record.attemptCount,
        scheduledAt: record.scheduledAt
      };

      if (user.nextSummaryAt === work.scheduledAt) {
        const nextSummaryAt =
          calculateNextSummaryAt(configuration, Temporal.Instant.from(claimedAt))?.toString() ??
          null;
        transaction
          .update(users)
          .set({ nextSummaryAt })
          .where(
            and(
              eq(users.id, work.userId),
              eq(users.lifecycleState, 'active'),
              eq(users.nextSummaryAt, work.scheduledAt)
            )
          )
          .run();
      }

      return {
        outcome: 'claimed',
        claim: {
          record: claimedRecord,
          userId: work.userId,
          summaryRecipient: user.email
        }
      };
    });
  },

  beginSubmission<T>(
    claim: ScheduledDeliveryClaim,
    submissionStartedAt: string,
    submit: () => Promise<T>
  ):
    | { outcome: 'began'; submission: Promise<T> }
    | { outcome: 'skipped'; errorClassification?: DeliveryErrorClassification } {
    let submission: Promise<T> | null = null;
    const gate = database.transaction((transaction) => {
      const eligibility = transaction
        .select({
          lifecycleState: users.lifecycleState,
          summaryDeliveryEnabled: summaryConfigurations.summaryDeliveryEnabled
        })
        .from(users)
        .leftJoin(summaryConfigurations, eq(summaryConfigurations.userId, users.id))
        .where(eq(users.id, claim.userId))
        .get();

      if (
        !eligibility ||
        eligibility.lifecycleState !== 'active' ||
        eligibility.summaryDeliveryEnabled === false
      ) {
        transaction
          .update(deliveryRecords)
          .set({
            deliveryStatus: 'cancelled',
            completedAt: submissionStartedAt,
            nextRetryAt: null,
            claimExpiresAt: null,
            errorClassification: 'summary-delivery-disabled'
          })
          .where(
            and(
              eq(deliveryRecords.id, claim.record.id),
              eq(deliveryRecords.deliveryStatus, 'processing'),
              eq(deliveryRecords.attemptCount, claim.record.attemptCount)
            )
          )
          .run();
        return 'ineligible' as const;
      }

      const activeClaim = transaction
        .select({ id: deliveryRecords.id })
        .from(deliveryRecords)
        .where(
          and(
            eq(deliveryRecords.id, claim.record.id),
            eq(deliveryRecords.attemptType, 'scheduled'),
            eq(deliveryRecords.deliveryStatus, 'processing'),
            eq(deliveryRecords.attemptCount, claim.record.attemptCount),
            sql`julianday(${deliveryRecords.claimExpiresAt}) > julianday(${submissionStartedAt})`
          )
        )
        .get();
      if (!activeClaim) {
        return 'stale' as const;
      }

      submission = submit();
      return 'began' as const;
    });

    return gate === 'began' && submission
      ? { outcome: 'began', submission }
      : {
          outcome: 'skipped',
          ...(gate === 'ineligible'
            ? { errorClassification: 'summary-delivery-disabled' as const }
            : {})
        };
  },

  async markUnexpected(claim: ScheduledDeliveryClaim) {
    await database
      .update(deliveryRecords)
      .set({ providerStatusMetadata: null, errorClassification: 'unexpected' })
      .where(
        and(
          eq(deliveryRecords.id, claim.record.id),
          eq(deliveryRecords.deliveryStatus, 'processing'),
          eq(deliveryRecords.attemptCount, claim.record.attemptCount)
        )
      );
  },

  async markCancelled(claim: ScheduledDeliveryClaim, completedAt: string) {
    const rows = await database
      .update(deliveryRecords)
      .set({
        deliveryStatus: 'cancelled',
        completedAt,
        nextRetryAt: null,
        claimExpiresAt: null,
        errorClassification: 'summary-delivery-disabled'
      })
      .where(
        and(
          eq(deliveryRecords.id, claim.record.id),
          eq(deliveryRecords.deliveryStatus, 'processing'),
          eq(deliveryRecords.attemptCount, claim.record.attemptCount)
        )
      )
      .returning();
    return firstDeliveryRecord(rows);
  },

  async markSent(
    claim: ScheduledDeliveryClaim,
    sent: {
      completedAt: string;
      providerMessageId: string;
      providerStatusMetadata: string | null;
    }
  ) {
    const rows = await database
      .update(deliveryRecords)
      .set({
        deliveryStatus: 'sent',
        completedAt: sent.completedAt,
        nextRetryAt: null,
        claimExpiresAt: null,
        providerMessageId: sent.providerMessageId,
        providerStatusMetadata: privacyPreservingProviderStatusMetadata(
          sent.providerStatusMetadata
        ),
        errorClassification: null
      })
      .where(
        and(
          eq(deliveryRecords.id, claim.record.id),
          eq(deliveryRecords.deliveryStatus, 'processing'),
          eq(deliveryRecords.attemptCount, claim.record.attemptCount)
        )
      )
      .returning();
    return firstDeliveryRecord(rows);
  },

  async markFailed(
    claim: ScheduledDeliveryClaim,
    failed: {
      completedAt: string;
      providerMessageId: string | null;
      providerStatusMetadata: string | null;
      errorClassification: DeliveryErrorClassification;
    }
  ) {
    const rows = await database
      .update(deliveryRecords)
      .set({
        deliveryStatus: 'failed',
        completedAt: failed.completedAt,
        nextRetryAt: null,
        claimExpiresAt: null,
        providerMessageId: failed.providerMessageId,
        providerStatusMetadata: privacyPreservingProviderStatusMetadata(
          failed.providerStatusMetadata
        ),
        errorClassification: failed.errorClassification
      })
      .where(
        and(
          eq(deliveryRecords.id, claim.record.id),
          eq(deliveryRecords.deliveryStatus, 'processing'),
          eq(deliveryRecords.attemptCount, claim.record.attemptCount)
        )
      )
      .returning();
    return firstDeliveryRecord(rows);
  },

  retryOrCancel(
    claim: ScheduledDeliveryClaim,
    retry: {
      attemptedAt: string;
      nextRetryAt: string;
      providerStatusMetadata: string | null;
      errorClassification: DeliveryErrorClassification;
    }
  ) {
    return database.transaction((transaction) => {
      const eligibility = transaction
        .select({
          lifecycleState: users.lifecycleState,
          summaryDeliveryEnabled: summaryConfigurations.summaryDeliveryEnabled
        })
        .from(users)
        .leftJoin(summaryConfigurations, eq(summaryConfigurations.userId, users.id))
        .where(eq(users.id, claim.userId))
        .get();
      const cancelled =
        !eligibility ||
        eligibility.lifecycleState !== 'active' ||
        eligibility.summaryDeliveryEnabled === false;
      const rows = transaction
        .update(deliveryRecords)
        .set({
          deliveryStatus: cancelled ? 'cancelled' : 'retrying',
          lastAttemptAt: retry.attemptedAt,
          completedAt: cancelled ? retry.attemptedAt : null,
          nextRetryAt: cancelled ? null : retry.nextRetryAt,
          claimExpiresAt: null,
          providerStatusMetadata: privacyPreservingProviderStatusMetadata(
            retry.providerStatusMetadata
          ),
          errorClassification: cancelled
            ? 'summary-delivery-disabled'
            : retry.errorClassification
        })
        .where(
          and(
            eq(deliveryRecords.id, claim.record.id),
            eq(deliveryRecords.deliveryStatus, 'processing'),
            eq(deliveryRecords.attemptCount, claim.record.attemptCount)
          )
        )
        .returning()
        .all();
      return firstDeliveryRecord(rows);
    });
  }
});
