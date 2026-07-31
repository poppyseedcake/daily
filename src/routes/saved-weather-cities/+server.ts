import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { userSavedWeatherCityStore } from '$lib/server/db/savedLocationStore';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { saveUserSavedWeatherCities } from '$lib/server/savedLocationPersistence';

export const PUT = async ({ request }) => {
  const authState = authStateFromSession(await auth.api.getSession({ headers: request.headers }));

  if (authState.mode !== 'user') {
    return json({ outcome: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ outcome: 'invalid-saved-weather-cities' }, { status: 400 });
  }

  const result = await saveUserSavedWeatherCities(
    userSavedWeatherCityStore,
    authState.userId,
    payload && typeof payload === 'object' && 'cities' in payload
      ? (payload as { cities: unknown }).cities
      : payload
  );

  return json(result, {
    status:
      result.outcome === 'saved'
        ? 200
        : result.outcome === 'invalid-saved-weather-cities'
          ? 400
          : 500
  });
};
