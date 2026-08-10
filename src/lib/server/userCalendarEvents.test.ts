import { afterEach, describe, expect, test, vi } from 'vitest';
import type { CalendarProviderEvent } from '$lib/calendar';
import type { SavedSelectedCalendar } from '$lib/selectedCalendars';
import {
  createUserCalendarEvents,
  type UserCalendarEventsDependencies
} from './userCalendarEvents';

const now = new Date('2026-07-14T06:00:00.000Z');
const selectedWorkCalendar: SavedSelectedCalendar = {
  id: 'work',
  summary: 'Work',
  backgroundColor: '#0b8043',
  primary: true
};
const planningEvent: CalendarProviderEvent = {
  kind: 'timed',
  id: 'planning',
  calendarId: 'work',
  calendarSummary: 'Work',
  summary: 'Planning',
  start: '2026-07-14T08:00:00.000Z',
  end: '2026-07-14T08:30:00.000Z'
};

const createDependencies = (
  overrides: Partial<UserCalendarEventsDependencies> = {}
): UserCalendarEventsDependencies => ({
  connectionStore: {
    load: vi.fn().mockResolvedValue({ status: 'connected' }),
    loadSelectedCalendars: vi.fn().mockResolvedValue([selectedWorkCalendar]),
    saveSelectedCalendars: vi.fn().mockResolvedValue(undefined)
  },
  loadAccessToken: vi.fn().mockResolvedValue('calendar-token'),
  eventProvider: vi.fn().mockReturnValue({
    fetchEvents: vi.fn().mockResolvedValue({
      outcome: 'available',
      events: [planningEvent]
    })
  }),
  calendarListProvider: {
    loadCalendars: vi.fn().mockResolvedValue([])
  },
  isAuthorizationFailure: vi.fn().mockReturnValue(false),
  ...overrides
});

describe('User Calendar Events', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('stops before Selected Calendars and providers when Calendar is not connected', async () => {
    const dependencies = createDependencies({
      connectionStore: {
        load: vi.fn().mockResolvedValue({ status: 'not-connected' }),
        loadSelectedCalendars: vi.fn(),
        saveSelectedCalendars: vi.fn()
      }
    });

    const result = await createUserCalendarEvents(dependencies).load({
      userId: 'user-1',
      userTimeZone: 'Europe/Warsaw',
      now
    });

    expect(result.calendarEvents.readiness.status).toBe('not-connected');
    expect(result.calendarEvents.eventResult).toEqual({ outcome: 'not-requested' });
    expect(dependencies.connectionStore.loadSelectedCalendars).not.toHaveBeenCalled();
    expect(dependencies.loadAccessToken).not.toHaveBeenCalled();
    expect(dependencies.eventProvider).not.toHaveBeenCalled();
  });

  test('stops before credentials and providers when no Calendar is selected', async () => {
    const dependencies = createDependencies({
      connectionStore: {
        load: vi.fn().mockResolvedValue({ status: 'connected' }),
        loadSelectedCalendars: vi.fn().mockResolvedValue([]),
        saveSelectedCalendars: vi.fn()
      }
    });

    const result = await createUserCalendarEvents(dependencies).load({
      userId: 'user-1',
      userTimeZone: 'Europe/Warsaw',
      now
    });

    expect(result.calendarEvents.readiness.status).toBe('connected');
    expect(result.calendarEvents.selectedCalendars).toEqual([]);
    expect(result.calendarEvents.eventResult).toEqual({ outcome: 'not-requested' });
    expect(dependencies.loadAccessToken).not.toHaveBeenCalled();
    expect(dependencies.eventProvider).not.toHaveBeenCalled();
  });

  test('loads Calendar Events once for the saved selection and Week Ahead window', async () => {
    const fetchEvents = vi.fn().mockResolvedValue({
      outcome: 'available',
      events: [planningEvent]
    });
    const dependencies = createDependencies({
      eventProvider: vi.fn().mockReturnValue({ fetchEvents })
    });

    const result = await createUserCalendarEvents(dependencies).load({
      userId: 'user-1',
      userTimeZone: 'Europe/Warsaw',
      now
    });

    expect(dependencies.connectionStore.load).toHaveBeenCalledOnce();
    expect(dependencies.connectionStore.loadSelectedCalendars).toHaveBeenCalledOnce();
    expect(dependencies.loadAccessToken).toHaveBeenCalledOnce();
    expect(dependencies.eventProvider).toHaveBeenCalledWith('calendar-token');
    expect(fetchEvents).toHaveBeenCalledOnce();
    expect(fetchEvents).toHaveBeenCalledWith({
      calendarIds: ['work'],
      timeMin: '2026-07-13T22:00:00Z',
      timeMax: '2026-07-20T22:00:00Z',
      timeZone: 'Europe/Warsaw'
    });
    expect(result.calendarEvents.eventResult).toEqual({
      outcome: 'available',
      events: [planningEvent]
    });
  });

  test('selects and saves the Primary Calendar before the same event fetch', async () => {
    const saveSelectedCalendars = vi.fn().mockResolvedValue(undefined);
    const loadCalendars = vi.fn().mockResolvedValue([
      {
        id: 'primary',
        summary: 'Ada Lovelace',
        backgroundColor: '#1a73e8',
        primary: true
      },
      { id: 'work', summary: 'Work', backgroundColor: '#0b8043', primary: false }
    ]);
    const fetchEvents = vi.fn().mockResolvedValue({ outcome: 'available', events: [] });
    const dependencies = createDependencies({
      connectionStore: {
        load: vi.fn().mockResolvedValue({ status: 'connected' }),
        loadSelectedCalendars: vi.fn().mockResolvedValue([]),
        saveSelectedCalendars
      },
      calendarListProvider: { loadCalendars },
      eventProvider: vi.fn().mockReturnValue({ fetchEvents })
    });

    const result = await createUserCalendarEvents(dependencies).load({
      userId: 'user-1',
      userTimeZone: 'Europe/Warsaw',
      now,
      refreshSelectedCalendarConfiguration: true
    });

    expect(dependencies.loadAccessToken).toHaveBeenCalledOnce();
    expect(loadCalendars).toHaveBeenCalledWith('calendar-token');
    expect(saveSelectedCalendars).toHaveBeenCalledWith('user-1', [
      {
        id: 'primary',
        summary: 'Ada Lovelace',
        backgroundColor: '#1a73e8',
        primary: true
      }
    ]);
    expect(fetchEvents).toHaveBeenCalledOnce();
    expect(fetchEvents).toHaveBeenCalledWith(expect.objectContaining({ calendarIds: ['primary'] }));
    expect(result.calendarEvents.selectedCalendars).toEqual([
      expect.objectContaining({ id: 'primary', primary: true })
    ]);
    expect(result.selectedCalendarConfiguration?.selectedCalendarIds).toEqual(['primary']);
  });

  test('uses saved selections when the Calendar list is temporarily unavailable', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchEvents = vi.fn().mockResolvedValue({ outcome: 'available', events: [] });
    const dependencies = createDependencies({
      calendarListProvider: {
        loadCalendars: vi.fn().mockRejectedValue(new Error('private Calendar list response'))
      },
      eventProvider: vi.fn().mockReturnValue({ fetchEvents })
    });

    const result = await createUserCalendarEvents(dependencies).load({
      userId: 'user-1',
      userTimeZone: 'Europe/Warsaw',
      now,
      refreshSelectedCalendarConfiguration: true
    });

    expect(dependencies.loadAccessToken).toHaveBeenCalledOnce();
    expect(fetchEvents).toHaveBeenCalledOnce();
    expect(result.selectedCalendarConfiguration).toBeNull();
    expect(result.calendarEvents.eventResult.outcome).toBe('available');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private Calendar list response');
  });

  test('requests a reconnect after a Calendar list authorization failure', async () => {
    const authorizationFailure = new Error('private revoked credential response');
    const dependencies = createDependencies({
      calendarListProvider: {
        loadCalendars: vi.fn().mockRejectedValue(authorizationFailure)
      },
      isAuthorizationFailure: vi.fn((error) => error === authorizationFailure)
    });

    const result = await createUserCalendarEvents(dependencies).load({
      userId: 'user-1',
      userTimeZone: 'Europe/Warsaw',
      now,
      refreshSelectedCalendarConfiguration: true
    });

    expect(result.calendarEvents.readiness.status).toBe('reconnect-required');
    expect(result.calendarEvents.eventResult).toEqual({
      outcome: 'unavailable',
      reason: 'Reconnect Google Calendar to include Calendar Events.'
    });
    expect(dependencies.eventProvider).not.toHaveBeenCalled();
  });

  test('requests a reconnect when the access token is unavailable', async () => {
    const dependencies = createDependencies({
      loadAccessToken: vi.fn().mockResolvedValue(null)
    });

    const result = await createUserCalendarEvents(dependencies).load({
      userId: 'user-1',
      userTimeZone: 'Europe/Warsaw',
      now
    });

    expect(result.calendarEvents.readiness.status).toBe('reconnect-required');
    expect(result.calendarEvents.eventResult).toEqual({
      outcome: 'unavailable',
      reason: 'Reconnect Google Calendar to include Calendar Events.'
    });
    expect(dependencies.eventProvider).not.toHaveBeenCalled();
  });

  test('contains event provider failures and does not log private data', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dependencies = createDependencies({
      eventProvider: vi.fn().mockReturnValue({
        fetchEvents: vi.fn().mockRejectedValue(new Error('Dentist at 10:00'))
      })
    });

    const result = await createUserCalendarEvents(dependencies).load({
      userId: 'user-1',
      userTimeZone: 'Europe/Warsaw',
      now
    });

    expect(result.calendarEvents.readiness.status).toBe('unavailable');
    expect(result.calendarEvents.eventResult).toEqual({
      outcome: 'unavailable',
      reason: 'Live Calendar is unavailable right now.'
    });
    expect(JSON.stringify(warning.mock.calls)).not.toContain('Dentist at 10:00');
  });
});
