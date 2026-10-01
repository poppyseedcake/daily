import { beforeEach, describe, expect, test, vi } from 'vitest';
import { buildDailySummaryVerificationFixtures } from '$lib/dailySummaryFixtures';
import { renderDailySummary } from '$lib/dailySummaryRenderer';

const { env } = vi.hoisted(() => ({
  env: {
    RESEND_API_KEY: 'test-resend-key',
    RESEND_FROM_EMAIL: 'Daily <daily@example.com>'
  }
}));

vi.mock('$env/dynamic/private', () => ({ env }));

const { createTestDailySummaryDelivery } = await import('./testDailySummaryDelivery');
const { resendDailySummaryDeliveryProvider } = await import('./dailySummaryDelivery');

describe('production Test Delivery path', () => {
  beforeEach(() => {
    env.RESEND_API_KEY = 'test-resend-key';
    env.RESEND_FROM_EMAIL = 'Daily <daily@example.com>';
  });

  test('sends every verification fixture through Resend and records exactly one Test Delivery Record', async () => {
    const records: Array<{ userId: string; record: unknown }> = [];
    const fetch = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ id: `resend-message-${fetch.mock.calls.length}` }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetch);

    const delivery = createTestDailySummaryDelivery({
      deliveryProvider: resendDailySummaryDeliveryProvider,
      senderAddress: () => env.RESEND_FROM_EMAIL,
      recordAttempt: async (userId, record) => {
        records.push({ userId, record });
      }
    });

    for (const fixture of buildDailySummaryVerificationFixtures()) {
      const generated = {
        input: fixture.input,
        rendered: renderDailySummary(fixture.input)
      };

      await expect(delivery.send({
        userId: 'verification-user',
        summaryRecipient: 'verification-recipient@example.com',
        requestedAt: '2026-07-31T05:00:00.000Z',
        generated
      })).resolves.toEqual({ outcome: 'sent' });

      // Assert the actual provider submission, so a separate legacy email template
      // cannot pass a renderer-only visual regression check.
      const [url, request] = fetch.mock.calls.at(-1)!;
      expect(url).toBe('https://api.resend.com/emails');
      const payload = JSON.parse(request.body);
      expect(payload).toEqual({
        from: env.RESEND_FROM_EMAIL,
        to: ['verification-recipient@example.com'],
        subject: 'Test · Your Daily Summary · Friday, 31 July',
        html: generated.rendered.html,
        text: generated.rendered.text
      });
      expect(payload.html).toContain('data-daily-brand');
      expect(payload.html).toContain('max-width:790px');
      expect(payload.html).not.toContain('<svg');
    }

    expect(fetch).toHaveBeenCalledTimes(5);
    expect(records).toHaveLength(5);
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'verification-user',
          record: expect.objectContaining({
            attemptType: 'test',
            deliveryStatus: 'sent',
            providerName: 'resend',
            providerStatusMetadata: 'accepted',
            errorClassification: null
          })
        })
      ])
    );
    expect(JSON.stringify(records)).not.toContain('Przygotować plan wdrożenia');
  });
});
