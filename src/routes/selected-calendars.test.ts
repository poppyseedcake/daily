import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getSession, savedSelections } = vi.hoisted(() => ({
  getSession: vi.fn(),
  savedSelections: [] as Array<{ userId: string; calendars: unknown }>
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
    async saveSelectedCalendars(userId: string, calendars: unknown) {
      savedSelections.push({ userId, calendars });
    }
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
  });

  test('persists selected Calendar metadata for the signed-in User only', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    const response = await saveSelectedCalendars([
      {
        id: 'work',
        summary: 'Work',
        backgroundColor: '#0b8043',
        primary: false
      }
    ]);

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
