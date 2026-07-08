import { afterEach, describe, expect, test, vi } from 'vitest';
import { googleCalendarListProvider } from './googleCalendarList';

describe('Google Calendar list provider', () => {
  afterEach(() => {
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
});
