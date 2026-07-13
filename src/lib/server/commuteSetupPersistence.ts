import {
  commuteDaysSchema,
  commuteRouteDraftSchema,
  commuteRouteUpdateSchema,
  defaultCommuteDays,
  type CommuteDay,
  type CommuteRoute
} from '$lib/commuteRoute';

export type UserCommuteSetupStore = {
  load: (userId: string) => Promise<{ routes: CommuteRoute[]; days: CommuteDay[] } | null>;
  createRoute: (userId: string, route: Omit<CommuteRoute, 'id' | 'enabled'>) => Promise<CommuteRoute | 'route-limit-reached'>;
  updateRoute: (userId: string, routeId: string, route: Omit<CommuteRoute, 'id'>) => Promise<CommuteRoute | null>;
  deleteRoute: (userId: string, routeId: string) => Promise<boolean>;
  saveDays: (userId: string, days: CommuteDay[]) => Promise<void>;
};

export const loadUserCommuteSetup = async (store: UserCommuteSetupStore, userId: string) =>
  (await store.load(userId)) ?? { routes: [], days: [...defaultCommuteDays] };

export const createUserCommuteRoute = async (
  store: UserCommuteSetupStore,
  userId: string,
  route: unknown
): Promise<{ outcome: 'created'; route: CommuteRoute } | { outcome: 'invalid-route' | 'route-limit-reached' | 'save-failed' }> => {
  const result = commuteRouteDraftSchema.safeParse(route);
  if (!result.success) return { outcome: 'invalid-route' };

  try {
    const created = await store.createRoute(userId, result.data);
    return created === 'route-limit-reached'
      ? { outcome: 'route-limit-reached' }
      : { outcome: 'created', route: created };
  } catch {
    return { outcome: 'save-failed' };
  }
};

export const updateUserCommuteRoute = async (
  store: UserCommuteSetupStore,
  userId: string,
  routeId: string,
  route: unknown
): Promise<{ outcome: 'updated'; route: CommuteRoute } | { outcome: 'invalid-route' | 'not-found' | 'save-failed' }> => {
  const result = commuteRouteUpdateSchema.safeParse(route);
  if (!result.success) return { outcome: 'invalid-route' };

  try {
    const updated = await store.updateRoute(userId, routeId, result.data);
    return updated ? { outcome: 'updated', route: updated } : { outcome: 'not-found' };
  } catch {
    return { outcome: 'save-failed' };
  }
};

export const saveUserCommuteDays = async (
  store: UserCommuteSetupStore,
  userId: string,
  days: unknown
): Promise<{ outcome: 'saved' | 'invalid-commute-days' | 'save-failed' }> => {
  const result = commuteDaysSchema.safeParse(days);
  if (!result.success) return { outcome: 'invalid-commute-days' };

  try {
    await store.saveDays(userId, result.data);
    return { outcome: 'saved' };
  } catch {
    return { outcome: 'save-failed' };
  }
};
