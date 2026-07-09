import { afterEach, describe, expect, test, vi } from 'vitest';

const { authAccounts } = vi.hoisted(() => ({
  authAccounts: [] as Array<{
    access_token: string | null;
    access_token_expires_at: Date | null;
    scope: string | null;
  }>
}));

vi.mock('$lib/server/db', () => ({
  db: {
    query: {
      authAccount: {
        async findMany() {
          return authAccounts;
        }
      }
    }
  }
}));

const { googleCalendarEventProvider, googleCalendarListProvider, loadGoogleCalendarAccessToken } = await import(
  './googleCalendarList'
);

describe('Google Calendar list provider', () => {
  afterEach(() => {
    authAccounts.length = 0;
    vi.restoreAllMocks();
  });

  test('maps Google calendar list entries without copying event content fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'primary',
            summary: 'Ada Lovelace',
            backgroundColor: '#3f51b5',
            primary: true,
            description: 'Dentist at 10:00',
            location: 'Home'
          },
          {
            id: 'missing-summary',
            backgroundColor: '#0b8043'
          },
          {
            summary: 'Missing id'
          },
          {
            id: 'work',
            summary: 'Work'
          }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(googleCalendarListProvider.loadCalendars('access-token')).resolves.toEqual([
      {
        id: 'primary',
        summary: 'Ada Lovelace',
        backgroundColor: '#3f51b5',
        primary: true
      },
      {
        id: 'work',
        summary: 'Work',
        backgroundColor: null,
        primary: false
      }
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      {
        headers: {
          authorization: 'Bearer access-token'
        }
      }
    );
  });

  test('raises a stable error when Google rejects the calendar list request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403
      })
    );

    await expect(googleCalendarListProvider.loadCalendars('access-token')).rejects.toThrow(
      'Google Calendar list request failed: 403'
    );
  });

  test('maps Google Calendar Events without using raw calendar IDs as display summaries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'timed-event',
            summary: 'Planning',
            start: { dateTime: '2026-07-07T15:00:00.000Z' },
            end: { dateTime: '2026-07-07T16:00:00.000Z' }
          },
          {
            id: 'all-day-event',
            summary: 'Conference',
            start: { date: '2026-07-08' },
            end: { date: '2026-07-09' }
          },
          {
            id: 'declined-event',
            summary: 'Declined planning',
            start: { dateTime: '2026-07-08T15:00:00.000Z' },
            end: { dateTime: '2026-07-08T16:00:00.000Z' },
            attendees: [{ self: true, responseStatus: 'declined' }]
          },
          {
            id: 'canceled-event',
            summary: 'Canceled planning',
            status: 'cancelled',
            start: { dateTime: '2026-07-08T17:00:00.000Z' },
            end: { dateTime: '2026-07-08T18:00:00.000Z' }
          }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      googleCalendarEventProvider('access-token').fetchEvents({
        calendarIds: ['user@gmail.com'],
        timeMin: '2026-07-07T04:00:00Z',
        timeMax: '2026-07-14T04:00:00Z',
        timeZone: 'America/New_York'
      })
    ).resolves.toEqual([
      {
        kind: 'timed',
        id: 'timed-event',
        calendarId: 'user@gmail.com',
        calendarSummary: '',
        summary: 'Planning',
        start: '2026-07-07T15:00:00.000Z',
        end: '2026-07-07T16:00:00.000Z'
      },
      {
        kind: 'all-day',
        id: 'all-day-event',
        calendarId: 'user@gmail.com',
        calendarSummary: '',
        summary: 'Conference',
        startDate: '2026-07-08',
        endDate: '2026-07-09'
      }
    ]);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    const url = new URL(requestUrl);
    expect(url.origin + url.pathname).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/user%40gmail.com/events'
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: '2026-07-07T04:00:00Z',
      timeMax: '2026-07-14T04:00:00Z',
      timeZone: 'America/New_York'
    });
    expect(requestInit).toEqual({
      headers: {
        authorization: 'Bearer access-token'
      }
    });
  });

  test('loads the newest Calendar-scoped access token when it is still valid', async () => {
    authAccounts.push({
      access_token: 'calendar-access-token',
      access_token_expires_at: new Date(Date.now() + 60_000),
      scope: 'openid email https://www.googleapis.com/auth/calendar.readonly'
    });

    await expect(loadGoogleCalendarAccessToken('user-1')).resolves.toBe('calendar-access-token');
  });

  test('does not return expired or unavailable Calendar access tokens', async () => {
    authAccounts.push({
      access_token: 'expired-access-token',
      access_token_expires_at: new Date(Date.now() - 60_000),
      scope: 'openid email https://www.googleapis.com/auth/calendar.readonly'
    });

    await expect(loadGoogleCalendarAccessToken('user-1')).resolves.toBeNull();

    authAccounts.splice(0, authAccounts.length, {
      access_token: null,
      access_token_expires_at: new Date(Date.now() + 60_000),
      scope: 'openid email https://www.googleapis.com/auth/calendar.readonly'
    });

    await expect(loadGoogleCalendarAccessToken('user-1')).resolves.toBeNull();
  });

  test('keeps existing no-expiry Calendar tokens usable', async () => {
    authAccounts.push({
      access_token: 'calendar-access-token',
      access_token_expires_at: null,
      scope: 'openid email https://www.googleapis.com/auth/calendar.readonly'
    });

    await expect(loadGoogleCalendarAccessToken('user-1')).resolves.toBe('calendar-access-token');
  });
});
