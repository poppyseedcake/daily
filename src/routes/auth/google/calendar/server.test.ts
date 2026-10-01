import { beforeEach, describe, expect, test, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';

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
  googleCalendarReadScopes: [
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly'
  ],
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
        scopes: [
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
          'https://www.googleapis.com/auth/calendar.events.readonly'
        ],
        additionalParams: { access_type: 'offline', prompt: 'consent' }
      },
      returnHeaders: true
    });
    const requestedScopes = linkSocialAccount.mock.calls[0]?.[0].body.scopes as string[];
    expect(requestedScopes.filter((scope) => scope.includes('calendar'))).toEqual([
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly'
    ]);
    expect(requestedScopes).not.toContain('https://www.googleapis.com/auth/calendar.readonly');
    expect(requestedScopes).not.toContain('https://www.googleapis.com/auth/calendar');
    expect(requestedScopes).not.toContain('https://www.googleapis.com/auth/calendar.events');
  });

  test('requests offline access and renewed consent through the real account-link API', async () => {
    const { authOptions, googleProviderOptions } = await vi.importActual<typeof import('$lib/server/auth')>(
      '$lib/server/auth'
    );
    const realAuth = betterAuth({
      ...authOptions,
      database: memoryAdapter({ user: [], account: [], session: [], verification: [] }),
      databaseHooks: {},
      secret: 'calendar-consent-test-secret-at-least-32-characters',
      baseURL: 'http://localhost:5174',
      emailAndPassword: { enabled: true },
      socialProviders: {
        google: googleProviderOptions({
          GOOGLE_CLIENT_ID: 'test-client',
          GOOGLE_CLIENT_SECRET: 'test-secret'
        })
      },
    });
    const signedIn = await realAuth.api.signUpEmail({
      body: { name: 'Daily User', email: 'user@example.com', password: 'calendar-test-password' },
      returnHeaders: true
    });
    const cookie = signedIn.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    getSession.mockImplementation((input) => realAuth.api.getSession(input));
    linkSocialAccount.mockImplementation((input) => realAuth.api.linkSocialAccount(input));

    const response = await GET({
      request: new Request('http://localhost:5174/auth/google/calendar', {
        headers: { cookie }
      })
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(303);
    const authorizationUrl = new URL(response.headers.get('location')!);
    expect(authorizationUrl.origin).toBe('https://accounts.google.com');
    expect(authorizationUrl.searchParams.get('access_type')).toBe('offline');
    expect(authorizationUrl.searchParams.get('prompt')).toBe('consent');
    expect(authorizationUrl.searchParams.get('scope')).toContain(
      'https://www.googleapis.com/auth/calendar.events.readonly'
    );
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
