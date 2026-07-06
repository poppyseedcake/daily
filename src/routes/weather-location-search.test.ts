import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getSession, providerCalls } = vi.hoisted(() => ({
  getSession: vi.fn(),
  providerCalls: [] as string[]
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      getSession
    }
  }
}));

vi.mock('$lib/server/weatherLocationGeocoding', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/weatherLocationGeocoding')>();

  return {
    ...original,
    deterministicWeatherLocationGeocodingProvider: {
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
    }
  };
});

const { GET } = await import('./weather-location-search/+server');

const searchWeatherLocations = (query: string) =>
  GET({
    request: new Request(`http://localhost/weather-location-search?q=${encodeURIComponent(query)}`)
  } as Parameters<typeof GET>[0]);

describe('Weather Location search endpoint', () => {
  beforeEach(() => {
    getSession.mockReset();
    providerCalls.length = 0;
  });

  test('rejects Visitor searches before provider calls', async () => {
    getSession.mockResolvedValue(null);

    const response = await searchWeatherLocations('Springfield');

    expect(response.status).toBe(401);
    expect(providerCalls).toEqual([]);
  });

  test('rejects invalid search input before provider calls', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    const response = await searchWeatherLocations('<script>');

    expect(response.status).toBe(400);
    expect(providerCalls).toEqual([]);
  });

  test('returns disambiguated city results for signed-in Users', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

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
