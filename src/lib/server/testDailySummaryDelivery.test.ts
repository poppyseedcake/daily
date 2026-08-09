import { beforeEach, describe, expect, test, vi } from 'vitest';
import { buildDailySummaryVerificationFixtures } from '$lib/dailySummaryFixtures';
import { createDailySummaryGenerator } from './scheduledDailySummaryGeneration';

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
      const generated = await createDailySummaryGenerator({
        userLifecycleStore: { isActive: vi.fn().mockResolvedValue(true) },
        configurationStore: { load: vi.fn().mockResolvedValue(fixture.input.configuration) },
        todoStore: { load: vi.fn().mockResolvedValue({ todoCategories: [], todoTasks: [] }) },
        weatherLocationStore: { load: vi.fn().mockResolvedValue(null) },
        commuteSetupStore: { load: vi.fn().mockResolvedValue({ routes: [], days: [] }) },
        calendarConnectionStore: {
          load: vi.fn().mockResolvedValue({ status: 'not-connected' }),
          loadSelectedCalendars: vi.fn().mockResolvedValue([])
        },
        loadCalendarAccessToken: vi.fn(),
        calendarEventProvider: vi.fn(),
        weatherProvider: { fetchDailyForecast: vi.fn() },
        commuteEstimateProvider: vi.fn(),
        buildInput: async () => fixture.input,
        now: () => fixture.input.generatedAt ?? new Date('2026-07-31T05:00:00.000Z')
      }).generate('verification-user', {
        configuration: fixture.input.configuration,
        openDailyUrl: fixture.input.openDailyUrl,
        now: fixture.input.generatedAt
      });

      await expect(delivery.send({
        userId: 'verification-user',
        summaryRecipient: 'verification-recipient@example.com',
        requestedAt: '2026-07-31T05:00:00.000Z',
        generated
      })).resolves.toEqual({ outcome: 'sent' });
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
