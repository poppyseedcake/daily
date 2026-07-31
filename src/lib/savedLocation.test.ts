import { describe, expect, test } from 'vitest';
import {
  sameSavedLocationCoordinates,
  savedCommuteAddressesSchema,
  savedWeatherCitiesSchema
} from './savedLocation';

describe('Saved Weather Cities and Saved Commute Addresses', () => {
  test('keeps City and Address lists independently bounded and de-duplicated', () => {
    const cities = [
      { label: 'Warsaw, Poland', latitude: 52.2297, longitude: 21.0122 },
      { label: 'Wrocław, Poland', latitude: 51.1079, longitude: 17.0385 }
    ];
    const addresses = [
      { label: 'Home', latitude: 52.2297, longitude: 21.0122 },
      { label: 'Office', latitude: 52.2318, longitude: 21.0067 }
    ];

    expect(savedWeatherCitiesSchema.parse(cities)).toEqual(cities);
    expect(savedCommuteAddressesSchema.parse(addresses)).toEqual(addresses);
    expect(
      savedWeatherCitiesSchema.safeParse([
        cities[0],
        { label: 'Same coordinates', latitude: cities[0].latitude, longitude: cities[0].longitude }
      ]).success
    ).toBe(false);
  });

  test('compares point coordinates while allowing each list to use its own labels', () => {
    expect(
      sameSavedLocationCoordinates(
        { label: 'Warsaw, Poland', latitude: 52.2297, longitude: 21.0122 },
        { label: 'Home entrance, Warsaw', latitude: 52.2297, longitude: 21.0122 }
      )
    ).toBe(true);
  });
});
