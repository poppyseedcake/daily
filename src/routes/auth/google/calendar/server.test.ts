import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getSession, linkSocialAccount } = vi.hoisted(() => ({
  getSession: vi.fn(),
  linkSocialAccount: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      getSession,
      linkSocialAccount
    }
  },
  googleCalendarReadScope: 'https://www.googleapis.com/auth/calendar.readonly',
  googleCalendarReadScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  googleIdentityScopes: ['openid', 'email', 'profile']
}));

const { GET } = await import('./+server');

describe('Google Calendar consent route', () => {
  beforeEach(() => {
    getSession.mockReset();
    linkSocialAccount.mockReset();
  });

  test('starts an authenticated Google account-link flow with identity and Calendar scopes', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    linkSocialAccount.mockResolvedValue({
      response: { url: 'https://accounts.google.example/calendar-consent' },
      headers: new Headers()
    });

    const response = await GET({
      request: new Request('http://localhost/auth/google/calendar')
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'https://accounts.google.example/calendar-consent'
    );
    expect(linkSocialAccount).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: {
        provider: 'google',
        callbackURL: '/?calendarConnection=success',
        errorCallbackURL: '/?calendarConnection=failed',
        scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.readonly']
      },
      returnHeaders: true
    });
    const requestedScopes = linkSocialAccount.mock.calls[0]?.[0].body.scopes as string[];
    expect(requestedScopes.filter((scope) => scope.includes('calendar'))).toEqual([
      'https://www.googleapis.com/auth/calendar.readonly'
    ]);
    expect(requestedScopes).not.toContain('https://www.googleapis.com/auth/calendar');
    expect(requestedScopes).not.toContain('https://www.googleapis.com/auth/calendar.events');
  });

  test('does not start Calendar consent for a Visitor', async () => {
    getSession.mockResolvedValue(null);

    const response = await GET({
      request: new Request('http://localhost/auth/google/calendar')
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(linkSocialAccount).not.toHaveBeenCalled();
  });

  test('returns to failed Calendar state when Better Auth cannot start consent', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    linkSocialAccount.mockResolvedValue({
      response: {},
      headers: new Headers()
    });

    const response = await GET({
      request: new Request('http://localhost/auth/google/calendar')
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/?calendarConnection=failed');
  });

  test('returns to failed Calendar state when Better Auth throws during consent start', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    linkSocialAccount.mockRejectedValue(new Error('provider unavailable'));

    const response = await GET({
      request: new Request('http://localhost/auth/google/calendar')
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/?calendarConnection=failed');
  });
});
