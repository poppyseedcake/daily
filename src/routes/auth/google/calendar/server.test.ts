import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getSession, signInSocial } = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInSocial: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      getSession,
      signInSocial
    }
  },
  googleCalendarReadScope: 'https://www.googleapis.com/auth/calendar.readonly',
  googleCalendarReadScopes: ['https://www.googleapis.com/auth/calendar.readonly']
}));

const { GET } = await import('./+server');

describe('Google Calendar consent route', () => {
  beforeEach(() => {
    getSession.mockReset();
    signInSocial.mockReset();
  });

  test('starts a separate Google consent flow with read-only Calendar scopes', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    signInSocial.mockResolvedValue({
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
    expect(signInSocial).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: {
        provider: 'google',
        callbackURL: '/?calendarConnection=success',
        errorCallbackURL: '/?calendarConnection=failed',
        scopes: ['https://www.googleapis.com/auth/calendar.readonly']
      },
      returnHeaders: true
    });
  });

  test('does not start Calendar consent for a Visitor', async () => {
    getSession.mockResolvedValue(null);

    const response = await GET({
      request: new Request('http://localhost/auth/google/calendar')
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(signInSocial).not.toHaveBeenCalled();
  });

  test('returns to failed Calendar state when Better Auth cannot start consent', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    signInSocial.mockResolvedValue({
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
    signInSocial.mockRejectedValue(new Error('provider unavailable'));

    const response = await GET({
      request: new Request('http://localhost/auth/google/calendar')
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/?calendarConnection=failed');
  });
});
