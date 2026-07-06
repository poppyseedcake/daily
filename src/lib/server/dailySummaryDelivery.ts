import { env } from '$env/dynamic/private';

export type DailySummaryDeliveryMessage = {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
};

export type DailySummaryDeliveryAccepted = {
  providerName: string;
  providerMessageId: string | null;
  providerStatusMetadata: string | null;
};

export type DailySummaryDeliveryProvider = {
  send(message: DailySummaryDeliveryMessage): Promise<DailySummaryDeliveryAccepted>;
};

export type DailySummaryDeliveryErrorClassification =
  | 'configuration-missing'
  | 'provider-rejected'
  | 'provider-unavailable';

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
        'content-type': 'application/json'
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

    const payload = (await response.json().catch(() => null)) as { id?: string } | null;

    if (!response.ok) {
      throw new DailySummaryDeliveryError(
        `Resend rejected Daily Summary delivery with status ${response.status}.`,
        'provider-rejected',
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
