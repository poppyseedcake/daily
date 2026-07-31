import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getSession, replace } = vi.hoisted(() => ({
  getSession: vi.fn(),
  replace: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('$lib/server/db/savedLocationStore', () => ({
  userSavedCommuteAddressStore: { load: vi.fn(), replace }
}));

const { PUT } = await import('./saved-commute-addresses/+server');

const signedInUser = { user: { id: 'user-1', email: 'user@example.com', emailVerified: true } };
const request = (body: unknown) =>
  new Request('http://localhost/saved-commute-addresses', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

describe('Saved Commute Addresses endpoint', () => {
  beforeEach(() => {
    getSession.mockReset();
    replace.mockReset();
    replace.mockResolvedValue(undefined);
  });

  test('rejects Visitor writes', async () => {
    getSession.mockResolvedValue(null);

    const response = await PUT(
      { request: request({ addresses: [] }) } as Parameters<typeof PUT>[0]
    );

    expect(response.status).toBe(401);
    expect(replace).not.toHaveBeenCalled();
  });

  test('validates and persists exact addresses for the signed-in User', async () => {
    getSession.mockResolvedValue(signedInUser);
    const addresses = [{ label: 'Warsaw Central Station', latitude: 52.2285, longitude: 21.0037 }];

    const response = await PUT({ request: request({ addresses }) } as Parameters<typeof PUT>[0]);

    expect(response.status).toBe(200);
    expect(replace).toHaveBeenCalledWith('user-1', addresses);
  });

  test('rejects duplicate address coordinates before persistence', async () => {
    getSession.mockResolvedValue(signedInUser);

    const response = await PUT({
      request: request({
        addresses: [
          { label: 'Home', latitude: 52.2297, longitude: 21.0122 },
          { label: 'Home entrance', latitude: 52.2297, longitude: 21.0122 }
        ]
      })
    } as Parameters<typeof PUT>[0]);

    expect(response.status).toBe(400);
    expect(replace).not.toHaveBeenCalled();
  });
});
