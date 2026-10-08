import { describe, expect, test } from 'vitest';
import { cookieConsentLifetime, readCookieConsent } from './cookieConsent';

describe('stored analytics consent', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  const storage = (value: string | null) => ({ getItem: () => value });

  test.each(['accepted', 'rejected'] as const)('remembers an explicit %s choice', (analytics) => {
    expect(readCookieConsent(storage(JSON.stringify({ analytics, updatedAt: now - 1 })), now)).toBe(analytics);
  });

  test.each([
    null, '{', 'true', '{}',
    JSON.stringify({ analytics: 'accepted', updatedAt: now - cookieConsentLifetime }),
    JSON.stringify({ analytics: 'accepted', updatedAt: now + 1 }),
    JSON.stringify({ analytics: 'accepted', updatedAt: '2026-10-08' }),
    JSON.stringify({ analytics: 'unknown', updatedAt: now })
  ])('asks again when consent is missing, invalid or expired: %s', (value) => {
    expect(readCookieConsent(storage(value), now)).toBe('pending');
  });

  test('keeps analytics off when storage is blocked', () => {
    expect(readCookieConsent({ getItem: () => { throw new Error('Storage blocked'); } }, now)).toBe('pending');
  });
});
