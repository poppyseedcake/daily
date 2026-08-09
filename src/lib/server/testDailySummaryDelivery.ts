import type { DeliveryRecordInput } from '$lib/deliveryRecords';
import { dailySummarySubject } from '$lib/dailySummaryRenderer';
import type {
  DailySummaryDeliveryErrorClassification,
  DailySummaryDeliveryProvider
} from './dailySummaryDelivery';
import { DailySummaryDeliveryError } from './dailySummaryDelivery';
import type { ScheduledDailySummaryGenerationResult } from './scheduledDailySummaryGeneration';

type TestDailySummaryDeliveryRecordStore = {
  recordAttempt(userId: string, record: DeliveryRecordInput): Promise<void>;
};

export type TestDailySummaryDeliveryDependencies = {
  deliveryProvider: DailySummaryDeliveryProvider;
  senderAddress: () => string;
  recordAttempt: TestDailySummaryDeliveryRecordStore['recordAttempt'];
  now?: () => Date;
  createRecordId?: () => string;
};

export type TestDailySummaryDeliveryRequest = {
  userId: string;
  summaryRecipient: string;
  requestedAt: string;
  generated: ScheduledDailySummaryGenerationResult;
};

const testDeliveryFailureMessage = (
  classification: DailySummaryDeliveryErrorClassification
) => {
  switch (classification) {
    case 'configuration-missing':
      return 'Test Daily Summary delivery is not configured.';
    case 'validation-failed':
      return 'The delivery provider could not validate the test Daily Summary.';
    case 'authentication-failed':
      return 'The delivery provider could not authenticate the test Daily Summary request.';
    case 'provider-rejected':
      return 'The delivery provider rejected the test Daily Summary.';
    case 'provider-unavailable':
      return 'The test Daily Summary could not be sent.';
    default: {
      const exhaustiveClassification: never = classification;
      return exhaustiveClassification;
    }
  }
};

export const createTestDailySummaryDelivery = ({
  deliveryProvider,
  senderAddress,
  recordAttempt,
  now = () => new Date(),
  createRecordId = () => crypto.randomUUID()
}: TestDailySummaryDeliveryDependencies) => ({
  async send({ userId, summaryRecipient, requestedAt, generated }: TestDailySummaryDeliveryRequest) {
    const completedAt = () => now().toISOString();
    const record = async (
      input: Omit<DeliveryRecordInput, 'id' | 'attemptType' | 'deliveryStatus'> & {
        deliveryStatus: DeliveryRecordInput['deliveryStatus'];
      }
    ) => recordAttempt(userId, {
      id: createRecordId(),
      attemptType: 'test',
      ...input
    });
    const message = {
      to: summaryRecipient,
      from: senderAddress(),
      subject: dailySummarySubject(
        'test',
        generated.input.generatedAt ?? now(),
        generated.input.configuration.userTimeZone
      ),
      html: generated.rendered.html,
      text: generated.rendered.text
    };

    let accepted;
    try {
      accepted = await deliveryProvider.send(message);
    } catch (error) {
      if (!(error instanceof DailySummaryDeliveryError)) {
        throw error;
      }

      await record({
        requestedAt,
        completedAt: completedAt(),
        deliveryStatus: 'failed',
        providerName: error.providerName,
        providerMessageId: null,
        providerStatusMetadata: error.providerStatusMetadata,
        errorClassification: error.classification
      });

      return {
        outcome: 'failed' as const,
        reason: error.classification,
        message: testDeliveryFailureMessage(error.classification)
      };
    }

    if (!accepted.providerMessageId) {
      await record({
        requestedAt,
        completedAt: completedAt(),
        deliveryStatus: 'failed',
        providerName: accepted.providerName,
        providerMessageId: null,
        providerStatusMetadata: accepted.providerStatusMetadata
          ? `${accepted.providerStatusMetadata}; missing message id`
          : 'missing message id',
        errorClassification: 'provider-missing-message-id'
      });

      return {
        outcome: 'failed' as const,
        reason: 'provider-missing-message-id' as const,
        message: 'The delivery provider accepted the request without a message id.'
      };
    }

    await record({
      requestedAt,
      completedAt: completedAt(),
      deliveryStatus: 'sent',
      providerName: accepted.providerName,
      providerMessageId: accepted.providerMessageId,
      providerStatusMetadata: accepted.providerStatusMetadata,
      errorClassification: null
    });

    return { outcome: 'sent' as const };
  }
});
