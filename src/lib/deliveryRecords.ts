export type DeliveryAttemptType = 'test' | 'scheduled';
export type DeliveryStatus = 'processing' | 'retrying' | 'sent' | 'failed';
export const deliveryErrorClassifications = [
  'configuration-missing',
  'provider-missing-message-id',
  'provider-rejected',
  'provider-unavailable',
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

export type DeliveryRecordInput = Omit<
  DeliveryRecord,
  'id' | 'scheduledAt' | 'attemptCount' | 'lastAttemptAt' | 'nextRetryAt' | 'claimExpiresAt'
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
  attemptedAt: string;
  nextRetryAt: string;
  providerStatusMetadata: string | null;
  errorClassification: DeliveryErrorClassification;
};

export type ScheduledDeliverySent = {
  completedAt: string;
  providerMessageId: string;
  providerStatusMetadata: string | null;
};

export type ScheduledDeliveryFailed = {
  completedAt: string;
  providerMessageId: string | null;
  providerStatusMetadata: string | null;
  errorClassification: DeliveryErrorClassification;
};
