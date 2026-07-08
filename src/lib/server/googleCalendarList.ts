import { and, desc, eq } from 'drizzle-orm';
import { googleCalendarReadScope } from '$lib/googleCalendarScopes';
import { db } from '$lib/server/db';
import { authAccount } from '$lib/server/db/schema';
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

const tokenIsExpired = (expiresAt: Date | null) => expiresAt !== null && expiresAt <= new Date();

export const loadGoogleCalendarAccessToken = async (authUserId: string) => {
  const accounts = await db.query.authAccount.findMany({
    where: and(eq(authAccount.user_id, authUserId), eq(authAccount.provider_id, 'google')),
    orderBy: desc(authAccount.updated_at)
  });

  const account = accounts.find((row) => row.scope?.split(/\s+/).includes(googleCalendarReadScope));

  if (!account?.access_token || tokenIsExpired(account.access_token_expires_at)) {
    return null;
  }

  return account.access_token;
};
