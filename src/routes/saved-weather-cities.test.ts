import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getSession, replace } = vi.hoisted(() => ({
  getSession: vi.fn(),
  replace: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('$lib/server/db/savedLocationStore', () => ({
  userSavedWeatherCityStore: { load: vi.fn(), replace }
}));

const { PUT } = await import('./saved-weather-cities/+server');

const signedInUser = { user: { id: 'user-1', email: 'user@example.com', emailVerified: true } };
const request = (body: unknown) =>
  new Request('http://localhost/saved-weather-cities', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

describe('Saved Weather Cities endpoint', () => {
  beforeEach(() => {
    getSession.mockReset();
    replace.mockReset();
    replace.mockResolvedValue(undefined);
  });

  test('rejects Visitor writes', async () => {
    getSession.mockResolvedValue(null);

    const response = await PUT({ request: request({ cities: [] }) } as Parameters<typeof PUT>[0]);

    expect(response.status).toBe(401);
    expect(replace).not.toHaveBeenCalled();
  });

  test('validates and persists cities for the signed-in User', async () => {
    getSession.mockResolvedValue(signedInUser);
    const cities = [{ label: 'Warsaw, Poland', latitude: 52.2297, longitude: 21.0122 }];

    const response = await PUT({ request: request({ cities }) } as Parameters<typeof PUT>[0]);

    expect(response.status).toBe(200);
    expect(replace).toHaveBeenCalledWith('user-1', cities);
  });

  test('rejects duplicate city coordinates before persistence', async () => {
    getSession.mockResolvedValue(signedInUser);

    const response = await PUT({
      request: request({
        cities: [
          { label: 'Warsaw, Poland', latitude: 52.2297, longitude: 21.0122 },
          { label: 'Warsaw, Masovian Voivodeship, Poland', latitude: 52.2297, longitude: 21.0122 }
        ]
      })
    } as Parameters<typeof PUT>[0]);

    expect(response.status).toBe(400);
    expect(replace).not.toHaveBeenCalled();
  });
});
