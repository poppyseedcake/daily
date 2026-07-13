import { describe, expect, test } from 'vitest';
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
  test('defaults a new User to weekday Commute Days', async () => {
    await expect(loadUserCommuteSetup(createStore(), 'user-1')).resolves.toEqual({
      routes: [],
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    });
  });

  test('validates route fields and enabled-state changes before persistence', async () => {
    const store = createStore();
    await expect(createUserCommuteRoute(store, 'user-1', { ...route, name: '<unsafe>' })).resolves.toEqual({ outcome: 'invalid-route' });
    await expect(updateUserCommuteRoute(store, 'user-1', 'route-1', { ...route, enabled: 'yes' })).resolves.toEqual({ outcome: 'invalid-route' });
  });

  test('validates duplicate and unsupported Commute Days before persistence', async () => {
    const store = createStore();
    await expect(saveUserCommuteDays(store, 'user-1', ['monday', 'monday'])).resolves.toEqual({ outcome: 'invalid-commute-days' });
    await expect(saveUserCommuteDays(store, 'user-1', ['weekday'])).resolves.toEqual({ outcome: 'invalid-commute-days' });
  });
});
