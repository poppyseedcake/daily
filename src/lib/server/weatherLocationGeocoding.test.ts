import { describe, expect, test } from 'vitest';
import { deterministicWeatherLocationGeocodingProvider } from './weatherLocationGeocoding';

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
});
