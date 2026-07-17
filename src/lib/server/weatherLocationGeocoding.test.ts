import { describe, expect, test } from 'vitest';
import {
  deterministicWeatherLocationGeocodingProvider,
  openMeteoWeatherLocationGeocodingProvider,
  searchWeatherLocations
} from './weatherLocationGeocoding';

describe('Weather Location geocoding', () => {
  test('matches deterministic city results case-insensitively', async () => {
    await expect(deterministicWeatherLocationGeocodingProvider.search('illinois')).resolves.toEqual([
      {
        label: 'Springfield, Illinois, United States',
        latitude: 39.799,
        longitude: -89.644
      }
    ]);
  });

  test('searches Open-Meteo and maps ranked city suggestions', async () => {
    const fetch = async (input: string | URL | Request) => {
      expect(String(input)).toBe(
        'https://geocoding-api.open-meteo.com/v1/search?name=Krak&count=8&language=en&format=json'
      );

      return new Response(
        JSON.stringify({
          results: [
            {
              name: 'Krakow',
              admin1: 'Lesser Poland',
              country: 'Poland',
              latitude: 50.06143,
              longitude: 19.93658
            }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };

    await expect(openMeteoWeatherLocationGeocodingProvider(fetch).search('Krak')).resolves.toEqual([
      {
        label: 'Krakow, Lesser Poland, Poland',
        latitude: 50.06143,
        longitude: 19.93658
      }
    ]);
  });

  test('returns a typed unavailable outcome when geocoding fails', async () => {
    await expect(
      searchWeatherLocations(
        {
          async search() {
            throw new Error('Geocoding provider failed.');
          }
        },
        'Warsaw'
      )
    ).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'Weather Location search is unavailable right now.'
    });
  });
});
