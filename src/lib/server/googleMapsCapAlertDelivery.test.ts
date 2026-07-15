import { describe, expect, test, vi } from 'vitest';
import type { GoogleMapsCapAlert } from './db/googleMapsUsageGate';
import { createGoogleMapsCapAlertEmailDelivery } from './googleMapsCapAlertDelivery';

const dailyAlert: GoogleMapsCapAlert = {
  capType: 'daily',
  timeBasis: 'UTC',
  suspensionReason: 'global-daily-cap',
  daily: {
    periodStart: '2026-07-12',
    total: 25,
    cap: 25,
    byCategory: { 'map-point-selection': 10, 'commute-estimate': 15 }
  },
  monthly: {
    periodStart: '2026-07',
    total: 325,
    cap: 500,
    byCategory: { 'map-point-selection': 100, 'commute-estimate': 225 }
  }
};

describe('Google Maps cap alert delivery', () => {
  test('sends the operator privacy-safe counters, periods, cap type, and suspension context', async () => {
    const send = vi.fn().mockResolvedValue({
      providerName: 'resend',
      providerMessageId: 'alert-message-1',
      providerStatusMetadata: 'accepted'
    });
    const delivery = createGoogleMapsCapAlertEmailDelivery({
      deliveryProvider: { send },
      operatorRecipient: () => 'operator@example.com',
      senderAddress: () => 'Daily <daily@example.com>'
    });

    await expect(
      delivery.send(dailyAlert, {
        idempotencyKey: 'google-maps-cap-alert/daily/2026-07-12'
      })
    ).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledWith({
      to: 'operator@example.com',
      from: 'Daily <daily@example.com>',
      subject: '[Daily] Google Maps daily cap reached',
      html: expect.stringContaining('Google Maps access is suspended'),
      text: expect.stringContaining('Daily period: 2026-07-12 · 25 / 25'),
      idempotencyKey: 'google-maps-cap-alert/daily/2026-07-12'
    });
    const message = JSON.stringify(send.mock.calls);
    expect(message).toContain('Monthly period: 2026-07 · 325 / 500');
    expect(message).toContain('Map point selection: 10');
    expect(message).toContain('Commute estimates: 15 daily · 225 monthly');
    expect(message).toContain('Suspension reason: global-daily-cap');
    expect(message).not.toMatch(
      /personUsageIdentity|origin|destination|route name|provider payload/i
    );
  });

  test('fails safely before provider delivery when the operator recipient is not configured', async () => {
    const send = vi.fn();
    const delivery = createGoogleMapsCapAlertEmailDelivery({
      deliveryProvider: { send },
      operatorRecipient: () => '',
      senderAddress: () => 'Daily <daily@example.com>'
    });

    await expect(
      delivery.send(dailyAlert, {
        idempotencyKey: 'google-maps-cap-alert/daily/2026-07-12'
      })
    ).rejects.toThrow(
      'Google Maps operator alert recipient is not configured'
    );
    expect(send).not.toHaveBeenCalled();
  });
});
