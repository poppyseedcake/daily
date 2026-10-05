import { defaultSummaryConfiguration } from '$lib/summaryConfiguration';
import { createDefaultTodoState } from '$lib/todo';
import { defaultCommuteDays } from '$lib/commuteRoute';
import { userSetupPartLabels, type UserSetupEditing, type UserSetupPart } from '$lib/userSetup';
import type { UserSummaryConfigurationStore } from './summaryConfigurationPersistence';
import { loadUserTodoState, type UserTodoPersistenceStore } from './todoPersistence';
import type { UserWeatherLocationPersistenceStore } from './weatherLocationPersistence';
import type { UserCommuteSetupStore } from './commuteSetupPersistence';
import type {
  UserSavedWeatherCityStore,
  UserSavedCommuteAddressStore
} from './db/savedLocationStore';

type UserSetupStores = {
  summaryConfiguration: Pick<UserSummaryConfigurationStore, 'load'>;
  todoState: Pick<UserTodoPersistenceStore, 'load'>;
  weatherLocation: Pick<UserWeatherLocationPersistenceStore, 'load'>;
  commuteSetup: Pick<UserCommuteSetupStore, 'load'>;
  savedWeatherCities: Pick<UserSavedWeatherCityStore, 'load'>;
  savedCommuteAddresses: Pick<UserSavedCommuteAddressStore, 'load'>;
};

const failureClassifications: Record<UserSetupPart, string> = {
  summaryConfiguration: 'summary-configuration-unavailable',
  todoState: 'todo-state-unavailable',
  weatherLocation: 'weather-location-unavailable',
  commuteSetup: 'commute-setup-unavailable',
  savedWeatherCities: 'saved-weather-cities-unavailable',
  savedCommuteAddresses: 'saved-commute-addresses-unavailable'
};

export const loadUserSetup = async (stores: UserSetupStores, userId: string) => {
  const userSetupEditing: UserSetupEditing = {
    summaryConfiguration: false,
    todoState: false,
    weatherLocation: false,
    commuteSetup: false,
    savedWeatherCities: false,
    savedCommuteAddresses: false
  };
  const read = async <Value>(part: UserSetupPart, load: () => Promise<Value>, fallback: Value) => {
    try {
      const value = await load();
      userSetupEditing[part] = true;
      return value;
    } catch {
      const label = part === 'todoState'
        ? 'Todo state'
        : part === 'commuteSetup'
          ? 'Commute setup'
          : userSetupPartLabels[part];
      console.warn(`Failed to load User ${label}.`, {
        userId,
        classification: failureClassifications[part]
      });
      return fallback;
    }
  };

  const [
    savedSummaryConfiguration,
    todoState,
    weatherLocation,
    commuteSetup,
    savedWeatherCities,
    savedCommuteAddresses
  ] = await Promise.all([
    read('summaryConfiguration', () => stores.summaryConfiguration.load(userId), null),
    read('todoState', () => loadUserTodoState(stores.todoState, userId), createDefaultTodoState()),
    read('weatherLocation', () => stores.weatherLocation.load(userId), null),
    read('commuteSetup', () => stores.commuteSetup.load(userId), null),
    read('savedWeatherCities', () => stores.savedWeatherCities.load(userId), []),
    read('savedCommuteAddresses', () => stores.savedCommuteAddresses.load(userId), [])
  ]);

  return {
    userSetupEditing,
    summaryConfiguration: userSetupEditing.summaryConfiguration
      ? savedSummaryConfiguration ?? defaultSummaryConfiguration
      : null,
    ...(userSetupEditing.summaryConfiguration
      ? { hasSavedSummaryConfiguration: savedSummaryConfiguration !== null }
      : {}),
    todoState,
    weatherLocation,
    commuteSetup: commuteSetup ?? { routes: [], days: [...defaultCommuteDays] },
    savedWeatherCities,
    savedCommuteAddresses
  };
};
