import { createHash } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { calculateNextSummaryAt } from '$lib/nextSummarySchedule';
import {
  DailySummaryDeliveryError,
  type DailySummaryDeliveryProvider
} from './dailySummaryDelivery';
import type { ScheduledDailySummaryGenerationResult } from './scheduledDailySummaryGeneration';
import type { DeliveryErrorClassification, DeliveryRecord } from '$lib/deliveryRecords';
import type { DueScheduledDailySummaryOccurrence } from './db/scheduledDailySummaryOccurrenceStore';

const processingClaimDurationMilliseconds = 5 * 60 * 1000;
const retryDelayMilliseconds = 5 * 60 * 1000;
const retryDeadlineMilliseconds = 15 * 60 * 1000;

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
  markScheduledStale(recordId: string, completedAt: string): Promise<DeliveryRecord | null>;
  markScheduledRetrying(
    recordId: string,
    retry: {
      attemptCount: number;
      attemptedAt: string;
      nextRetryAt: string;
      providerStatusMetadata: string | null;
      errorClassification: DeliveryErrorClassification;
    }
  ): Promise<DeliveryRecord | null>;
  markScheduledSent(
    recordId: string,
    sent: {
      attemptCount: number;
      completedAt: string;
      providerMessageId: string;
      providerStatusMetadata: string | null;
    }
  ): Promise<DeliveryRecord | null>;
  markScheduledFailed(
    recordId: string,
    failed: {
      attemptCount: number;
      completedAt: string;
      providerMessageId: string | null;
      providerStatusMetadata: string | null;
      errorClassification: DeliveryErrorClassification;
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

    const retryDeadline = new Date(occurrence.scheduledAt).getTime() + retryDeadlineMilliseconds;
    if (processingStartedAt.getTime() > retryDeadline) {
      const existing = await deliveryRecordStore.loadScheduledOccurrence(
        occurrence.userId,
        occurrence.scheduledAt
      );

      if (
        existing &&
        (existing.deliveryStatus === 'processing' || existing.deliveryStatus === 'retrying')
      ) {
        const failed = await deliveryRecordStore.markScheduledStale(
          existing.id,
          processingStartedAtIso
        );

        if (!failed) {
          return { outcome: 'claim-lost' as const, occurrenceId: existing.id };
        }

        return { outcome: 'stale-occurrence' as const, occurrenceId: failed.id };
      }
    }

    const generated = await generator.generate(occurrence.userId);
    const nextSummaryAt =
      calculateNextSummaryAt(
        generated.input.configuration,
        Temporal.Instant.from(processingStartedAtIso)
      )?.toString() ?? null;

    if (!generated.hasQualifyingContent) {
      await occurrenceStore.advance(occurrence.userId, occurrence.scheduledAt, nextSummaryAt);
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
    if (!claim) {
      const existing = await deliveryRecordStore.loadScheduledOccurrence(
        occurrence.userId,
        occurrence.scheduledAt
      );

      if (
        existing &&
        (existing.deliveryStatus === 'sent' || existing.deliveryStatus === 'failed')
      ) {
        await occurrenceStore.advance(occurrence.userId, occurrence.scheduledAt, nextSummaryAt);
        return { outcome: 'already-processed' as const, occurrenceId: existing.id };
      }

      if (existing?.deliveryStatus === 'retrying') {
        return { outcome: 'retry-pending' as const, occurrenceId: existing.id };
      }

      return { outcome: 'already-claimed' as const };
    }

    await occurrenceStore.advance(occurrence.userId, occurrence.scheduledAt, nextSummaryAt);

    let accepted;
    try {
      accepted = await deliveryProvider.send({
        to: occurrence.summaryRecipient,
        from: senderAddress(),
        subject: 'Daily Summary',
        html: generated.rendered.html,
        text: generated.rendered.text,
        idempotencyKey: occurrenceIdempotencyKey(occurrence)
      });
    } catch (error) {
      if (!(error instanceof DailySummaryDeliveryError)) {
        throw error;
      }

      const attemptCount = claim.attemptCount ?? 1;
      if (error.classification !== 'provider-unavailable') {
        const failed = await deliveryRecordStore.markScheduledFailed(claim.id, {
          attemptCount,
          completedAt: processingStartedAtIso,
          providerMessageId: null,
          providerStatusMetadata: error.providerStatusMetadata,
          errorClassification: error.classification
        });

        if (!failed) {
          return { outcome: 'claim-lost' as const, occurrenceId: claim.id };
        }

        return {
          outcome: 'delivery-failed' as const,
          occurrenceId: failed.id,
          errorClassification: error.classification
        };
      }

      if (attemptCount >= 3) {
        const failed = await deliveryRecordStore.markScheduledFailed(claim.id, {
          attemptCount,
          completedAt: processingStartedAtIso,
          providerMessageId: null,
          providerStatusMetadata: error.providerStatusMetadata,
          errorClassification: 'retry-exhausted'
        });

        if (!failed) {
          return { outcome: 'claim-lost' as const, occurrenceId: claim.id };
        }

        return { outcome: 'retry-exhausted' as const, occurrenceId: failed.id };
      }

      const nextRetryAt = new Date(
        processingStartedAt.getTime() + retryDelayMilliseconds
      ).toISOString();
      const retrying = await deliveryRecordStore.markScheduledRetrying(claim.id, {
        attemptCount,
        attemptedAt: processingStartedAtIso,
        nextRetryAt,
        providerStatusMetadata: error.providerStatusMetadata,
        errorClassification: error.classification
      });

      if (!retrying) {
        return { outcome: 'claim-lost' as const, occurrenceId: claim.id };
      }

      return { outcome: 'retry-scheduled' as const, occurrenceId: retrying.id, nextRetryAt };
    }

    if (!accepted.providerMessageId) {
      const failed = await deliveryRecordStore.markScheduledFailed(claim.id, {
        attemptCount: claim.attemptCount ?? 1,
        completedAt: processingStartedAtIso,
        providerMessageId: null,
        providerStatusMetadata: accepted.providerStatusMetadata,
        errorClassification: 'provider-missing-message-id'
      });

      if (!failed) {
        return { outcome: 'claim-lost' as const, occurrenceId: claim.id };
      }

      return { outcome: 'provider-missing-message-id' as const, occurrenceId: failed.id };
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
