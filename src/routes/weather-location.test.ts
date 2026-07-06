import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getSession, savedWeatherLocations } = vi.hoisted(() => ({
  getSession: vi.fn(),
  savedWeatherLocations: [] as Array<{ userId: string; location: unknown }>
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      getSession
    }
  }
}));

vi.mock('$lib/server/db/weatherLocationStore', () => ({
  userWeatherLocationStore: {
    async load() {
      return null;
    },
    async save(userId: string, location: unknown) {
      savedWeatherLocations.push({ userId, location });
    }
  }
}));

const { PUT } = await import('./weather-location/+server');

const putWeatherLocationBody = (body: BodyInit) =>
  PUT({
    request: new Request('http://localhost/weather-location', {
      method: 'PUT',
      body
    })
  } as Parameters<typeof PUT>[0]);

const putWeatherLocation = (body: unknown) => putWeatherLocationBody(JSON.stringify(body));

describe('Weather Location endpoint', () => {
  beforeEach(() => {
    getSession.mockReset();
    savedWeatherLocations.length = 0;
  });

  test('rejects Visitor Weather Location updates before writing', async () => {
    getSession.mockResolvedValue(null);

    const response = await putWeatherLocation({
      label: 'Warsaw, Masovian Voivodeship, Poland',
      latitude: 52.2297,
      longitude: 21.0122
    });

    expect(response.status).toBe(401);
    expect(savedWeatherLocations).toEqual([]);
  });

  test('rejects invalid signed-in User Weather Location updates before writing', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    const response = await putWeatherLocation({
      label: '<script>alert("x")</script>',
      latitude: 52.2297,
      longitude: 21.0122
    });

    expect(response.status).toBe(400);
    expect(savedWeatherLocations).toEqual([]);
  });

  test('saves valid Weather Location updates for the signed-in User only', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    const response = await putWeatherLocation({
      label: 'Warsaw, Masovian Voivodeship, Poland',
      latitude: 52.2297,
      longitude: 21.0122
    });

    expect(response.status).toBe(200);
    expect(savedWeatherLocations).toEqual([
      {
        userId: 'user-1',
        location: {
          label: 'Warsaw, Masovian Voivodeship, Poland',
          latitude: 52.2297,
          longitude: 21.0122
        }
      }
    ]);
  });
});
