import { beforeEach, describe, expect, test, vi } from 'vitest';

const {
  accessToken,
  getSession,
  providerCalendars,
  savedCalendarConnection,
  savedCalendars,
  savedSelections
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  savedSelections: [] as Array<{ userId: string; calendars: unknown }>,
  savedCalendarConnection: {
    status: 'connected' as 'not-connected' | 'connected' | 'failed'
  },
  providerCalendars: [
    {
      id: 'work',
      summary: 'Work',
      backgroundColor: '#0b8043',
      primary: false
    },
    {
      id: 'primary',
      summary: 'Ada Lovelace',
      backgroundColor: '#3f51b5',
      primary: true
    }
  ],
  savedCalendars: [] as Array<{
    id: string;
    summary: string;
    backgroundColor: string | null;
    primary: boolean;
  }>,
  accessToken: { value: 'calendar-access-token' as string | null }
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      getSession
    }
  }
}));

vi.mock('$lib/server/db/calendarConnectionStore', () => ({
  userCalendarConnectionStore: {
    async load() {
      return savedCalendarConnection;
    },
    async loadSelectedCalendars() {
      return savedCalendars;
    },
    async saveSelectedCalendars(userId: string, calendars: unknown) {
      savedSelections.push({ userId, calendars });
    }
  }
}));

vi.mock('$lib/server/googleCalendarList', () => ({
  googleCalendarListProvider: {
    async loadCalendars() {
      return providerCalendars;
    }
  },
  async loadGoogleCalendarAccessToken() {
    return accessToken.value;
  }
}));

const { PUT } = await import('./selected-calendars/+server');

const saveSelectedCalendars = (payload: unknown) =>
  PUT({
    request: new Request('http://localhost/selected-calendars', {
      method: 'PUT',
      body: JSON.stringify(payload)
    })
  } as Parameters<typeof PUT>[0]);

describe('Selected Calendars endpoint', () => {
  beforeEach(() => {
    getSession.mockReset();
    savedSelections.length = 0;
    savedCalendarConnection.status = 'connected';
    providerCalendars.splice(
      0,
      providerCalendars.length,
      {
        id: 'work',
        summary: 'Work',
        backgroundColor: '#0b8043',
        primary: false
      },
      {
        id: 'primary',
        summary: 'Ada Lovelace',
        backgroundColor: '#3f51b5',
        primary: true
      }
    );
    savedCalendars.length = 0;
    accessToken.value = 'calendar-access-token';
  });

  test('persists provider Calendar metadata for the signed-in User only', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    const response = await saveSelectedCalendars(['work']);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ outcome: 'saved' });
    expect(savedSelections).toEqual([
      {
        userId: 'user-1',
        calendars: [
          {
            id: 'work',
            summary: 'Work',
            backgroundColor: '#0b8043',
            primary: false
          }
        ]
      }
    ]);
  });

  test('preserves selected unavailable saved calendars without trusting client metadata', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedCalendars.push({
      id: 'removed',
      summary: 'Old Project',
      backgroundColor: null,
      primary: false
    });

    const response = await saveSelectedCalendars(['work', 'removed']);

    expect(response.status).toBe(200);
    expect(savedSelections).toEqual([
      {
        userId: 'user-1',
        calendars: [
          {
            id: 'work',
            summary: 'Work',
            backgroundColor: '#0b8043',
            primary: false
          },
          {
            id: 'removed',
            summary: 'Old Project',
            backgroundColor: null,
            primary: false
          }
        ]
      }
    ]);
  });

  test('rejects signed-in Users without connected Calendar state', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedCalendarConnection.status = 'not-connected';

    const response = await saveSelectedCalendars(['work']);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ outcome: 'calendar-not-connected' });
    expect(savedSelections).toEqual([]);
  });

  test('rejects duplicate selected Calendar ids before persistence', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    const response = await saveSelectedCalendars(['work', 'work']);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ outcome: 'invalid-selected-calendars' });
    expect(savedSelections).toEqual([]);
  });

  test('rejects Visitors and invalid copied Calendar Event content', async () => {
    getSession.mockResolvedValue(null);

    const visitorResponse = await saveSelectedCalendars([]);

    expect(visitorResponse.status).toBe(401);
    expect(savedSelections).toEqual([]);

    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    const invalidResponse = await saveSelectedCalendars([
      {
        id: 'work',
        summary: 'Work',
        backgroundColor: null,
        primary: false,
        events: [{ title: 'Therapy', attendees: ['friend@example.com'] }]
      }
    ]);

    expect(invalidResponse.status).toBe(400);
    expect(savedSelections).toEqual([]);
  });
});
