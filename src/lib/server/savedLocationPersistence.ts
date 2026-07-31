import {
  savedCommuteAddressesSchema,
  savedWeatherCitiesSchema,
  type SavedCommuteAddress,
  type SavedWeatherCity
} from '$lib/savedLocation';

export type UserSavedWeatherCityPersistenceStore = {
  load: (userId: string) => Promise<SavedWeatherCity[]>;
  replace: (userId: string, locations: SavedWeatherCity[]) => Promise<void>;
};

export type UserSavedCommuteAddressPersistenceStore = {
  load: (userId: string) => Promise<SavedCommuteAddress[]>;
  replace: (userId: string, locations: SavedCommuteAddress[]) => Promise<void>;
};

export type UserSavedWeatherCitySaveOutcome =
  | 'saved'
  | 'invalid-saved-weather-cities'
  | 'save-failed';

export type UserSavedCommuteAddressSaveOutcome =
  | 'saved'
  | 'invalid-saved-commute-addresses'
  | 'save-failed';

export const loadUserSavedWeatherCities = (
  store: Pick<UserSavedWeatherCityPersistenceStore, 'load'>,
  userId: string
) => store.load(userId);

export const loadUserSavedCommuteAddresses = (
  store: Pick<UserSavedCommuteAddressPersistenceStore, 'load'>,
  userId: string
) => store.load(userId);

export const saveUserSavedWeatherCities = async (
  store: UserSavedWeatherCityPersistenceStore,
  userId: string,
  locations: unknown
): Promise<{ outcome: UserSavedWeatherCitySaveOutcome }> => {
  const result = savedWeatherCitiesSchema.safeParse(locations);

  if (!result.success) {
    return { outcome: 'invalid-saved-weather-cities' };
  }

  try {
    await store.replace(userId, result.data);
  } catch {
    return { outcome: 'save-failed' };
  }

  return { outcome: 'saved' };
};

export const saveUserSavedCommuteAddresses = async (
  store: UserSavedCommuteAddressPersistenceStore,
  userId: string,
  locations: unknown
): Promise<{ outcome: UserSavedCommuteAddressSaveOutcome }> => {
  const result = savedCommuteAddressesSchema.safeParse(locations);

  if (!result.success) {
    return { outcome: 'invalid-saved-commute-addresses' };
  }

  try {
    await store.replace(userId, result.data);
  } catch {
    return { outcome: 'save-failed' };
  }

  return { outcome: 'saved' };
};
