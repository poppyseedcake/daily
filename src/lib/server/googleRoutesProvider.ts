import { z } from 'zod';
import type { GoogleMapsProvider } from './googleMapsRequestGateway';

const responseSchema = z.object({
  routes: z.array(z.object({ duration: z.string().regex(/^\d+(?:\.\d+)?s$/) })).min(1)
});

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
        'x-goog-fieldmask': 'routes.duration'
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
    return { durationMinutes: Number.parseFloat(result.routes[0].duration.slice(0, -1)) / 60 };
  }
});
