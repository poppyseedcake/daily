import { describe, expect, test } from 'vitest';
import { createGoogleMapsPersonAttribution } from './googleMapsPersonAttribution';

const secret = 'a-private-attribution-key-with-at-least-32-bytes';

describe('Google Maps person attribution', () => {
  test('keeps a Visitor in the same opaque bucket after cookies are cleared or a fresh profile is used', () => {
    const request = {
      clientAddress: '203.0.113.10',
      userAgent: 'Example Browser/1.0'
    };
    const first = createGoogleMapsPersonAttribution({
      authState: { mode: 'visitor' },
      visitorRequest: request,
      secret
    });
    const afterClearingCookies = createGoogleMapsPersonAttribution({
      authState: { mode: 'visitor' },
      visitorRequest: request,
      secret
    });

    expect(afterClearingCookies).toEqual(first);
    expect(first.personUsageIdentity).not.toContain(request.clientAddress);
    expect(first.personUsageIdentity).not.toContain(request.userAgent);
  });

  test('attributes a signed-in User from trusted session state without exposing the User ID or secret', () => {
    const attribution = createGoogleMapsPersonAttribution({
      authState: { mode: 'user', userId: 'private-user-id', summaryRecipient: 'person@example.test' },
      secret
    });

    expect(attribution.personUsageIdentity).not.toContain('private-user-id');
    expect(attribution.personUsageIdentity).not.toContain(secret);
  });

  test('fails closed when trusted Visitor request metadata is unavailable', () => {
    expect(() =>
      createGoogleMapsPersonAttribution({ authState: { mode: 'visitor' }, secret })
    ).toThrow('Visitor Google Maps attribution requires trusted request metadata');
  });
});
