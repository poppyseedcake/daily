import { describe, expect, test, vi } from 'vitest';
import { createGooglePlacesProvider } from './googlePlacesProvider';

describe('Google Places provider', () => {
  test('returns address predictions using the requested session token', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      suggestions: [{
        placePrediction: {
          placeId: 'place-1',
          text: { text: 'Marszałkowska 1, Warszawa, Polska' }
        }
      }]
    })));
    const provider = createGooglePlacesProvider({ apiKey: 'maps-key', fetcher });

    await expect(provider.searchAddresses({
      query: 'Marszałkowska 1',
      sessionToken: '550e8400-e29b-41d4-a716-446655440000'
    })).resolves.toEqual([
      { placeId: 'place-1', label: 'Marszałkowska 1, Warszawa, Polska' }
    ]);

    expect(fetcher).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places:autocomplete',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-goog-api-key': 'maps-key',
          'x-goog-fieldmask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text'
        })
      })
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      input: 'Marszałkowska 1',
      sessionToken: '550e8400-e29b-41d4-a716-446655440000',
      includedRegionCodes: ['pl'],
      languageCode: 'pl'
    });
  });

  test('resolves a selected prediction to its formatted address and coordinates', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      formattedAddress: 'Marszałkowska 1, 00-624 Warszawa, Polska',
      location: { latitude: 52.2191, longitude: 21.0182 }
    })));
    const provider = createGooglePlacesProvider({ apiKey: 'maps-key', fetcher });

    await expect(provider.resolveAddress({
      placeId: 'place/with space',
      sessionToken: '550e8400-e29b-41d4-a716-446655440000'
    })).resolves.toEqual({
      label: 'Marszałkowska 1, 00-624 Warszawa, Polska',
      latitude: 52.2191,
      longitude: 21.0182
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places/place%2Fwith%20space?sessionToken=550e8400-e29b-41d4-a716-446655440000&languageCode=pl',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-goog-fieldmask': 'formattedAddress,location'
        })
      })
    );
  });

  test('does not call Google when the API key is missing', async () => {
    const fetcher = vi.fn();
    const provider = createGooglePlacesProvider({ apiKey: '', fetcher });

    await expect(provider.searchAddresses({ query: 'Warszawa', sessionToken: 'token' }))
      .rejects.toThrow('Google Maps API key is not configured.');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
