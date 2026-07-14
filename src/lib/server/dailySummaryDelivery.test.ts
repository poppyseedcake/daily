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

const { DailySummaryDeliveryError, dailySummarySenderAddress, resendDailySummaryDeliveryProvider } =
  await import('./dailySummaryDelivery');

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
      text: 'Rendered Daily Summary',
      idempotencyKey: 'daily-summary/opaque-occurrence'
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-resend-key',
          'content-type': 'application/json',
          'Idempotency-Key': 'daily-summary/opaque-occurrence'
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

  test('reports missing Resend configuration without submitting provider content', async () => {
    env.RESEND_API_KEY = '';
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(
      resendDailySummaryDeliveryProvider.send({
        to: 'user@example.com',
        from: dailySummarySenderAddress(),
        subject: 'Test Daily Summary',
        html: '<article>Rendered Daily Summary</article>',
        text: 'Rendered Daily Summary'
      })
    ).rejects.toMatchObject({
      name: 'DailySummaryDeliveryError',
      classification: 'configuration-missing',
      providerName: 'resend',
      providerStatusMetadata: 'missing RESEND_API_KEY'
    } satisfies Partial<InstanceType<typeof DailySummaryDeliveryError>>);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('reports provider rejection with non-private status metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'invalid api key' }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      )
    );

    await expect(
      resendDailySummaryDeliveryProvider.send({
        to: 'user@example.com',
        from: dailySummarySenderAddress(),
        subject: 'Test Daily Summary',
        html: '<article>Rendered Daily Summary</article>',
        text: 'Rendered Daily Summary'
      })
    ).rejects.toMatchObject({
      classification: 'provider-rejected',
      providerName: 'resend',
      providerStatusMetadata: 'status=401'
    });
  });

  test('returns provider acceptance without a message id for action-level normalization', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
    );

    await expect(
      resendDailySummaryDeliveryProvider.send({
        to: 'user@example.com',
        from: dailySummarySenderAddress(),
        subject: 'Test Daily Summary',
        html: '<article>Rendered Daily Summary</article>',
        text: 'Rendered Daily Summary'
      })
    ).resolves.toEqual({
      providerName: 'resend',
      providerMessageId: null,
      providerStatusMetadata: 'accepted'
    });
  });
});
