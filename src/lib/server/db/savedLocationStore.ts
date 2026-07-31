import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import {
  savedCommuteAddressSchema,
  savedWeatherCitySchema,
  type SavedCommuteAddress,
  type SavedWeatherCity
} from '$lib/savedLocation';
import { db } from '$lib/server/db';
import { savedCommuteAddresses, savedWeatherCities } from './schema';

type SavedLocationDatabase = typeof db;

const toSavedWeatherCity = (row: typeof savedWeatherCities.$inferSelect): SavedWeatherCity =>
  savedWeatherCitySchema.parse({
    label: row.label,
    latitude: row.latitude,
    longitude: row.longitude
  });

const toSavedCommuteAddress = (
  row: typeof savedCommuteAddresses.$inferSelect
): SavedCommuteAddress =>
  savedCommuteAddressSchema.parse({
    label: row.label,
    latitude: row.latitude,
    longitude: row.longitude
  });

export type UserSavedWeatherCityStore = {
  load: (userId: string) => Promise<SavedWeatherCity[]>;
  replace: (userId: string, locations: SavedWeatherCity[]) => Promise<void>;
};

export const createUserSavedWeatherCityStore = (
  database: SavedLocationDatabase
): UserSavedWeatherCityStore => ({
  async load(userId) {
    const rows = await database.query.savedWeatherCities.findMany({
      where: eq(savedWeatherCities.userId, userId),
      orderBy: asc(savedWeatherCities.position)
    });

    return rows.map(toSavedWeatherCity);
  },
  async replace(userId, locations) {
    database.transaction((transaction) => {
      transaction.delete(savedWeatherCities).where(eq(savedWeatherCities.userId, userId)).run();

      if (locations.length > 0) {
        transaction
          .insert(savedWeatherCities)
          .values(
            locations.map((location, index) => ({
              id: randomUUID(),
              userId,
              position: index + 1,
              label: location.label,
              latitude: location.latitude,
              longitude: location.longitude
            }))
          )
          .run();
      }
    });
  }
});

export type UserSavedCommuteAddressStore = {
  load: (userId: string) => Promise<SavedCommuteAddress[]>;
  replace: (userId: string, locations: SavedCommuteAddress[]) => Promise<void>;
};

export const createUserSavedCommuteAddressStore = (
  database: SavedLocationDatabase
): UserSavedCommuteAddressStore => ({
  async load(userId) {
    const rows = await database.query.savedCommuteAddresses.findMany({
      where: eq(savedCommuteAddresses.userId, userId),
      orderBy: asc(savedCommuteAddresses.position)
    });

    return rows.map(toSavedCommuteAddress);
  },
  async replace(userId, locations) {
    database.transaction((transaction) => {
      transaction
        .delete(savedCommuteAddresses)
        .where(eq(savedCommuteAddresses.userId, userId))
        .run();

      if (locations.length > 0) {
        transaction
          .insert(savedCommuteAddresses)
          .values(
            locations.map((location, index) => ({
              id: randomUUID(),
              userId,
              position: index + 1,
              label: location.label,
              latitude: location.latitude,
              longitude: location.longitude
            }))
          )
          .run();
      }
    });
  }
});

export const userSavedWeatherCityStore = createUserSavedWeatherCityStore(db);
export const userSavedCommuteAddressStore = createUserSavedCommuteAddressStore(db);
