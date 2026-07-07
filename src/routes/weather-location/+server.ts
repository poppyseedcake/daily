import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { userWeatherLocationStore } from '$lib/server/db/weatherLocationStore';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { saveUserWeatherLocation } from '$lib/server/weatherLocationPersistence';

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
    return json({ outcome: 'invalid-weather-location' }, { status: 400 });
  }

  const result = await saveUserWeatherLocation(userWeatherLocationStore, authState.userId, payload);

  if (result.outcome === 'invalid-weather-location') {
    return json(result, { status: 400 });
  }

  if (result.outcome === 'save-failed') {
    return json(result, { status: 500 });
  }

  return json(result);
};
