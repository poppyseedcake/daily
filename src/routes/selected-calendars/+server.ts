import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { userCalendarConnectionStore } from '$lib/server/db/calendarConnectionStore';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { selectedCalendarSaveSchema } from '$lib/selectedCalendars';

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

  const result = selectedCalendarSaveSchema.safeParse(payload);

  if (!result.success) {
    return json({ outcome: 'invalid-selected-calendars' }, { status: 400 });
  }

  await userCalendarConnectionStore.saveSelectedCalendars(authState.userId, result.data);

  return json({ outcome: 'saved' });
};
