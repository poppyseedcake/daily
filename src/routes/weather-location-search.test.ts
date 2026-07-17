import { beforeEach, describe, expect, test, vi } from 'vitest';

const { providerCalls } = vi.hoisted(() => ({
  providerCalls: [] as string[]
}));

vi.mock('$lib/server/weatherLocationGeocoding', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/weatherLocationGeocoding')>();

  return {
    ...original,
    openMeteoWeatherLocationGeocodingProvider: () => ({
      async search(query: string) {
        providerCalls.push(query);

        return [
          {
            label: 'Springfield, Illinois, United States',
            latitude: 39.799,
            longitude: -89.644
          },
          {
            label: 'Springfield, Massachusetts, United States',
            latitude: 42.101,
            longitude: -72.589
          }
        ];
      }
    })
  };
});

const { GET } = await import('./weather-location-search/+server');

const searchWeatherLocations = (query: string) =>
  GET({
    request: new Request(`http://localhost/weather-location-search?q=${encodeURIComponent(query)}`)
  } as Parameters<typeof GET>[0]);

describe('Weather Location search endpoint', () => {
  beforeEach(() => {
    providerCalls.length = 0;
  });

  test('rejects invalid search input before provider calls', async () => {
    const response = await searchWeatherLocations('<script>');

    expect(response.status).toBe(400);
    expect(providerCalls).toEqual([]);
  });

  test('returns disambiguated city results for Visitors and signed-in Users', async () => {
    const response = await searchWeatherLocations('Springfield');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      outcome: 'found',
      locations: [
        {
          label: 'Springfield, Illinois, United States',
          latitude: 39.799,
          longitude: -89.644
        },
        {
          label: 'Springfield, Massachusetts, United States',
          latitude: 42.101,
          longitude: -72.589
        }
      ]
    });
    expect(providerCalls).toEqual(['Springfield']);
  });
});
