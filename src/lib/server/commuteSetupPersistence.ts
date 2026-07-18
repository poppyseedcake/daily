import {
  commuteDaysSchema,
  commuteRouteDraftSchema,
  commuteRouteUpdateSchema,
  defaultCommuteDays,
  type CommuteDay,
  type CommuteRoute
} from '$lib/commuteRoute';
import type { GoogleMapsRequestGateway } from './googleMapsRequestGateway';

type NewCommuteRoute = Omit<CommuteRoute, 'id' | 'enabled'>;

export type UserCommuteSetupStore = {
  load: (userId: string) => Promise<{ routes: CommuteRoute[]; days: CommuteDay[] } | null>;
  createRoute: (userId: string, route: NewCommuteRoute) => Promise<CommuteRoute | 'route-limit-reached'>;
  updateRoute: (userId: string, routeId: string, route: Omit<CommuteRoute, 'id'>) => Promise<CommuteRoute | null>;
  deleteRoute: (userId: string, routeId: string) => Promise<boolean>;
  saveDays: (userId: string, days: CommuteDay[]) => Promise<void>;
};

export const loadUserCommuteSetup = async (
  store: Pick<UserCommuteSetupStore, 'load'>,
  userId: string
) =>
  (await store.load(userId)) ?? { routes: [], days: [...defaultCommuteDays] };

export const createUserCommuteRoute = async (
  store: UserCommuteSetupStore,
  userId: string,
  route: unknown,
  commuteEstimateProvider: Pick<GoogleMapsRequestGateway, 'estimateCommute'>
): Promise<{ outcome: 'created'; route: CommuteRoute } | { outcome: 'invalid-route' | 'estimate-unavailable' | 'route-limit-reached' | 'save-failed' }> => {
  const result = commuteRouteDraftSchema.safeParse(route);
  if (!result.success) return { outcome: 'invalid-route' };

  try {
    const existingSetup = await store.load(userId);
    if ((existingSetup?.routes.length ?? 0) >= 5) return { outcome: 'route-limit-reached' };

    const estimate = await commuteEstimateProvider.estimateCommute({
      origin: result.data.origin,
      destination: result.data.destination
    });
    if (estimate.outcome !== 'available') return { outcome: 'estimate-unavailable' };

    const created = await store.createRoute(userId, {
      ...result.data,
      previewDurationMinutes: Math.round(estimate.estimate.durationMinutes)
    });
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
  route: unknown,
  commuteEstimateProvider: Pick<GoogleMapsRequestGateway, 'estimateCommute'>
): Promise<{ outcome: 'updated'; route: CommuteRoute } | { outcome: 'invalid-route' | 'estimate-unavailable' | 'not-found' | 'save-failed' }> => {
  const result = commuteRouteUpdateSchema.safeParse(route);
  if (!result.success) return { outcome: 'invalid-route' };

  try {
    const current = (await store.load(userId))?.routes.find((candidate) => candidate.id === routeId);
    if (!current) return { outcome: 'not-found' };

    let previewDurationMinutes = current.previewDurationMinutes ?? null;
    if (
      previewDurationMinutes === null ||
      !sameCoordinates(current.origin, result.data.origin) ||
      !sameCoordinates(current.destination, result.data.destination)
    ) {
      const estimate = await commuteEstimateProvider.estimateCommute({
        origin: result.data.origin,
        destination: result.data.destination
      });
      if (estimate.outcome !== 'available') return { outcome: 'estimate-unavailable' };
      previewDurationMinutes = Math.round(estimate.estimate.durationMinutes);
    }

    const updated = await store.updateRoute(userId, routeId, {
      ...result.data,
      previewDurationMinutes
    });
    return updated ? { outcome: 'updated', route: updated } : { outcome: 'not-found' };
  } catch {
    return { outcome: 'save-failed' };
  }
};

const sameCoordinates = (
  first: CommuteRoute['origin'],
  second: CommuteRoute['origin']
) => first.latitude === second.latitude && first.longitude === second.longitude;

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
