import { json } from '@sveltejs/kit';
import {
  deterministicWeatherLocationGeocodingProvider,
  searchWeatherLocations
} from '$lib/server/weatherLocationGeocoding';

export const GET = async ({ request }) => {
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
