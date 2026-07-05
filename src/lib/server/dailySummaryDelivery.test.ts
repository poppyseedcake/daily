import { beforeEach, describe, expect, test, vi } from 'vitest';

const { env } = vi.hoisted(() => ({
  env: {
    RESEND_API_KEY: 'test-resend-key',
    RESEND_FROM_EMAIL: 'Daily <daily@example.com>'
  }
}));

vi.mock('$env/dynamic/private', () => ({
  env
}));

const { dailySummarySenderAddress, resendDailySummaryDeliveryProvider } = await import(
  './dailySummaryDelivery'
);

describe('Daily Summary delivery provider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    env.RESEND_API_KEY = 'test-resend-key';
    env.RESEND_FROM_EMAIL = 'Daily <daily@example.com>';
  });

  test('submits already-rendered Daily Summary output to Resend from environment configuration', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend-message-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetch);

    const result = await resendDailySummaryDeliveryProvider.send({
      to: 'user@example.com',
      from: dailySummarySenderAddress(),
      subject: 'Test Daily Summary',
      html: '<article>Rendered Daily Summary</article>',
      text: 'Rendered Daily Summary'
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-resend-key',
          'content-type': 'application/json'
        }),
        body: JSON.stringify({
          from: 'Daily <daily@example.com>',
          to: ['user@example.com'],
          subject: 'Test Daily Summary',
          html: '<article>Rendered Daily Summary</article>',
          text: 'Rendered Daily Summary'
        })
      })
    );
    expect(result).toEqual({
      providerName: 'resend',
      providerMessageId: 'resend-message-1',
      providerStatusMetadata: 'accepted'
    });
  });
});
