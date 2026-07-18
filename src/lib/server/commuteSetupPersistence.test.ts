import { describe, expect, test, vi } from 'vitest';
import {
  createUserCommuteRoute,
  loadUserCommuteSetup,
  saveUserCommuteDays,
  updateUserCommuteRoute,
  type UserCommuteSetupStore
} from './commuteSetupPersistence';

const route = {
  name: 'Morning commute',
  origin: { label: 'Home', latitude: 52.2297, longitude: 21.0122 },
  destination: { label: 'Office', latitude: 52.2318, longitude: 21.0067 }
};

const createStore = (): UserCommuteSetupStore => ({
  async load() { return null; },
  async createRoute(_userId, draft) { return { id: 'route-1', ...draft, enabled: true }; },
  async updateRoute(_userId, routeId, update) { return { id: routeId, ...update }; },
  async deleteRoute() { return true; },
  async saveDays() {}
});

describe('User Commute setup persistence', () => {
  const estimateProvider = {
    estimateCommute: vi.fn().mockResolvedValue({
      outcome: 'available' as const,
      estimate: { durationMinutes: 12 }
    })
  };

  test('defaults a new User to weekday Commute Days', async () => {
    await expect(loadUserCommuteSetup(createStore(), 'user-1')).resolves.toEqual({
      routes: [],
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    });
  });

  test('validates route fields and enabled-state changes before persistence', async () => {
    const store = createStore();
    await expect(createUserCommuteRoute(store, 'user-1', { ...route, name: '<unsafe>' }, estimateProvider)).resolves.toEqual({ outcome: 'invalid-route' });
    await expect(updateUserCommuteRoute(store, 'user-1', 'route-1', { ...route, enabled: 'yes' }, estimateProvider)).resolves.toEqual({ outcome: 'invalid-route' });
  });

  test('does not request an estimate when the User already has five Commute Routes', async () => {
    const store = createStore();
    store.load = async () => ({
      routes: Array.from({ length: 5 }, (_, index) => ({
        id: `route-${index}`,
        ...route,
        enabled: true,
        previewDurationMinutes: 12
      })),
      days: ['monday']
    });
    const provider = { estimateCommute: vi.fn() };

    await expect(createUserCommuteRoute(store, 'user-1', route, provider)).resolves.toEqual({
      outcome: 'route-limit-reached'
    });
    expect(provider.estimateCommute).not.toHaveBeenCalled();
  });

  test('refreshes the saved baseline only when a route endpoint changes', async () => {
    const store = createStore();
    const existingRoute = { id: 'route-1', ...route, enabled: true, previewDurationMinutes: 12 };
    store.load = async () => ({ routes: [existingRoute], days: ['monday'] });
    const provider = {
      estimateCommute: vi.fn().mockResolvedValue({
        outcome: 'available' as const,
        estimate: { durationMinutes: 19.6 }
      })
    };

    await expect(updateUserCommuteRoute(
      store,
      'user-1',
      'route-1',
      { ...route, destination: { ...route.destination, latitude: 52.4 }, enabled: true },
      provider
    )).resolves.toMatchObject({
      outcome: 'updated',
      route: { previewDurationMinutes: 20 }
    });
    expect(provider.estimateCommute).toHaveBeenCalledOnce();

    provider.estimateCommute.mockClear();
    await updateUserCommuteRoute(store, 'user-1', 'route-1', { ...route, name: 'Renamed', enabled: true }, provider);
    expect(provider.estimateCommute).not.toHaveBeenCalled();
  });

  test('populates a missing baseline when an existing migrated route is saved', async () => {
    const store = createStore();
    store.load = async () => ({
      routes: [{ id: 'route-1', ...route, enabled: true, previewDurationMinutes: null }],
      days: ['monday']
    });
    const provider = {
      estimateCommute: vi.fn().mockResolvedValue({
        outcome: 'available' as const,
        estimate: { durationMinutes: 16 }
      })
    };

    await expect(updateUserCommuteRoute(
      store,
      'user-1',
      'route-1',
      { ...route, enabled: true },
      provider
    )).resolves.toMatchObject({ route: { previewDurationMinutes: 16 } });
    expect(provider.estimateCommute).toHaveBeenCalledOnce();
  });

  test('validates duplicate and unsupported Commute Days before persistence', async () => {
    const store = createStore();
    await expect(saveUserCommuteDays(store, 'user-1', ['monday', 'monday'])).resolves.toEqual({ outcome: 'invalid-commute-days' });
    await expect(saveUserCommuteDays(store, 'user-1', ['weekday'])).resolves.toEqual({ outcome: 'invalid-commute-days' });
  });
});
