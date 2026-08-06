import { z } from 'zod';
import type { GoogleMapsProvider } from './googleMapsRequestGateway';

const responseSchema = z.object({
  routes: z.array(z.object({
    duration: z.string().regex(/^\d+(?:\.\d+)?s$/),
    staticDuration: z.string().regex(/^\d+(?:\.\d+)?s$/)
  }))
});

const durationMinutes = (value: string) => {
  const seconds = Number.parseFloat(value.slice(0, -1));
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('Google Routes returned an invalid duration.');
  }

  return seconds / 60;
};

export const createGoogleRoutesProvider = ({ apiKey, fetcher = fetch }: {
  apiKey: string;
  fetcher?: typeof fetch;
}): Pick<GoogleMapsProvider, 'estimateCommute'> => ({
  async estimateCommute({ origin, destination }) {
    if (!apiKey) throw new Error('Google Maps API key is not configured.');

    const response = await fetcher('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
        'x-goog-fieldmask': 'routes.duration,routes.staticDuration'
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
        destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE'
      })
    });

    if (!response.ok) throw new Error('Google Routes request failed.');
    const result = responseSchema.parse(await response.json());
    const route = result.routes[0];
    return route
      ? {
          durationMinutes: durationMinutes(route.duration),
          staticDurationMinutes: durationMinutes(route.staticDuration)
        }
      : null;
  }
});
