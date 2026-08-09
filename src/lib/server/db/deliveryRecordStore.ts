import { and, desc, eq, gte } from 'drizzle-orm';
import type { DeliveryRecord, DeliveryRecordInput } from '$lib/deliveryRecords';
import { privacyPreservingProviderStatusMetadata } from '../deliveryProviderStatusMetadata';
import { db } from '$lib/server/db';
import { deliveryRecords } from './schema';

type DeliveryRecordDatabase = typeof db;

const recentDeliveryRecordCutoff = (now: string) => {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  return cutoff.toISOString();
};

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

  async loadRecentForUser(userId: string, now: string): Promise<DeliveryRecord[]> {
    return database.query.deliveryRecords.findMany({
      columns: { userId: false },
      where: and(
        eq(deliveryRecords.userId, userId),
        gte(deliveryRecords.requestedAt, recentDeliveryRecordCutoff(now))
      ),
      orderBy: [desc(deliveryRecords.requestedAt)]
    });
  }
});

export const deliveryRecordStore = createDeliveryRecordStore(db);
