import {
  commuteRouteDraftSchema,
  commuteRouteUpdateSchema,
  type CommuteRoute
} from '$lib/commuteRoute';
import type { GoogleMapsRequestGateway } from './googleMapsRequestGateway';

type NewCommuteRoute = Omit<CommuteRoute, 'id' | 'enabled'>;

const commuteRouteCreationLocks = new Map<string, Promise<void>>();

const withCommuteRouteCreationLock = async <Result>(
  userId: string,
  create: () => Promise<Result>
): Promise<Result> => {
  const previous = commuteRouteCreationLocks.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  commuteRouteCreationLocks.set(userId, current);
  await previous;

  try {
    return await create();
  } finally {
    release();
    if (commuteRouteCreationLocks.get(userId) === current) {
      commuteRouteCreationLocks.delete(userId);
    }
  }
};

export type UserCommuteSetupStore = {
  load: (userId: string) => Promise<{ routes: CommuteRoute[] } | null>;
  createRoute: (userId: string, route: NewCommuteRoute) => Promise<CommuteRoute | 'route-limit-reached'>;
  updateRoute: (userId: string, routeId: string, route: Omit<CommuteRoute, 'id'>) => Promise<CommuteRoute | null>;
  deleteRoute: (userId: string, routeId: string) => Promise<boolean>;
};

export const loadUserCommuteSetup = async (
  store: Pick<UserCommuteSetupStore, 'load'>,
  userId: string
) =>
  (await store.load(userId)) ?? { routes: [] };

export const createUserCommuteRoute = async (
  store: UserCommuteSetupStore,
  userId: string,
  route: unknown,
  commuteEstimateProvider: Pick<GoogleMapsRequestGateway, 'estimateCommute'>
): Promise<{ outcome: 'created'; route: CommuteRoute } | { outcome: 'invalid-route' | 'estimate-unavailable' | 'route-limit-reached' | 'save-failed' }> => {
  const result = commuteRouteDraftSchema.safeParse(route);
  if (!result.success) return { outcome: 'invalid-route' };

  try {
    return await withCommuteRouteCreationLock(userId, async () => {
      const existingSetup = await store.load(userId);
      if ((existingSetup?.routes.length ?? 0) >= 5) return { outcome: 'route-limit-reached' as const };

      const estimate = await commuteEstimateProvider.estimateCommute({
        origin: result.data.origin,
        destination: result.data.destination
      });
      if (estimate.outcome !== 'available') return { outcome: 'estimate-unavailable' as const };

      const created = await store.createRoute(userId, {
        ...result.data,
        previewDurationMinutes: Math.round(estimate.estimate.durationMinutes)
      });
      return created === 'route-limit-reached'
        ? { outcome: 'route-limit-reached' as const }
        : { outcome: 'created' as const, route: created };
    });
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
