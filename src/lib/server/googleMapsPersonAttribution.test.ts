import { describe, expect, test, vi } from 'vitest';
import { createGoogleMapsPersonAttribution } from './googleMapsPersonAttribution';

const secret = 'a-private-attribution-key-with-at-least-32-bytes';

describe('Google Maps person attribution', () => {
  test('gives a Visitor a stable opaque identity using a protected first-party cookie', () => {
    let cookieValue: string | undefined;
    const cookies = {
      get: vi.fn(() => cookieValue),
      set: vi.fn((_name: string, value: string) => { cookieValue = value; })
    };

    const first = createGoogleMapsPersonAttribution({ authState: { mode: 'visitor' }, cookies, secret });
    const second = createGoogleMapsPersonAttribution({ authState: { mode: 'visitor' }, cookies, secret });

    expect(second).toEqual(first);
    expect(first.personUsageIdentity).not.toContain(cookieValue!);
    expect(cookies.set).toHaveBeenCalledWith('daily-maps-visitor', expect.any(String), {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 31536000
    });
  });

  test('attributes a signed-in User from trusted session state without exposing the User ID or secret', () => {
    const cookies = { get: vi.fn(), set: vi.fn() };
    const attribution = createGoogleMapsPersonAttribution({
      authState: { mode: 'user', userId: 'private-user-id', summaryRecipient: 'person@example.test' },
      cookies,
      secret
    });

    expect(attribution.personUsageIdentity).not.toContain('private-user-id');
    expect(attribution.personUsageIdentity).not.toContain(secret);
    expect(cookies.get).not.toHaveBeenCalled();
    expect(cookies.set).not.toHaveBeenCalled();
  });
});
