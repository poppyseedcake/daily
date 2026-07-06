import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { authStateFromSession } from '$lib/server/pageAuthState';
import {
  deterministicWeatherLocationGeocodingProvider,
  searchWeatherLocations
} from '$lib/server/weatherLocationGeocoding';

export const GET = async ({ request }) => {
  const session = await auth.api.getSession({
    headers: request.headers
  });
  const authState = authStateFromSession(session);

  if (authState.mode !== 'user') {
    return json({ outcome: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const result = await searchWeatherLocations(
    deterministicWeatherLocationGeocodingProvider,
    url.searchParams.get('q') ?? ''
  );

  if (result.outcome === 'invalid-query') {
    return json(result, { status: 400 });
  }

  return json(result);
};
