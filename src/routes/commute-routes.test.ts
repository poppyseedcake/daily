import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getSession, createRoute, updateRoute, deleteRoute, saveDays } = vi.hoisted(() => ({
  getSession: vi.fn(),
  createRoute: vi.fn(),
  updateRoute: vi.fn(),
  deleteRoute: vi.fn(),
  saveDays: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('$lib/server/db/commuteSetupStore', () => ({
  userCommuteSetupStore: { createRoute, updateRoute, deleteRoute, saveDays, async load() { return null; } }
}));

const { POST } = await import('./commute-routes/+server');
const { PUT, DELETE } = await import('./commute-routes/[routeId]/+server');
const { PUT: saveCommuteDays } = await import('./commute-days/+server');

const route = {
  name: 'Morning commute',
  origin: { label: 'Home', latitude: 52.2297, longitude: 21.0122 },
  destination: { label: 'Office', latitude: 52.2318, longitude: 21.0067 }
};
const signedInUser = { user: { id: 'user-1', email: 'user@example.com', emailVerified: true } };
const request = (url: string, method: string, body?: unknown) => new Request(url, {
  method,
  headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body)
});

describe('User Commute endpoints', () => {
  beforeEach(() => {
    getSession.mockReset();
    createRoute.mockReset();
    updateRoute.mockReset();
    deleteRoute.mockReset();
    saveDays.mockReset();
  });

  test('rejects Visitor writes before they reach the Commute persistence store', async () => {
    getSession.mockResolvedValue(null);
    const response = await POST({ request: request('http://localhost/commute-routes', 'POST', route) } as Parameters<typeof POST>[0]);
    expect(response.status).toBe(401);
    expect(createRoute).not.toHaveBeenCalled();
  });

  test('validates crafted route and weekday payloads before writing', async () => {
    getSession.mockResolvedValue(signedInUser);
    const invalidRoute = await POST({ request: request('http://localhost/commute-routes', 'POST', { ...route, name: '<unsafe>' }) } as Parameters<typeof POST>[0]);
    const invalidDays = await saveCommuteDays({ request: request('http://localhost/commute-days', 'PUT', ['monday', 'monday']) } as Parameters<typeof saveCommuteDays>[0]);
    expect(invalidRoute.status).toBe(400);
    expect(invalidDays.status).toBe(400);
    expect(createRoute).not.toHaveBeenCalled();
    expect(saveDays).not.toHaveBeenCalled();
  });

  test('scopes update and deletion to the authenticated User', async () => {
    getSession.mockResolvedValue(signedInUser);
    updateRoute.mockResolvedValue({ id: 'route-1', ...route, enabled: false });
    deleteRoute.mockResolvedValue(true);
    const updated = await PUT({ request: request('http://localhost/commute-routes/route-1', 'PUT', { ...route, enabled: false }), params: { routeId: 'route-1' } } as Parameters<typeof PUT>[0]);
    const deleted = await DELETE({ request: request('http://localhost/commute-routes/route-1', 'DELETE'), params: { routeId: 'route-1' } } as Parameters<typeof DELETE>[0]);
    expect(updated.status).toBe(200);
    expect(deleted.status).toBe(200);
    expect(updateRoute).toHaveBeenCalledWith('user-1', 'route-1', expect.objectContaining({ enabled: false }));
    expect(deleteRoute).toHaveBeenCalledWith('user-1', 'route-1');
  });
});
