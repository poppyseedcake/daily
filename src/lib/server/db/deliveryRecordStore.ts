import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { DeliveryRecord, DeliveryRecordInput } from '$lib/deliveryRecords';
import { deliveryRecords } from './schema';

type DeliveryRecordDatabase = typeof db;

const recentDeliveryRecordCutoff = (now: string) => {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);

  return cutoff.toISOString();
};

const safeProviderStatusMetadataPattern = /^[a-zA-Z0-9][a-zA-Z0-9 ._=-]{0,119}$/;

const privateProviderStatusMetadataPattern =
  /[{}<>@]|\b(html|text|token|secret|payload|calendar|todo|route|origin|destination)\b/i;

const privacyPreservingProviderStatusMetadata = (metadata: string | null) => {
  if (!metadata) {
    return null;
  }

  if (
    metadata.length > 120 ||
    privateProviderStatusMetadataPattern.test(metadata) ||
    !safeProviderStatusMetadataPattern.test(metadata)
  ) {
    return 'redacted';
  }

  return metadata;
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
        id: record.id ?? crypto.randomUUID(),
        userId
      })
      .run();
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
