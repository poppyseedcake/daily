import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { weatherLocationSchema, type WeatherLocation } from '$lib/weatherLocation';
import { weatherLocations } from './schema';

export type UserWeatherLocationStore = {
  load: (userId: string) => Promise<WeatherLocation | null>;
  save: (userId: string, location: WeatherLocation) => Promise<void>;
};

type WeatherLocationDatabase = Pick<typeof db, 'query' | 'insert'>;

const toWeatherLocation = (row: typeof weatherLocations.$inferSelect): WeatherLocation =>
  weatherLocationSchema.parse({
    label: row.label,
    latitude: row.latitude,
    longitude: row.longitude
  });

const toWeatherLocationRow = (
  userId: string,
  location: WeatherLocation
): Omit<typeof weatherLocations.$inferInsert, 'id'> => ({
  userId,
  label: location.label,
  latitude: location.latitude,
  longitude: location.longitude
});

const toWeatherLocationUpdateSet = (
  location: WeatherLocation
): Pick<typeof weatherLocations.$inferInsert, 'label' | 'latitude' | 'longitude'> => ({
  label: location.label,
  latitude: location.latitude,
  longitude: location.longitude
});

export const createUserWeatherLocationStore = (
  database: WeatherLocationDatabase
): UserWeatherLocationStore => ({
  async load(userId) {
    const row = await database.query.weatherLocations.findFirst({
      where: eq(weatherLocations.userId, userId)
    });

    return row ? toWeatherLocation(row) : null;
  },
  async save(userId, location) {
    await database
      .insert(weatherLocations)
      .values({
        id: randomUUID(),
        ...toWeatherLocationRow(userId, location)
      })
      .onConflictDoUpdate({
        target: weatherLocations.userId,
        set: toWeatherLocationUpdateSet(location)
      });
  }
});

export const userWeatherLocationStore = createUserWeatherLocationStore(db);
