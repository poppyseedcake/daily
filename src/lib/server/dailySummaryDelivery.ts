import { env } from '$env/dynamic/private';
import type { DeliveryProviderErrorClassification } from '$lib/deliveryRecords';

export type DailySummaryDeliveryMessage = {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
};

export type DailySummaryDeliveryAccepted = {
  providerName: string;
  providerMessageId: string | null;
  providerStatusMetadata: string | null;
};

export type DailySummaryDeliveryProvider = {
  send(message: DailySummaryDeliveryMessage): Promise<DailySummaryDeliveryAccepted>;
};

export type DailySummaryDeliveryErrorClassification = DeliveryProviderErrorClassification;

export class DailySummaryDeliveryError extends Error {
  providerName: string;
  providerStatusMetadata: string | null;
  classification: DailySummaryDeliveryErrorClassification;

  constructor(
    message: string,
    classification: DailySummaryDeliveryErrorClassification,
    options: {
      providerName?: string;
      providerStatusMetadata?: string | null;
      cause?: unknown;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = 'DailySummaryDeliveryError';
    this.classification = classification;
    this.providerName = options.providerName ?? 'resend';
    this.providerStatusMetadata = options.providerStatusMetadata ?? null;
  }
}

const resendApiUrl = 'https://api.resend.com/emails';

const deliveryClassificationForStatus = (
  status: number,
  providerErrorName?: string
): DailySummaryDeliveryErrorClassification => {
  if (status === 400 || status === 422) {
    return 'validation-failed';
  }

  if (status === 401 || status === 403) {
    return 'authentication-failed';
  }

  if (status === 429) {
    return providerErrorName === 'rate_limit_exceeded'
      ? 'provider-unavailable'
      : 'provider-rejected';
  }

  if (status === 408 || status === 425 || status >= 500) {
    return 'provider-unavailable';
  }

  return 'provider-rejected';
};

export const resendDailySummaryDeliveryProvider: DailySummaryDeliveryProvider = {
  async send(message) {
    if (!env.RESEND_API_KEY || !message.from) {
      throw new DailySummaryDeliveryError(
        'Resend delivery is not configured.',
        'configuration-missing',
        {
          providerStatusMetadata: !env.RESEND_API_KEY
            ? 'missing RESEND_API_KEY'
            : 'missing RESEND_FROM_EMAIL'
        }
      );
    }

    const response = await fetch(resendApiUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
        ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {})
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text
      })
    }).catch((error: unknown) => {
      throw new DailySummaryDeliveryError(
        'Resend delivery request failed.',
        'provider-unavailable',
        {
          cause: error
        }
      );
    });

    const payload = (await response.json().catch(() => null)) as
      | { id?: string; name?: string }
      | null;

    if (!response.ok) {
      throw new DailySummaryDeliveryError(
        `Resend rejected Daily Summary delivery with status ${response.status}.`,
        deliveryClassificationForStatus(response.status, payload?.name),
        {
          providerStatusMetadata: `status=${response.status}`
        }
      );
    }

    return {
      providerName: 'resend',
      providerMessageId: payload?.id ?? null,
      providerStatusMetadata: 'accepted'
    };
  }
};

export const dailySummaryDeliveryProvider = resendDailySummaryDeliveryProvider;

export const dailySummarySenderAddress = () => env.RESEND_FROM_EMAIL ?? '';
