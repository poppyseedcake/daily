import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type {
  DeliveryRecord,
  DeliveryRecordInput,
  ScheduledDeliveryClaim,
  ScheduledDeliveryFailed,
  ScheduledDeliveryRetry,
  ScheduledDeliverySent,
  ScheduledDeliveryUnclaimedFailure
} from '$lib/deliveryRecords';
import { deliveryRecords } from './schema';

type DeliveryRecordDatabase = typeof db;

const recentDeliveryRecordCutoff = (now: string) => {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);

  return cutoff.toISOString();
};

const safeProviderStatusMetadataPatterns = [
  /^accepted(?: by provider)?(?:; missing message id)?$/,
  /^missing (?:message id|RESEND_API_KEY|RESEND_FROM_EMAIL)$/,
  /^status=[1-5][0-9]{2}$/,
  /^rate limited$/,
  /^temporarily unavailable$/
];

const privacyPreservingProviderStatusMetadata = (metadata: string | null) => {
  if (!metadata) {
    return null;
  }

  if (!safeProviderStatusMetadataPatterns.some((pattern) => pattern.test(metadata))) {
    return 'redacted';
  }

  return metadata;
};

const withoutUserId = ({ userId: _userId, ...record }: typeof deliveryRecords.$inferSelect) =>
  record;

const firstDeliveryRecord = (rows: Array<typeof deliveryRecords.$inferSelect>) =>
  rows[0] ? withoutUserId(rows[0]) : null;

export const createDeliveryRecordStore = (database: DeliveryRecordDatabase) => ({
  async recordAttempt(userId: string, record: DeliveryRecordInput) {
    await database
      .insert(deliveryRecords)
      .values({
        ...record,
        providerStatusMetadata: privacyPreservingProviderStatusMetadata(
          record.providerStatusMetadata
        ),
        scheduledAt: null,
        attemptCount: null,
        lastAttemptAt: null,
        nextRetryAt: null,
        claimExpiresAt: null,
        id: record.id ?? crypto.randomUUID(),
        userId
      })
      .run();
  },
  async claimScheduledOccurrence(userId: string, claim: ScheduledDeliveryClaim) {
    const rows = await database
      .insert(deliveryRecords)
      .values({
        id: crypto.randomUUID(),
        userId,
        attemptType: 'scheduled',
        requestedAt: claim.scheduledAt,
        completedAt: null,
        deliveryStatus: 'processing',
        providerName: claim.providerName,
        providerMessageId: null,
        providerStatusMetadata: null,
        errorClassification: null,
        scheduledAt: claim.scheduledAt,
        attemptCount: 1,
        lastAttemptAt: claim.claimedAt,
        nextRetryAt: null,
        claimExpiresAt: claim.claimExpiresAt
      })
      .onConflictDoUpdate({
        target: [deliveryRecords.userId, deliveryRecords.scheduledAt],
        targetWhere: sql.raw("attempt_type = 'scheduled'"),
        set: {
          deliveryStatus: 'processing',
          providerName: claim.providerName,
          providerStatusMetadata: null,
          errorClassification: null,
          attemptCount: sql.raw('coalesce(attempt_count, 0) + 1'),
          lastAttemptAt: claim.claimedAt,
          nextRetryAt: null,
          claimExpiresAt: claim.claimExpiresAt
        },
        setWhere: or(
          and(
            eq(deliveryRecords.deliveryStatus, 'processing'),
            lte(deliveryRecords.claimExpiresAt, claim.claimedAt)
          ),
          and(
            eq(deliveryRecords.deliveryStatus, 'retrying'),
            lte(deliveryRecords.nextRetryAt, claim.claimedAt)
          )
        )
      })
      .returning();

    return firstDeliveryRecord(rows);
  },
  async loadScheduledOccurrence(userId: string, scheduledAt: string) {
    const row = await database.query.deliveryRecords.findFirst({
      where: and(
        eq(deliveryRecords.userId, userId),
        eq(deliveryRecords.attemptType, 'scheduled'),
        eq(deliveryRecords.scheduledAt, scheduledAt)
      )
    });

    return row ? withoutUserId(row) : null;
  },
  async markScheduledRetrying(recordId: string, retry: ScheduledDeliveryRetry) {
    const rows = await database
      .update(deliveryRecords)
      .set({
        deliveryStatus: 'retrying',
        lastAttemptAt: retry.attemptedAt,
        nextRetryAt: retry.nextRetryAt,
        claimExpiresAt: null,
        providerStatusMetadata: privacyPreservingProviderStatusMetadata(
          retry.providerStatusMetadata
        ),
        errorClassification: retry.errorClassification
      })
      .where(
        and(
          eq(deliveryRecords.id, recordId),
          eq(deliveryRecords.attemptType, 'scheduled'),
          eq(deliveryRecords.deliveryStatus, 'processing'),
          eq(deliveryRecords.attemptCount, retry.attemptCount)
        )
      )
      .returning();

    return firstDeliveryRecord(rows);
  },
  async markScheduledUnclaimedFailed(
    recordId: string,
    failure: ScheduledDeliveryUnclaimedFailure
  ) {
    const rows = await database
      .update(deliveryRecords)
      .set({
        deliveryStatus: 'failed',
        completedAt: failure.completedAt,
        nextRetryAt: null,
        claimExpiresAt: null,
        providerMessageId: null,
        errorClassification: failure.errorClassification
      })
      .where(
        and(
          eq(deliveryRecords.id, recordId),
          eq(deliveryRecords.attemptType, 'scheduled'),
          or(
            eq(deliveryRecords.deliveryStatus, 'processing'),
            eq(deliveryRecords.deliveryStatus, 'retrying')
          )
        )
      )
      .returning();

    return firstDeliveryRecord(rows);
  },
  async markScheduledSent(recordId: string, sent: ScheduledDeliverySent) {
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
          eq(deliveryRecords.id, recordId),
          eq(deliveryRecords.attemptType, 'scheduled'),
          eq(deliveryRecords.deliveryStatus, 'processing'),
          eq(deliveryRecords.attemptCount, sent.attemptCount)
        )
      )
      .returning();

    return firstDeliveryRecord(rows);
  },
  async markScheduledFailed(recordId: string, failed: ScheduledDeliveryFailed) {
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
          eq(deliveryRecords.id, recordId),
          eq(deliveryRecords.attemptType, 'scheduled'),
          eq(deliveryRecords.deliveryStatus, 'processing'),
          eq(deliveryRecords.attemptCount, failed.attemptCount)
        )
      )
      .returning();

    return firstDeliveryRecord(rows);
  },
  async loadRecentForUser(userId: string, now: string): Promise<DeliveryRecord[]> {
    return database.query.deliveryRecords.findMany({
      columns: {
        userId: false
      },
      where: and(
        eq(deliveryRecords.userId, userId),
        gte(deliveryRecords.requestedAt, recentDeliveryRecordCutoff(now))
      ),
      orderBy: [desc(deliveryRecords.requestedAt)]
    });
  }
});

export const deliveryRecordStore = createDeliveryRecordStore(db);
