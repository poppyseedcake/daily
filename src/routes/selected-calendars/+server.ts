import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { userCalendarConnectionStore } from '$lib/server/db/calendarConnectionStore';
import {
  googleCalendarListProvider,
  loadGoogleCalendarAccessToken
} from '$lib/server/googleCalendarList';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { buildSavedSelectedCalendars, selectedCalendarIdSaveSchema } from '$lib/selectedCalendars';

export const PUT = async ({ request }) => {
  const session = await auth.api.getSession({
    headers: request.headers
  });
  const authState = authStateFromSession(session);

  if (authState.mode !== 'user') {
    return json({ outcome: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json({ outcome: 'invalid-selected-calendars' }, { status: 400 });
  }

  const result = selectedCalendarIdSaveSchema.safeParse(payload);

  if (!result.success) {
    return json({ outcome: 'invalid-selected-calendars' }, { status: 400 });
  }

  const calendarConnection = await userCalendarConnectionStore.load(authState.userId);

  if (calendarConnection.status !== 'connected') {
    return json({ outcome: 'calendar-not-connected' }, { status: 409 });
  }

  const accessToken = await loadGoogleCalendarAccessToken(authState.userId);

  if (!accessToken) {
    return json({ outcome: 'calendar-not-connected' }, { status: 409 });
  }

  const [providerCalendars, savedCalendars] = await Promise.all([
    googleCalendarListProvider.loadCalendars(accessToken),
    userCalendarConnectionStore.loadSelectedCalendars(authState.userId)
  ]);
  const selectedCalendars = buildSavedSelectedCalendars({
    providerCalendars,
    savedCalendars,
    selectedCalendarIds: result.data
  });

  await userCalendarConnectionStore.saveSelectedCalendars(authState.userId, selectedCalendars);

  return json({ outcome: 'saved' });
};
