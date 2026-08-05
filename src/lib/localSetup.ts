import { z } from 'zod';
import {
  defaultSummaryConfiguration,
  summaryConfigurationSchema,
  type SummaryConfiguration
} from './summaryConfiguration';
import {
  createDefaultTodoState,
  todoStateSchema,
  type TodoCategory,
  type TodoState,
  type TodoStateInput,
  type TodoTask,
  type TodoUrgency
} from './todo';
import { weatherLocationSchema, type WeatherLocation } from './weatherLocation';
import {
  savedCommuteAddressesSchema,
  savedWeatherCitiesSchema,
  type SavedCommuteAddress,
  type SavedWeatherCity
} from './savedLocation';
import {
  commuteDaysSchema,
  commuteRouteDraftSchema,
  commuteRoutesSchema,
  defaultCommuteDays,
  type CommuteDay,
  type CommuteRoute
} from './commuteRoute';

export const localSetupVersion = 2;
export const localSetupStorageKey = 'daily.visitorLocalSetup.v2';
export const legacyLocalSetupStorageKey = 'daily.visitorLocalSetup.v1';

export type LocalSetup = {
  version: typeof localSetupVersion;
  summaryConfiguration: typeof defaultSummaryConfiguration;
  weatherLocation: WeatherLocation | null;
  savedWeatherCities: SavedWeatherCity[];
  savedCommuteAddresses: SavedCommuteAddress[];
  commuteRoutes: CommuteRoute[];
  commuteDays: CommuteDay[];
} & TodoState;

export type LocalSetupInput = {
  version: typeof localSetupVersion;
  summaryConfiguration: typeof defaultSummaryConfiguration;
  weatherLocation: WeatherLocation | null;
  savedWeatherCities: SavedWeatherCity[];
  savedCommuteAddresses: SavedCommuteAddress[];
  commuteRoutes: CommuteRoute[];
  commuteDays: CommuteDay[];
} & TodoStateInput;

export type LocalSetupStorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type LocalSetupLoadOutcome =
  | 'empty'
  | 'loaded'
  | 'invalid-json'
  | 'schema-invalid'
  | 'unsupported-version'
  | 'read-failed';
export type LocalSetupSaveOutcome = 'saved' | 'write-failed';

export type UserSetupImportDraft = {
  summaryConfiguration: {
    id: string;
    userId: string;
    summaryTime: string;
    userTimeZone: SummaryConfiguration['userTimeZone'];
    summaryTheme: SummaryConfiguration['summaryTheme'];
    summaryDeliveryEnabled: boolean;
    weatherSectionEnabled: boolean;
    commuteSectionEnabled: boolean;
    calendarSectionEnabled: boolean;
    todoSectionEnabled: boolean;
    weatherSectionPaused?: boolean;
    commuteSectionPaused?: boolean;
    calendarSectionPaused?: boolean;
    todoSectionPaused?: boolean;
  };
  todoCategories: Array<{
    id: string;
    userId: string;
    name: string;
    position: number;
  }>;
  todoTasks: Array<{
    id: string;
    userId: string;
    categoryId: string | null;
    title: string;
    urgency: TodoUrgency;
    position: number;
    completed: boolean;
  }>;
  weatherLocation: {
    id: string;
    userId: string;
    label: string;
    latitude: number;
    longitude: number;
  } | null;
  savedWeatherCities: Array<{
    id: string;
    userId: string;
    label: string;
    latitude: number;
    longitude: number;
    position: number;
  }>;
  savedCommuteAddresses: Array<{
    id: string;
    userId: string;
    label: string;
    latitude: number;
    longitude: number;
    position: number;
  }>;
  commuteRoutes: Array<{
    id: string;
    userId: string;
    name: string;
    originLabel: string;
    originLatitude: number;
    originLongitude: number;
    destinationLabel: string;
    destinationLatitude: number;
    destinationLongitude: number;
    previewDurationMinutes: number | null;
    days: CommuteDay[];
    enabled: boolean;
    position: number;
  }>;
  commuteDays: CommuteDay[];
};

export type UserSetupImportDraftOptions = {
  userId: string;
  summaryConfigurationId: string;
  weatherLocationId: string;
  nextSavedWeatherCityId?: (city: SavedWeatherCity, index: number) => string;
  nextSavedCommuteAddressId?: (address: SavedCommuteAddress, index: number) => string;
  nextCommuteRouteId?: (route: CommuteRoute) => string;
  nextTodoCategoryId: (category: TodoCategory) => string;
  nextTodoTaskId: (task: TodoTask) => string;
};

const localSetupBaseSchema = z
  .object({
    version: z.literal(localSetupVersion),
    summaryConfiguration: summaryConfigurationSchema,
    weatherLocation: weatherLocationSchema.nullable().default(null),
    savedWeatherCities: savedWeatherCitiesSchema.default([]),
    savedCommuteAddresses: savedCommuteAddressesSchema.default([]),
    commuteRoutes: commuteRoutesSchema.default([]),
    commuteDays: commuteDaysSchema.default(defaultCommuteDays)
  })
  .and(todoStateSchema);

const localSetupSchema = localSetupBaseSchema.transform((setup) => ({
  version: setup.version,
  summaryConfiguration: setup.summaryConfiguration,
  weatherLocation: setup.weatherLocation,
  savedWeatherCities: setup.savedWeatherCities,
  savedCommuteAddresses: setup.savedCommuteAddresses,
  commuteRoutes: setup.commuteRoutes,
  commuteDays: setup.commuteDays,
  todoCategories: setup.todoCategories,
  todoTasks: setup.todoTasks,
  nextTodoId: setup.nextTodoId
}));

const unversionedCurrentLocalSetupSchema = z
  .object({
    version: z.never().optional(),
    summaryConfiguration: summaryConfigurationSchema,
    weatherLocation: weatherLocationSchema.nullable().default(null),
    savedWeatherCities: savedWeatherCitiesSchema.default([]),
    savedCommuteAddresses: savedCommuteAddressesSchema.default([]),
    commuteRoutes: commuteRoutesSchema.default([]),
    commuteDays: commuteDaysSchema.default(defaultCommuteDays)
  })
  .and(todoStateSchema)
  .transform((setup) => ({
    version: localSetupVersion,
    summaryConfiguration: setup.summaryConfiguration,
    weatherLocation: setup.weatherLocation,
    savedWeatherCities: setup.savedWeatherCities,
    savedCommuteAddresses: setup.savedCommuteAddresses,
    commuteRoutes: setup.commuteRoutes,
    commuteDays: setup.commuteDays,
    todoCategories: setup.todoCategories,
    todoTasks: setup.todoTasks,
    nextTodoId: setup.nextTodoId
  }));

const isSavedCommuteAddress = (
  location: SavedWeatherCity,
  routes: CommuteRoute[]
) =>
  routes.some(
    (route) =>
      (route.origin.latitude === location.latitude && route.origin.longitude === location.longitude) ||
      (route.destination.latitude === location.latitude &&
        route.destination.longitude === location.longitude)
  );

const splitLegacySavedLocations = (
  locations: SavedWeatherCity[],
  routes: CommuteRoute[]
): Pick<LocalSetup, 'savedWeatherCities' | 'savedCommuteAddresses'> => ({
  savedWeatherCities: locations.filter((location) => !isSavedCommuteAddress(location, routes)),
  savedCommuteAddresses: locations.filter((location) => isSavedCommuteAddress(location, routes))
});

const legacySavedLocationsLocalSetupSchema = z
  .object({
    version: z.literal(1),
    summaryConfiguration: summaryConfigurationSchema,
    weatherLocation: weatherLocationSchema.nullable().default(null),
    savedLocations: savedWeatherCitiesSchema.default([]),
    commuteRoutes: commuteRoutesSchema.default([]),
    commuteDays: commuteDaysSchema.default(defaultCommuteDays)
  })
  .and(todoStateSchema)
  .transform((setup) =>
    localSetupSchema.parse({
      version: localSetupVersion,
      summaryConfiguration: setup.summaryConfiguration,
      weatherLocation: setup.weatherLocation,
      ...splitLegacySavedLocations(setup.savedLocations, setup.commuteRoutes),
      commuteRoutes: setup.commuteRoutes,
      commuteDays: setup.commuteDays,
      todoCategories: setup.todoCategories,
      todoTasks: setup.todoTasks,
      nextTodoId: setup.nextTodoId
    })
  );

const unversionedLegacySavedLocationsLocalSetupSchema = z
  .object({
    version: z.never().optional(),
    summaryConfiguration: summaryConfigurationSchema,
    weatherLocation: weatherLocationSchema.nullable().default(null),
    savedLocations: savedWeatherCitiesSchema.default([]),
    commuteRoutes: commuteRoutesSchema.default([]),
    commuteDays: commuteDaysSchema.default(defaultCommuteDays)
  })
  .and(todoStateSchema)
  .transform((setup) =>
    localSetupSchema.parse({
      version: localSetupVersion,
      summaryConfiguration: setup.summaryConfiguration,
      weatherLocation: setup.weatherLocation,
      ...splitLegacySavedLocations(setup.savedLocations, setup.commuteRoutes),
      commuteRoutes: setup.commuteRoutes,
      commuteDays: setup.commuteDays,
      todoCategories: setup.todoCategories,
      todoTasks: setup.todoTasks,
      nextTodoId: setup.nextTodoId
    })
  );

const legacyCommuteRouteLocalSetupSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(localSetupVersion)]).optional(),
    summaryConfiguration: summaryConfigurationSchema,
    weatherLocation: weatherLocationSchema.nullable().default(null),
    savedLocations: savedWeatherCitiesSchema.default([]),
    commuteRoute: commuteRouteDraftSchema.nullable()
  })
  .and(todoStateSchema)
  .transform((setup) =>
    localSetupSchema.parse({
      version: localSetupVersion,
      summaryConfiguration: setup.summaryConfiguration,
      weatherLocation: setup.weatherLocation,
      ...splitLegacySavedLocations(
        setup.savedLocations,
        setup.commuteRoute ? [{ ...setup.commuteRoute, id: 'route-1', enabled: true }] : []
      ),
      commuteRoutes: setup.commuteRoute
        ? [{ ...setup.commuteRoute, id: 'route-1', enabled: true }]
        : [],
      commuteDays: defaultCommuteDays,
      todoCategories: setup.todoCategories,
      todoTasks: setup.todoTasks,
      nextTodoId: setup.nextTodoId
    })
  );

const supportedLocalSetupSchema = z.union([
  legacyCommuteRouteLocalSetupSchema,
  legacySavedLocationsLocalSetupSchema,
  unversionedLegacySavedLocationsLocalSetupSchema,
  localSetupSchema,
  unversionedCurrentLocalSetupSchema
]);

const fallbackLoadResult = (outcome: LocalSetupLoadOutcome) => ({
  outcome,
  setup: createDefaultLocalSetup()
});

const withMigratedCommuteRouteDays = (setup: unknown): unknown => {
  if (
    typeof setup !== 'object' ||
    setup === null ||
    !('commuteRoutes' in setup) ||
    !Array.isArray(setup.commuteRoutes) ||
    !('commuteDays' in setup) ||
    !Array.isArray(setup.commuteDays)
  ) {
    return setup;
  }

  return {
    ...setup,
    commuteRoutes: setup.commuteRoutes.map((route) =>
      typeof route === 'object' && route !== null && !('days' in route)
        ? { ...route, days: setup.commuteDays }
        : route
    )
  };
};

const sortTasksWithinIncomingCategoryOrder = (tasks: TodoTask[]) => {
  const tasksByCategory = new Map<string | null, TodoTask[]>();

  for (const task of tasks) {
    tasksByCategory.set(task.categoryId, [...(tasksByCategory.get(task.categoryId) ?? []), task]);
  }

  const sortedTasksByCategory = new Map(
    [...tasksByCategory.entries()].map(([categoryId, categoryTasks]) => [
      categoryId,
      categoryTasks.toSorted((first, second) => first.position - second.position)
    ])
  );

  return tasks.map((task) => sortedTasksByCategory.get(task.categoryId)?.shift() ?? task);
};

export const createDefaultLocalSetup = (): LocalSetup =>
  localSetupSchema.parse({
    version: localSetupVersion,
    summaryConfiguration: summaryConfigurationSchema.parse(defaultSummaryConfiguration),
    ...createDefaultTodoState()
  });

export const loadLocalSetup = (
  storage: LocalSetupStorageAdapter
): { outcome: LocalSetupLoadOutcome; setup: LocalSetup } => {
  let storedSetup: string | null;

  try {
    storedSetup = storage.getItem(localSetupStorageKey);
    if (!storedSetup) {
      storedSetup = storage.getItem(legacyLocalSetupStorageKey);
    }
  } catch {
    return fallbackLoadResult('read-failed');
  }

  if (!storedSetup) {
    return fallbackLoadResult('empty');
  }

  let parsedSetup: unknown;

  try {
    parsedSetup = JSON.parse(storedSetup);
  } catch {
    return fallbackLoadResult('invalid-json');
  }

  const result = supportedLocalSetupSchema.safeParse(withMigratedCommuteRouteDays(parsedSetup));

  if (result.success) {
    return { outcome: 'loaded', setup: result.data as LocalSetup };
  }

  if (
    typeof parsedSetup === 'object' &&
    parsedSetup !== null &&
    'version' in parsedSetup &&
    typeof (parsedSetup as { version: unknown }).version === 'number' &&
    (parsedSetup as { version: number }).version !== localSetupVersion
  ) {
    return fallbackLoadResult('unsupported-version');
  }

  return fallbackLoadResult('schema-invalid');
};

export const saveLocalSetup = (
  storage: LocalSetupStorageAdapter,
  setup: LocalSetupInput
): { outcome: LocalSetupSaveOutcome } => {
  try {
    storage.setItem(localSetupStorageKey, JSON.stringify(localSetupSchema.parse(setup)));
  } catch {
    return { outcome: 'write-failed' };
  }

  return { outcome: 'saved' };
};

export const createUserSetupImportDraftFromLocalSetup = (
  result: { outcome: LocalSetupLoadOutcome; setup: LocalSetupInput },
  options: UserSetupImportDraftOptions
): UserSetupImportDraft | null => {
  if (result.outcome !== 'loaded') {
    return null;
  }

  const setup = localSetupSchema.parse(result.setup);
  const categoryIds = new Map(
    setup.todoCategories.map((category) => [category.id, options.nextTodoCategoryId(category)])
  );
  const taskIds = new Map(
    setup.todoTasks.map((task) => [task.id, options.nextTodoTaskId(task)])
  );

  const hasUnsafeTaskCategory = setup.todoTasks.some(
    (task) => task.categoryId !== null && !categoryIds.has(task.categoryId)
  );

  if (hasUnsafeTaskCategory) {
    return null;
  }

  const remapTaskCategoryId = (categoryId: string | null) => {
    if (categoryId === null) {
      return null;
    }

    const remappedCategoryId = categoryIds.get(categoryId);

    if (remappedCategoryId === undefined) {
      throw new Error('Unsafe Local Setup Todo Task category assignment');
    }

    return remappedCategoryId;
  };

  return {
    summaryConfiguration: {
      id: options.summaryConfigurationId,
      userId: options.userId,
      summaryTime: setup.summaryConfiguration.summaryTime,
      userTimeZone: setup.summaryConfiguration.userTimeZone,
      summaryTheme: setup.summaryConfiguration.summaryTheme,
      summaryDeliveryEnabled: setup.summaryConfiguration.summaryDeliveryEnabled,
      weatherSectionEnabled: setup.summaryConfiguration.sections.weather,
      commuteSectionEnabled: setup.summaryConfiguration.sections.commute,
      calendarSectionEnabled: setup.summaryConfiguration.sections.calendar,
      todoSectionEnabled: setup.summaryConfiguration.sections.todo,
      weatherSectionPaused: setup.summaryConfiguration.sectionPauses.weather,
      commuteSectionPaused: setup.summaryConfiguration.sectionPauses.commute,
      calendarSectionPaused: setup.summaryConfiguration.sectionPauses.calendar,
      todoSectionPaused: setup.summaryConfiguration.sectionPauses.todo
    },
    todoCategories: setup.todoCategories
      .toSorted((first, second) => first.position - second.position)
      .map((category) => ({
        id: categoryIds.get(category.id) ?? category.id,
        userId: options.userId,
        name: category.name,
        position: category.position
      })),
    todoTasks: sortTasksWithinIncomingCategoryOrder(setup.todoTasks).map((task) => ({
      id: taskIds.get(task.id) ?? task.id,
      userId: options.userId,
      categoryId: remapTaskCategoryId(task.categoryId),
      title: task.title,
      urgency: task.urgency,
      position: task.position,
      completed: task.completed ?? false
    })),
    weatherLocation: setup.weatherLocation
      ? {
          id: options.weatherLocationId,
          userId: options.userId,
          label: setup.weatherLocation.label,
          latitude: setup.weatherLocation.latitude,
          longitude: setup.weatherLocation.longitude
        }
      : null,
    savedWeatherCities: setup.savedWeatherCities.map((city, index) => ({
      id: options.nextSavedWeatherCityId?.(city, index) ?? `saved-weather-city-${index + 1}`,
      userId: options.userId,
      label: city.label,
      latitude: city.latitude,
      longitude: city.longitude,
      position: index + 1
    })),
    savedCommuteAddresses: setup.savedCommuteAddresses.map((address, index) => ({
      id:
        options.nextSavedCommuteAddressId?.(address, index) ??
        `saved-commute-address-${index + 1}`,
      userId: options.userId,
      label: address.label,
      latitude: address.latitude,
      longitude: address.longitude,
      position: index + 1
    })),
    commuteRoutes: setup.commuteRoutes.map((route, index) => ({
      id: options.nextCommuteRouteId?.(route) ?? route.id,
      userId: options.userId,
      name: route.name,
      originLabel: route.origin.label,
      originLatitude: route.origin.latitude,
      originLongitude: route.origin.longitude,
      destinationLabel: route.destination.label,
      destinationLatitude: route.destination.latitude,
      destinationLongitude: route.destination.longitude,
      previewDurationMinutes: route.previewDurationMinutes ?? null,
      days: route.days,
      enabled: route.enabled,
      position: index + 1
    })),
    commuteDays: setup.commuteDays
  };
};
