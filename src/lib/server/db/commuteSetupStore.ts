import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { defaultCommuteDays, type CommuteDay, type CommuteRoute } from '$lib/commuteRoute';
import type { UserCommuteSetupStore } from '$lib/server/commuteSetupPersistence';
import { db } from '$lib/server/db';
import { commuteDays, commuteRoutes } from './schema';

type CommuteSetupDatabase = typeof db;

const routeFromRow = (row: typeof commuteRoutes.$inferSelect): CommuteRoute => ({
  id: row.id,
  name: row.name,
  origin: {
    label: row.originLabel,
    latitude: row.originLatitude,
    longitude: row.originLongitude
  },
  destination: {
    label: row.destinationLabel,
    latitude: row.destinationLatitude,
    longitude: row.destinationLongitude
  },
  enabled: row.enabled
});

const routeValues = (route: Omit<CommuteRoute, 'id'>) => ({
  name: route.name,
  originLabel: route.origin.label,
  originLatitude: route.origin.latitude,
  originLongitude: route.origin.longitude,
  destinationLabel: route.destination.label,
  destinationLatitude: route.destination.latitude,
  destinationLongitude: route.destination.longitude,
  enabled: route.enabled
});

export const createUserCommuteSetupStore = (
  database: CommuteSetupDatabase
): UserCommuteSetupStore => ({
  async load(userId) {
    const [routeRows, dayRows] = await Promise.all([
      database.query.commuteRoutes.findMany({
        where: eq(commuteRoutes.userId, userId),
        orderBy: [asc(commuteRoutes.position)]
      }),
      database.query.commuteDays.findMany({ where: eq(commuteDays.userId, userId) })
    ]);

    if (routeRows.length === 0 && dayRows.length === 0) return null;

    return {
      routes: routeRows.map(routeFromRow),
      days: defaultCommuteDays.filter((day) => dayRows.some((row) => row.day === day)).concat(
        dayRows
          .map((row) => row.day as CommuteDay)
          .filter((day) => !defaultCommuteDays.includes(day))
      )
    };
  },
  async createRoute(userId, draft) {
    return database.transaction((transaction) => {
      const nextPosition = transaction
        .select({ value: sql<number>`coalesce(max(${commuteRoutes.position}), 0) + 1` })
        .from(commuteRoutes)
        .where(eq(commuteRoutes.userId, userId))
        .get()?.value;
      const currentCount = transaction
        .select({ value: sql<number>`count(*)` })
        .from(commuteRoutes)
        .where(eq(commuteRoutes.userId, userId))
        .get()?.value ?? 0;

      if (currentCount >= 5) return 'route-limit-reached' as const;

      const route: CommuteRoute = { id: randomUUID(), ...draft, enabled: true };
      transaction
        .insert(commuteRoutes)
        .values({ id: route.id, userId, position: nextPosition ?? 1, ...routeValues(route) })
        .run();
      if (currentCount === 0) {
        transaction
          .insert(commuteDays)
          .values(defaultCommuteDays.map((day) => ({ userId, day })))
          .onConflictDoNothing()
          .run();
      }
      return route;
    });
  },
  async updateRoute(userId, routeId, route) {
    const result = await database
      .update(commuteRoutes)
      .set(routeValues(route))
      .where(and(eq(commuteRoutes.id, routeId), eq(commuteRoutes.userId, userId)))
      .returning();
    return result[0] ? routeFromRow(result[0]) : null;
  },
  async deleteRoute(userId, routeId) {
    const result = await database
      .delete(commuteRoutes)
      .where(and(eq(commuteRoutes.id, routeId), eq(commuteRoutes.userId, userId)))
      .returning({ id: commuteRoutes.id });
    return result.length > 0;
  },
  async saveDays(userId, days) {
    database.transaction((transaction) => {
      transaction.delete(commuteDays).where(eq(commuteDays.userId, userId)).run();
      if (days.length > 0) {
        transaction.insert(commuteDays).values(days.map((day) => ({ userId, day }))).run();
      }
    });
  }
});

export const userCommuteSetupStore = createUserCommuteSetupStore(db);
