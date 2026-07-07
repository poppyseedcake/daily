import { describe, expect, test } from 'vitest';
import {
  deterministicWeatherLocationGeocodingProvider,
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
