export type DeliveryAttemptType = 'test' | 'scheduled';
export type DeliveryStatus = 'sent' | 'failed';

export type DeliveryRecord = {
  id: string;
  attemptType: DeliveryAttemptType;
  requestedAt: string;
  completedAt: string | null;
  deliveryStatus: DeliveryStatus;
  providerName: string;
  providerMessageId: string | null;
  providerStatusMetadata: string | null;
  errorClassification: string | null;
};

export type DeliveryRecordInput = Omit<DeliveryRecord, 'id'> & {
  id?: DeliveryRecord['id'];
};
