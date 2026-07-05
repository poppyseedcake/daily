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

const resendApiUrl = 'https://api.resend.com/emails';

export const resendDailySummaryDeliveryProvider: DailySummaryDeliveryProvider = {
  async send(message) {
    if (!env.RESEND_API_KEY || !message.from) {
      throw new Error('Resend delivery is not configured.');
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
    });

    const payload = (await response.json().catch(() => null)) as { id?: string } | null;

    if (!response.ok) {
      throw new Error(`Resend rejected Daily Summary delivery with status ${response.status}.`);
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
