export type DeliveryAttemptType = 'test' | 'scheduled';
export type DeliveryStatus = 'processing' | 'retrying' | 'sent' | 'failed';
export const deliveryProviderErrorClassifications = [
  'configuration-missing',
  'validation-failed',
  'authentication-failed',
  'provider-rejected',
  'provider-unavailable'
] as const;
export type DeliveryProviderErrorClassification =
  (typeof deliveryProviderErrorClassifications)[number];

export const deliveryErrorClassifications = [
  ...deliveryProviderErrorClassifications,
  'provider-missing-message-id',
  'retry-exhausted',
  'stale-occurrence',
  'unexpected'
] as const;
export type DeliveryErrorClassification = (typeof deliveryErrorClassifications)[number];

export type DeliveryRecord = {
  id: string;
  attemptType: DeliveryAttemptType;
  requestedAt: string;
  completedAt: string | null;
  deliveryStatus: DeliveryStatus;
  providerName: string;
  providerMessageId: string | null;
  providerStatusMetadata: string | null;
  errorClassification: DeliveryErrorClassification | null;
  scheduledAt: string | null;
  attemptCount: number | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  claimExpiresAt: string | null;
};

export type TestDeliveryHistoryRecord = Pick<
  DeliveryRecord,
  | 'id'
  | 'requestedAt'
  | 'completedAt'
  | 'deliveryStatus'
  | 'providerName'
  | 'providerMessageId'
  | 'providerStatusMetadata'
  | 'errorClassification'
> & {
  attemptType: 'test';
};

export type ScheduledDeliveryHistoryRecord = Pick<
  DeliveryRecord,
  'id' | 'completedAt' | 'deliveryStatus' | 'scheduledAt' | 'attemptCount'
> & {
  attemptType: 'scheduled';
};

export type DeliveryHistoryRecord =
  | TestDeliveryHistoryRecord
  | ScheduledDeliveryHistoryRecord;

export const toDeliveryHistoryRecord = (record: DeliveryRecord): DeliveryHistoryRecord => {
  if (record.attemptType === 'scheduled') {
    return {
      id: record.id,
      attemptType: record.attemptType,
      completedAt: record.completedAt,
      deliveryStatus: record.deliveryStatus,
      scheduledAt: record.scheduledAt,
      attemptCount: record.attemptCount
    };
  }

  return {
    id: record.id,
    attemptType: record.attemptType,
    requestedAt: record.requestedAt,
    completedAt: record.completedAt,
    deliveryStatus: record.deliveryStatus,
    providerName: record.providerName,
    providerMessageId: record.providerMessageId,
    providerStatusMetadata: record.providerStatusMetadata,
    errorClassification: record.errorClassification
  };
};

export type DeliveryRecordInput = Omit<
  DeliveryRecord,
  | 'id'
  | 'scheduledAt'
  | 'attemptCount'
  | 'lastAttemptAt'
  | 'nextRetryAt'
  | 'claimExpiresAt'
> & {
  id?: DeliveryRecord['id'];
  attemptType: 'test';
  deliveryStatus: 'sent' | 'failed';
};

export type ScheduledDeliveryClaim = {
  scheduledAt: string;
  claimedAt: string;
  claimExpiresAt: string;
  providerName: string;
};

export type ScheduledDeliveryRetry = {
  attemptCount: number;
  attemptedAt: string;
  nextRetryAt: string;
  providerStatusMetadata: string | null;
  errorClassification: DeliveryErrorClassification;
};

export type ScheduledDeliveryUnclaimedFailure = {
  completedAt: string;
  errorClassification: 'retry-exhausted' | 'stale-occurrence';
};

export type ScheduledDeliverySent = {
  attemptCount: number;
  completedAt: string;
  providerMessageId: string;
  providerStatusMetadata: string | null;
};

export type ScheduledDeliveryFailed = {
  attemptCount: number;
  completedAt: string;
  providerMessageId: string | null;
  providerStatusMetadata: string | null;
  errorClassification: DeliveryErrorClassification;
};
