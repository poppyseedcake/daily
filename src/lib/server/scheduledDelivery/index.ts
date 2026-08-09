import { createHash } from 'node:crypto';
import { dailySummarySubject } from '$lib/dailySummaryRenderer';
import type { DeliveryErrorClassification } from '$lib/deliveryRecords';
import {
  DailySummaryDeliveryError,
  type DailySummaryDeliveryProvider
} from '../dailySummaryDelivery';
import {
  ScheduledDailySummaryUserNotActiveError,
  type ScheduledDailySummaryGenerationResult
} from '../scheduledDailySummaryGeneration';
import {
  createScheduledDeliveryPersistence,
  type ScheduledDeliveryCursor,
  type ScheduledDeliveryDatabase,
  type ScheduledDeliveryWorkDetails
} from './persistence';

const claimDurationMilliseconds = 5 * 60 * 1000;
const retryDelayMilliseconds = 5 * 60 * 1000;
const retryDeadlineMilliseconds = 15 * 60 * 1000;
const maximumAttempts = 3;

export type ScheduledDeliveryWork = Readonly<{
  opaqueId: string;
}>;

export type ScheduledDeliveryOutcome =
  | { outcome: 'sent' }
  | {
      outcome: 'retrying';
      errorClassification?: DeliveryErrorClassification;
    }
  | {
      outcome: 'skipped';
      errorClassification?: DeliveryErrorClassification;
    }
  | {
      outcome: 'failed';
      errorClassification: DeliveryErrorClassification;
    };

export type ScheduledDeliveryModule = {
  loadDueBatch(query: {
    eligibleAt: string;
    limit: number;
    after: string | null;
  }): Promise<{
    work: ScheduledDeliveryWork[];
    nextCursor: string | null;
  }>;
  process(work: ScheduledDeliveryWork): Promise<ScheduledDeliveryOutcome>;
};

type ScheduledDeliveryGenerator = {
  generate(userId: string): Promise<ScheduledDailySummaryGenerationResult>;
};

export type ScheduledDeliveryDependencies = {
  database: ScheduledDeliveryDatabase;
  generator: ScheduledDeliveryGenerator;
  deliveryProvider: DailySummaryDeliveryProvider;
  providerName: string;
  senderAddress: () => string;
  now?: () => Date;
};

const occurrenceIdempotencyKey = (work: ScheduledDeliveryWorkDetails) => {
  const digest = createHash('sha256')
    .update('scheduled-daily-summary\0')
    .update(work.userId)
    .update('\0')
    .update(work.scheduledAt)
    .digest('hex');

  return `daily-summary/${digest}`;
};

const opaqueWorkId = (work: ScheduledDeliveryWorkDetails) =>
  createHash('sha256')
    .update('scheduled-daily-summary-worker\0')
    .update(work.userId)
    .update('\0')
    .update(work.scheduledAt)
    .digest('hex')
    .slice(0, 16);

const encodeCursor = (cursor: ScheduledDeliveryCursor) =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

const decodeCursor = (cursor: string | null): ScheduledDeliveryCursor | null => {
  if (!cursor) return null;

  const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('scheduledAt' in parsed) ||
    typeof parsed.scheduledAt !== 'string' ||
    !('workId' in parsed) ||
    typeof parsed.workId !== 'string'
  ) {
    throw new Error('Invalid Scheduled Delivery cursor.');
  }

  return { scheduledAt: parsed.scheduledAt, workId: parsed.workId };
};

export const createScheduledDelivery = ({
  database,
  generator,
  deliveryProvider,
  providerName,
  senderAddress,
  now = () => new Date()
}: ScheduledDeliveryDependencies): ScheduledDeliveryModule => {
  const persistence = createScheduledDeliveryPersistence(database);
  const workDetails = new WeakMap<ScheduledDeliveryWork, ScheduledDeliveryWorkDetails>();

  return {
    async loadDueBatch({ eligibleAt, limit, after }) {
      const due = await persistence.loadDueBatch({
        eligibleAt,
        limit,
        after: decodeCursor(after)
      });
      const work = due.map((details) => {
        const handle: ScheduledDeliveryWork = Object.freeze({
          opaqueId: opaqueWorkId(details)
        });
        workDetails.set(handle, details);
        return handle;
      });
      const last = due.at(-1);

      return {
        work,
        nextCursor: last
          ? encodeCursor({ scheduledAt: last.scheduledAt, workId: last.workId })
          : null
      };
    },

    async process(work) {
      const details = workDetails.get(work);
      if (!details) throw new Error('Scheduled Delivery work does not belong to this module.');

      const processingStartedAt = now();
      const processingStartedAtIso = processingStartedAt.toISOString();
      const claimed = persistence.claim({
        work: details,
        claimedAt: processingStartedAtIso,
        claimExpiresAt: new Date(
          processingStartedAt.getTime() + claimDurationMilliseconds
        ).toISOString(),
        providerName,
        maximumAttempts,
        retryDeadlineMilliseconds
      });

      if (claimed.outcome === 'skipped') return claimed;
      if (claimed.outcome === 'failed') return claimed;

      const { claim } = claimed;
      let generated: ScheduledDailySummaryGenerationResult;
      try {
        generated = await generator.generate(claim.userId);
      } catch (error) {
        if (error instanceof ScheduledDailySummaryUserNotActiveError) {
          await persistence.markCancelled(claim, processingStartedAtIso);
          return {
            outcome: 'skipped',
            errorClassification: 'summary-delivery-disabled'
          };
        }
        await persistence.markUnexpected(claim).catch(() => undefined);
        throw error;
      }

      const submission = persistence.beginSubmission(claim, processingStartedAtIso, () =>
        deliveryProvider.send({
          to: claim.summaryRecipient,
          from: senderAddress(),
          subject: dailySummarySubject(
            'scheduled',
            generated.input.generatedAt ?? processingStartedAt,
            generated.input.configuration.userTimeZone
          ),
          html: generated.rendered.html,
          text: generated.rendered.text,
          idempotencyKey: occurrenceIdempotencyKey(details)
        })
      );
      if (submission.outcome === 'skipped') return submission;

      let accepted: Awaited<ReturnType<DailySummaryDeliveryProvider['send']>>;
      try {
        accepted = await submission.submission;
      } catch (error) {
        if (!(error instanceof DailySummaryDeliveryError)) {
          await persistence.markUnexpected(claim).catch(() => undefined);
          throw error;
        }

        if (error.classification !== 'provider-unavailable') {
          const failed = await persistence.markFailed(claim, {
            completedAt: processingStartedAtIso,
            providerMessageId: null,
            providerStatusMetadata: error.providerStatusMetadata,
            errorClassification: error.classification
          });
          return failed
            ? { outcome: 'failed', errorClassification: error.classification }
            : { outcome: 'skipped' };
        }

        if (claim.record.attemptCount >= maximumAttempts) {
          const failed = await persistence.markFailed(claim, {
            completedAt: processingStartedAtIso,
            providerMessageId: null,
            providerStatusMetadata: error.providerStatusMetadata,
            errorClassification: 'retry-exhausted'
          });
          return failed
            ? { outcome: 'failed', errorClassification: 'retry-exhausted' }
            : { outcome: 'skipped' };
        }

        const retrying = persistence.retryOrCancel(claim, {
          attemptedAt: processingStartedAtIso,
          nextRetryAt: new Date(
            processingStartedAt.getTime() + retryDelayMilliseconds
          ).toISOString(),
          providerStatusMetadata: error.providerStatusMetadata,
          errorClassification: error.classification
        });
        if (!retrying) return { outcome: 'skipped' };
        if (retrying.deliveryStatus === 'cancelled') {
          return {
            outcome: 'skipped',
            errorClassification: 'summary-delivery-disabled'
          };
        }
        return {
          outcome: 'retrying',
          errorClassification: error.classification
        };
      }

      if (!accepted.providerMessageId) {
        const failed = await persistence.markFailed(claim, {
          completedAt: processingStartedAtIso,
          providerMessageId: null,
          providerStatusMetadata: accepted.providerStatusMetadata,
          errorClassification: 'provider-missing-message-id'
        });
        return failed
          ? {
              outcome: 'failed',
              errorClassification: 'provider-missing-message-id'
            }
          : { outcome: 'skipped' };
      }

      const sent = await persistence.markSent(claim, {
        completedAt: processingStartedAtIso,
        providerMessageId: accepted.providerMessageId,
        providerStatusMetadata: accepted.providerStatusMetadata
      });
      return sent ? { outcome: 'sent' } : { outcome: 'skipped' };
    }
  };
};
