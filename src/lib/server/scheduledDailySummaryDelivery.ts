import { createHash } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { calculateNextSummaryAt } from '$lib/nextSummarySchedule';
import type { DailySummaryDeliveryProvider } from './dailySummaryDelivery';
import type { ScheduledDailySummaryGenerationResult } from './scheduledDailySummaryGeneration';
import type { DeliveryRecord } from '$lib/deliveryRecords';
import type { DueScheduledDailySummaryOccurrence } from './db/scheduledDailySummaryOccurrenceStore';

const processingClaimDurationMilliseconds = 5 * 60 * 1000;

type ScheduledDailySummaryOccurrenceStore = {
  loadNextProcessable(now: string): Promise<DueScheduledDailySummaryOccurrence | null>;
  advance(userId: string, scheduledAt: string, nextSummaryAt: string | null): Promise<boolean>;
};

type ScheduledDailySummaryDeliveryRecordStore = {
  claimScheduledOccurrence(
    userId: string,
    claim: {
      scheduledAt: string;
      claimedAt: string;
      claimExpiresAt: string;
      providerName: string;
    }
  ): Promise<DeliveryRecord | null>;
  loadScheduledOccurrence(userId: string, scheduledAt: string): Promise<DeliveryRecord | null>;
  markScheduledSent(
    recordId: string,
    sent: {
      attemptCount: number;
      completedAt: string;
      providerMessageId: string;
      providerStatusMetadata: string | null;
    }
  ): Promise<DeliveryRecord | null>;
};

type ScheduledDailySummaryGenerator = {
  generate(userId: string): Promise<ScheduledDailySummaryGenerationResult>;
};

export type ScheduledDailySummaryDeliveryDependencies = {
  occurrenceStore: ScheduledDailySummaryOccurrenceStore;
  deliveryRecordStore: ScheduledDailySummaryDeliveryRecordStore;
  generator: ScheduledDailySummaryGenerator;
  deliveryProvider: DailySummaryDeliveryProvider;
  providerName: string;
  senderAddress: () => string;
  now?: () => Date;
};

const occurrenceIdempotencyKey = (occurrence: DueScheduledDailySummaryOccurrence) => {
  const digest = createHash('sha256')
    .update('scheduled-daily-summary\0')
    .update(occurrence.userId)
    .update('\0')
    .update(occurrence.scheduledAt)
    .digest('hex');

  return `daily-summary/${digest}`;
};

export const createScheduledDailySummaryDelivery = ({
  occurrenceStore,
  deliveryRecordStore,
  generator,
  deliveryProvider,
  providerName,
  senderAddress,
  now = () => new Date()
}: ScheduledDailySummaryDeliveryDependencies) => ({
  async processOneDueOccurrence() {
    const processingStartedAt = now();
    const processingStartedAtIso = processingStartedAt.toISOString();
    const occurrence = await occurrenceStore.loadNextProcessable(processingStartedAtIso);

    if (!occurrence) {
      return { outcome: 'none-due' as const };
    }

    const generated = await generator.generate(occurrence.userId);

    if (!generated.hasQualifyingContent) {
      return { outcome: 'not-qualifying' as const };
    }

    const claim = await deliveryRecordStore.claimScheduledOccurrence(occurrence.userId, {
      scheduledAt: occurrence.scheduledAt,
      claimedAt: processingStartedAtIso,
      claimExpiresAt: new Date(
        processingStartedAt.getTime() + processingClaimDurationMilliseconds
      ).toISOString(),
      providerName
    });
    const nextSummaryAt =
      calculateNextSummaryAt(
        generated.input.configuration,
        Temporal.Instant.from(processingStartedAtIso)
      )?.toString() ?? null;

    if (!claim) {
      const existing = await deliveryRecordStore.loadScheduledOccurrence(
        occurrence.userId,
        occurrence.scheduledAt
      );

      if (existing && existing.deliveryStatus !== 'processing') {
        await occurrenceStore.advance(occurrence.userId, occurrence.scheduledAt, nextSummaryAt);
        return { outcome: 'already-processed' as const, occurrenceId: existing.id };
      }

      return { outcome: 'already-claimed' as const };
    }

    await occurrenceStore.advance(occurrence.userId, occurrence.scheduledAt, nextSummaryAt);

    const accepted = await deliveryProvider.send({
      to: occurrence.summaryRecipient,
      from: senderAddress(),
      subject: 'Daily Summary',
      html: generated.rendered.html,
      text: generated.rendered.text,
      idempotencyKey: occurrenceIdempotencyKey(occurrence)
    });

    if (!accepted.providerMessageId) {
      return { outcome: 'provider-missing-message-id' as const, occurrenceId: claim.id };
    }

    const sent = await deliveryRecordStore.markScheduledSent(claim.id, {
      attemptCount: claim.attemptCount ?? 1,
      completedAt: processingStartedAtIso,
      providerMessageId: accepted.providerMessageId,
      providerStatusMetadata: accepted.providerStatusMetadata
    });

    if (!sent) {
      return { outcome: 'claim-lost' as const, occurrenceId: claim.id };
    }

    return { outcome: 'sent' as const, occurrenceId: sent.id };
  }
});
