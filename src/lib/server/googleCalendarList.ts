import { and, desc, eq } from 'drizzle-orm';
import { googleCalendarReadScope, parseGoogleProviderScopes } from '$lib/googleCalendarScopes';
import { db } from '$lib/server/db';
import { authAccount } from '$lib/server/db/schema';
import { auth } from '$lib/server/auth';
import type { CalendarEventProvider, CalendarProviderEvent } from '$lib/calendar';
import type { ProviderCalendarListEntry } from '$lib/selectedCalendars';

export type GoogleCalendarListProvider = {
  loadCalendars: (accessToken: string) => Promise<ProviderCalendarListEntry[]>;
};

type GoogleCalendarListResponse = {
  items?: Array<{
    id?: string;
    summary?: string;
    backgroundColor?: string;
    primary?: boolean;
  }>;
};

type GoogleCalendarEventsResponse = {
  items?: Array<{
    id?: string;
    summary?: string;
    status?: string;
    start?: {
      dateTime?: string;
      date?: string;
    };
    end?: {
      dateTime?: string;
      date?: string;
    };
    attendees?: Array<{
      self?: boolean;
      responseStatus?: string;
    }>;
  }>;
};

class GoogleCalendarEventsRequestError extends Error {
  constructor(readonly status: number) {
    super(`Google Calendar events request failed: ${status}`);
  }
}

export const googleCalendarListProvider: GoogleCalendarListProvider = {
  async loadCalendars(accessToken) {
    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Google Calendar list request failed: ${response.status}`);
    }

    const payload = (await response.json()) as GoogleCalendarListResponse;

    return (payload.items ?? []).flatMap((calendar) =>
      calendar.id && calendar.summary
        ? [
            {
              id: calendar.id,
              summary: calendar.summary,
              backgroundColor: calendar.backgroundColor ?? null,
              primary: calendar.primary === true
            }
          ]
        : []
    );
  }
};

export const googleCalendarEventProvider = (accessToken: string): CalendarEventProvider => ({
  async fetchEvents({ calendarIds, timeMin, timeMax, timeZone }) {
    try {
      const eventLists = await Promise.all(
        calendarIds.map(async (calendarId) => {
          const params = new URLSearchParams({
            singleEvents: 'true',
            orderBy: 'startTime',
            timeMin,
            timeMax,
            timeZone
          });
          const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
            {
              headers: {
                authorization: `Bearer ${accessToken}`
              }
            }
          );

          if (!response.ok) {
            throw new GoogleCalendarEventsRequestError(response.status);
          }

          const payload = (await response.json()) as GoogleCalendarEventsResponse;

          return (payload.items ?? []).flatMap((event): CalendarProviderEvent[] => {
            if (
              !event.id ||
              !event.summary ||
              event.status === 'cancelled' ||
              event.attendees?.some(
                (attendee) => attendee.self === true && attendee.responseStatus === 'declined'
              )
            ) {
              return [];
            }

            if (event.start?.dateTime && event.end?.dateTime) {
              return [
                {
                  kind: 'timed',
                  id: event.id,
                  calendarId,
                  calendarSummary: '',
                  summary: event.summary,
                  start: event.start.dateTime,
                  end: event.end.dateTime
                }
              ];
            }

            if (event.start?.date && event.end?.date) {
              return [
                {
                  kind: 'all-day',
                  id: event.id,
                  calendarId,
                  calendarSummary: '',
                  summary: event.summary,
                  startDate: event.start.date,
                  endDate: event.end.date
                }
              ];
            }

            return [];
          });
        })
      );

      return { outcome: 'available', events: eventLists.flat() };
    } catch (error) {
      return {
        outcome: 'unavailable',
        reason:
          error instanceof GoogleCalendarEventsRequestError &&
          (error.status === 401 || error.status === 403)
            ? 'Reconnect Google Calendar to include Calendar Events.'
            : 'Live Calendar is unavailable right now.'
      };
    }
  }
});

const tokenIsExpired = (expiresAt: Date | null) => expiresAt !== null && expiresAt <= new Date();

export const loadGoogleCalendarAccessToken = async (authUserId: string) => {
  const accounts = await db.query.authAccount.findMany({
    where: and(eq(authAccount.user_id, authUserId), eq(authAccount.provider_id, 'google')),
    orderBy: desc(authAccount.updated_at)
  });

  const account = accounts.find((row) =>
    parseGoogleProviderScopes(row.scope).includes(googleCalendarReadScope)
  );

  if (!account) {
    return null;
  }

  if (account.access_token && !tokenIsExpired(account.access_token_expires_at)) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    return null;
  }

  try {
    const refreshedTokens = await auth.api.refreshToken({
      body: {
        providerId: 'google',
        accountId: account.account_id,
        userId: authUserId
      }
    });

    return refreshedTokens.accessToken ?? null;
  } catch {
    return null;
  }
};
