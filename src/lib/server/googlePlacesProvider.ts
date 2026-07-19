import { z } from 'zod';
import type { GoogleMapsProvider } from './googleMapsRequestGateway';

const autocompleteResponseSchema = z.object({
  suggestions: z.array(z.object({
    placePrediction: z.object({
      placeId: z.string().min(1),
      text: z.object({ text: z.string().min(1) })
    }).optional()
  })).default([])
});

const placeDetailsResponseSchema = z.object({
  formattedAddress: z.string().min(1),
  location: z.object({
    latitude: z.number().finite().gte(-90).lte(90),
    longitude: z.number().finite().gte(-180).lte(180)
  })
});

export const createGooglePlacesProvider = ({ apiKey, fetcher = fetch }: {
  apiKey: string;
  fetcher?: typeof fetch;
}): Pick<GoogleMapsProvider, 'searchAddresses' | 'resolveAddress'> => {
  const requireApiKey = () => {
    if (!apiKey) throw new Error('Google Maps API key is not configured.');
  };

  return {
    async searchAddresses({ query, sessionToken }) {
      requireApiKey();
      const response = await fetcher('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
          'x-goog-fieldmask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text'
        },
        body: JSON.stringify({
          input: query,
          sessionToken,
          includedRegionCodes: ['pl'],
          languageCode: 'pl'
        })
      });
      if (!response.ok) throw new Error('Google Places Autocomplete request failed.');

      return autocompleteResponseSchema.parse(await response.json()).suggestions.flatMap(({ placePrediction }) =>
        placePrediction ? [{ placeId: placePrediction.placeId, label: placePrediction.text.text }] : []
      );
    },

    async resolveAddress({ placeId, sessionToken }) {
      requireApiKey();
      const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
      url.searchParams.set('sessionToken', sessionToken);
      url.searchParams.set('languageCode', 'pl');
      const response = await fetcher(url.toString(), {
        headers: {
          'x-goog-api-key': apiKey,
          'x-goog-fieldmask': 'formattedAddress,location'
        }
      });
      if (!response.ok) throw new Error('Google Place Details request failed.');
      const result = placeDetailsResponseSchema.parse(await response.json());
      return {
        label: result.formattedAddress,
        latitude: result.location.latitude,
        longitude: result.location.longitude
      };
    }
  };
};
