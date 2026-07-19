import { json } from '@sveltejs/kit';
import { openMeteoWeatherLocationGeocodingProvider, searchWeatherLocations } from '$lib/server/weatherLocationGeocoding';

export const GET = async ({ request }) => {
  const result = await searchWeatherLocations(
    openMeteoWeatherLocationGeocodingProvider(),
    new URL(request.url).searchParams.get('q') ?? ''
  );
  if (result.outcome === 'invalid-query') return json(result, { status: 400 });
  if (result.outcome === 'unavailable') return json(result, { status: 503 });
  return json(result);
};
