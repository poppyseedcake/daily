import {
  buildCalendarEventFetchRequest,
  type CalendarEventProvider,
  type LoadedCalendarEvents
} from '$lib/calendar';
import {
  calendarReadinessForUnavailableCredentials,
  calendarReadinessForUnavailableProvider,
  calendarReadinessForUserConnection,
  type UserCalendarReadinessConnection
} from '$lib/calendarReadiness';
import {
  buildSelectedCalendarConfiguration,
  type SavedSelectedCalendar,
  type SelectedCalendarConfiguration
} from '$lib/selectedCalendars';
import type { UserTimeZone } from '$lib/summaryConfiguration';
import type { GoogleCalendarListProvider } from './googleCalendarList';

type CalendarEventsConnectionStore = {
  load(userId: string): Promise<UserCalendarReadinessConnection>;
  loadSelectedCalendars(userId: string): Promise<SavedSelectedCalendar[]>;
  saveSelectedCalendars(userId: string, calendars: SavedSelectedCalendar[]): Promise<void>;
};

export type UserCalendarEventsModule = {
  load(input: {
    userId: string;
    userTimeZone: UserTimeZone;
    now: Date;
    refreshSelectedCalendarConfiguration?: boolean;
  }): Promise<{
    calendarEvents: LoadedCalendarEvents;
    selectedCalendarConfiguration: SelectedCalendarConfiguration | null;
  }>;
};

export type UserCalendarEventsDependencies = {
  connectionStore: CalendarEventsConnectionStore;
  loadAccessToken(userId: string): Promise<string | null>;
  eventProvider(accessToken: string): CalendarEventProvider;
  calendarListProvider: GoogleCalendarListProvider;
  isAuthorizationFailure(error: unknown): boolean;
};

const notRequested = (
  readiness: LoadedCalendarEvents['readiness'],
  selectedCalendars: SavedSelectedCalendar[] = []
): LoadedCalendarEvents => ({
  readiness,
  selectedCalendars,
  eventResult: { outcome: 'not-requested' }
});

const unavailable = (
  selectedCalendars: SavedSelectedCalendar[],
  reason = 'Live Calendar is unavailable right now.'
): LoadedCalendarEvents => ({
  readiness:
    reason === 'Reconnect Google Calendar to include Calendar Events.'
      ? calendarReadinessForUnavailableCredentials()
      : calendarReadinessForUnavailableProvider(),
  selectedCalendars,
  eventResult: { outcome: 'unavailable', reason }
});

const safeProviderReason = (reason: string) =>
  reason === 'Reconnect Google Calendar to include Calendar Events.'
    ? reason
    : 'Live Calendar is unavailable right now.';

export const createUserCalendarEvents = ({
  connectionStore,
  loadAccessToken,
  eventProvider,
  calendarListProvider,
  isAuthorizationFailure
}: UserCalendarEventsDependencies): UserCalendarEventsModule => ({
  async load({
    userId,
    userTimeZone,
    now,
    refreshSelectedCalendarConfiguration = false
  }) {
    let connection: UserCalendarReadinessConnection;
    try {
      connection = await connectionStore.load(userId);
    } catch {
      console.warn('Failed to load Calendar connection.', {
        classification: 'calendar-connection-unavailable'
      });
      return {
        calendarEvents: unavailable([]),
        selectedCalendarConfiguration: null
      };
    }

    if (connection.status !== 'connected') {
      return {
        calendarEvents: notRequested(calendarReadinessForUserConnection(connection)),
        selectedCalendarConfiguration: null
      };
    }

    let selectedCalendars: SavedSelectedCalendar[];
    try {
      selectedCalendars = await connectionStore.loadSelectedCalendars(userId);
    } catch {
      console.warn('Failed to load Selected Calendars.', {
        classification: 'selected-calendars-unavailable'
      });
      return {
        calendarEvents: unavailable([]),
        selectedCalendarConfiguration: null
      };
    }

    let accessToken: string | null | undefined;
    const resolveAccessToken = async () => {
      if (accessToken !== undefined) return accessToken;
      try {
        accessToken = await loadAccessToken(userId);
      } catch {
        accessToken = null;
      }
      return accessToken;
    };

    let selectedCalendarConfiguration: SelectedCalendarConfiguration | null = null;
    if (refreshSelectedCalendarConfiguration) {
      const token = await resolveAccessToken();
      if (!token) {
        return {
          calendarEvents: unavailable(
            selectedCalendars,
            'Reconnect Google Calendar to include Calendar Events.'
          ),
          selectedCalendarConfiguration: null
        };
      }

      try {
        const providerCalendars = await calendarListProvider.loadCalendars(token);
        selectedCalendarConfiguration = buildSelectedCalendarConfiguration({
          providerCalendars,
          savedCalendars: selectedCalendars
        });

        if (
          selectedCalendars.length === 0 &&
          selectedCalendarConfiguration.selectedCalendarIds.length > 0
        ) {
          selectedCalendars = selectedCalendarConfiguration.calendars
            .filter((calendar) => calendar.selected)
            .map(({ selected: _selected, unavailable: _unavailable, ...calendar }) => calendar);
          await connectionStore.saveSelectedCalendars(userId, selectedCalendars);
        }
      } catch (error) {
        if (isAuthorizationFailure(error)) {
          return {
            calendarEvents: unavailable(
              selectedCalendars,
              'Reconnect Google Calendar to include Calendar Events.'
            ),
            selectedCalendarConfiguration: null
          };
        }

        console.warn('Failed to refresh Selected Calendar configuration.', {
          classification: 'calendar-list-unavailable'
        });
      }
    }

    if (selectedCalendars.length === 0) {
      return {
        calendarEvents: notRequested(
          calendarReadinessForUserConnection(connection),
          selectedCalendars
        ),
        selectedCalendarConfiguration
      };
    }

    const token = await resolveAccessToken();
    if (!token) {
      return {
        calendarEvents: unavailable(
          selectedCalendars,
          'Reconnect Google Calendar to include Calendar Events.'
        ),
        selectedCalendarConfiguration
      };
    }

    try {
      const result = await eventProvider(token).fetchEvents(
        buildCalendarEventFetchRequest({ selectedCalendars, userTimeZone, now })
      );
      if (result.outcome === 'unavailable') {
        return {
          calendarEvents: unavailable(selectedCalendars, safeProviderReason(result.reason)),
          selectedCalendarConfiguration
        };
      }

      return {
        calendarEvents: {
          readiness: calendarReadinessForUserConnection(connection),
          selectedCalendars,
          eventResult: result
        },
        selectedCalendarConfiguration
      };
    } catch {
      console.warn('Failed to load Calendar Events.', {
        classification: 'calendar-events-unavailable'
      });
      return {
        calendarEvents: unavailable(selectedCalendars),
        selectedCalendarConfiguration
      };
    }
  }
});
