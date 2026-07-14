import { weatherLocationSchema, type WeatherLocation } from '$lib/weatherLocation';

export type UserWeatherLocationPersistenceStore = {
  load: (userId: string) => Promise<WeatherLocation | null>;
  save: (userId: string, location: WeatherLocation) => Promise<void>;
};

export type UserWeatherLocationSaveOutcome = 'saved' | 'invalid-weather-location' | 'save-failed';

export const loadUserWeatherLocation = (
  store: Pick<UserWeatherLocationPersistenceStore, 'load'>,
  userId: string
) => store.load(userId);

export const saveUserWeatherLocation = async (
  store: UserWeatherLocationPersistenceStore,
  userId: string,
  location: unknown
): Promise<{ outcome: UserWeatherLocationSaveOutcome }> => {
  const result = weatherLocationSchema.safeParse(location);

  if (!result.success) {
    return { outcome: 'invalid-weather-location' };
  }

  try {
    await store.save(userId, result.data);
  } catch {
    return { outcome: 'save-failed' };
  }

  return { outcome: 'saved' };
};
