import { type CalendarEventProvider } from '$lib/calendar';
import {
  calendarReadinessForAuthMode,
  calendarReadinessForUnavailableCredentials,
  calendarReadinessForUnavailableProvider,
  calendarReadinessForUserConnection,
  type CalendarReadiness,
  type UserCalendarReadinessConnection
} from '$lib/calendarReadiness';
import { buildDailySummaryInput } from '$lib/dailySummaryPreview';
import {
  renderDailySummary,
  type DailySummaryInput,
  type RenderedDailySummary
} from '$lib/dailySummaryRenderer';
import type { SavedSelectedCalendar } from '$lib/selectedCalendars';
import type { SummaryConfiguration } from '$lib/summaryConfiguration';
import type { UserSummaryConfigurationStore } from './summaryConfigurationPersistence';
import { loadUserSummaryConfiguration } from './summaryConfigurationPersistence';
import type { UserTodoPersistenceStore } from './todoPersistence';
import { loadUserTodoStateSafely } from './todoPersistence';
import type { UserWeatherLocationPersistenceStore } from './weatherLocationPersistence';
import { loadUserWeatherLocation } from './weatherLocationPersistence';
import type { UserCommuteSetupStore } from './commuteSetupPersistence';
import { loadUserCommuteSetup } from './commuteSetupPersistence';
import type { WeatherForecastProvider, WeatherSummaryProvider } from '$lib/weatherForecast';
import type { GoogleMapsRequestGateway } from './googleMapsRequestGateway';

export type ScheduledDailySummaryGenerationResult = {
  input: DailySummaryInput;
  rendered: RenderedDailySummary;
};

export type DailySummaryGenerationOptions = {
  configuration?: SummaryConfiguration;
  openDailyUrl?: string;
  now?: Date;
  calendarContext?: {
    readiness: CalendarReadiness;
    selectedCalendars: SavedSelectedCalendar[];
    provider?: CalendarEventProvider;
  };
};

type ScheduledCalendarConnectionStore = {
  load: (userId: string) => Promise<UserCalendarReadinessConnection>;
  loadSelectedCalendars: (userId: string) => Promise<SavedSelectedCalendar[]>;
};

export type ScheduledDailySummaryGenerationDependencies = {
  userLifecycleStore: { isActive(userId: string): Promise<boolean> };
  configurationStore: Pick<UserSummaryConfigurationStore, 'load'>;
  todoStore: Pick<UserTodoPersistenceStore, 'load'>;
  weatherLocationStore: Pick<UserWeatherLocationPersistenceStore, 'load'>;
  commuteSetupStore: Pick<UserCommuteSetupStore, 'load'>;
  calendarConnectionStore: ScheduledCalendarConnectionStore;
  loadCalendarAccessToken: (userId: string) => Promise<string | null>;
  calendarEventProvider: (accessToken: string) => CalendarEventProvider;
  weatherProvider: WeatherForecastProvider;
  weatherSummaryProvider?: WeatherSummaryProvider;
  commuteEstimateProvider: (
    userId: string
  ) => Pick<GoogleMapsRequestGateway, 'estimateCommute'> | undefined;
  openDailyUrl?: string;
  now?: () => Date;
};

export const createDailySummaryGenerator = ({
  userLifecycleStore,
  configurationStore,
  todoStore,
  weatherLocationStore,
  commuteSetupStore,
  calendarConnectionStore,
  loadCalendarAccessToken,
  calendarEventProvider,
  weatherProvider,
  weatherSummaryProvider,
  commuteEstimateProvider,
  openDailyUrl = process.env.ORIGIN ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:5174/',
  now = () => new Date()
}: ScheduledDailySummaryGenerationDependencies) => ({
  async generate(
    userId: string,
    {
      configuration: requestedConfiguration,
      openDailyUrl: requestedOpenDailyUrl,
      now: requestedNow,
      calendarContext: requestedCalendarContext
    }: DailySummaryGenerationOptions = {}
  ): Promise<ScheduledDailySummaryGenerationResult> {
    if (!(await userLifecycleStore.isActive(userId))) {
      throw new ScheduledDailySummaryUserNotActiveError();
    }

    const configuration =
      requestedConfiguration ?? (await loadUserSummaryConfiguration(configurationStore, userId));
    const [todoContext, weatherContext, commuteContext, calendarContext] = await Promise.all([
      loadUserTodoStateSafely(todoStore, userId, {
        enabled: !configuration.sectionPauses.todo
      }),
      loadScheduledWeatherContext({
        userId,
        weatherEnabled: !configuration.sectionPauses.weather,
        locationStore: weatherLocationStore
      }),
      loadScheduledCommuteContext({
        userId,
        commuteEnabled: !configuration.sectionPauses.commute,
        setupStore: commuteSetupStore
      }),
      requestedCalendarContext
        ? Promise.resolve(requestedCalendarContext)
        : loadScheduledCalendarContext({
            userId,
            calendarEnabled: !configuration.sectionPauses.calendar,
            connectionStore: calendarConnectionStore,
            loadAccessToken: loadCalendarAccessToken,
            providerForAccessToken: calendarEventProvider
          })
    ]);
    const generatedAt = requestedNow ?? now();
    const input = await buildDailySummaryInput({
      authMode: 'user',
      configuration,
      todoCategories: todoContext.state.todoCategories,
      todoTasks: todoContext.state.todoTasks,
      todoStateUnavailable: todoContext.unavailable,
      weatherLocation: weatherContext.location,
      weatherLocationUnavailable: weatherContext.unavailable,
      weatherProvider,
      weatherSummaryProvider,
      commuteRoutes: commuteContext.setup.routes,
      commuteDays: commuteContext.setup.days,
      commuteSetupUnavailable: commuteContext.unavailable,
      commuteEstimateMode: 'live',
      commuteEstimateProvider:
        !configuration.sectionPauses.commute
        ? safelyLoadCommuteEstimateProvider(commuteEstimateProvider, userId)
        : undefined,
      calendarReadiness: calendarContext.readiness,
      selectedCalendars: calendarContext.selectedCalendars,
      calendarEventProvider: calendarContext.provider,
      now: generatedAt,
      openDailyUrl: requestedOpenDailyUrl ?? openDailyUrl
    });
    return {
      input,
      rendered: renderDailySummary(input)
    };
  }
});

export const createScheduledDailySummaryGenerator = createDailySummaryGenerator;

export class ScheduledDailySummaryUserNotActiveError extends Error {
  constructor() {
    super('Scheduled Daily Summary generation requires an active User.');
    this.name = 'ScheduledDailySummaryUserNotActiveError';
  }
}

const safelyLoadCommuteEstimateProvider = (
  providerForUser: ScheduledDailySummaryGenerationDependencies['commuteEstimateProvider'],
  userId: string
) => {
  try {
    return providerForUser(userId);
  } catch {
    return undefined;
  }
};

type LoadedCommuteSetup = Awaited<ReturnType<typeof loadUserCommuteSetup>>;

type LoadedWeatherLocation = Awaited<ReturnType<typeof loadUserWeatherLocation>>;

const loadScheduledWeatherContext = async ({
  userId,
  weatherEnabled,
  locationStore
}: {
  userId: string;
  weatherEnabled: boolean;
  locationStore: Pick<UserWeatherLocationPersistenceStore, 'load'>;
}): Promise<{ location: LoadedWeatherLocation; unavailable: boolean }> => {
  if (!weatherEnabled) {
    return { location: null, unavailable: false };
  }

  try {
    return {
      location: await loadUserWeatherLocation(locationStore, userId),
      unavailable: false
    };
  } catch {
    return { location: null, unavailable: true };
  }
};

const emptyCommuteSetup: LoadedCommuteSetup = {
  routes: [],
  days: []
};

const loadScheduledCommuteContext = async ({
  userId,
  commuteEnabled,
  setupStore
}: {
  userId: string;
  commuteEnabled: boolean;
  setupStore: Pick<UserCommuteSetupStore, 'load'>;
}): Promise<{ setup: LoadedCommuteSetup; unavailable: boolean }> => {
  if (!commuteEnabled) {
    return { setup: emptyCommuteSetup, unavailable: false };
  }

  try {
    return {
      setup: await loadUserCommuteSetup(setupStore, userId),
      unavailable: false
    };
  } catch {
    return { setup: emptyCommuteSetup, unavailable: true };
  }
};

const loadScheduledCalendarContext = async ({
  userId,
  calendarEnabled,
  connectionStore,
  loadAccessToken,
  providerForAccessToken
}: {
  userId: string;
  calendarEnabled: boolean;
  connectionStore: ScheduledCalendarConnectionStore;
  loadAccessToken: (userId: string) => Promise<string | null>;
  providerForAccessToken: (accessToken: string) => CalendarEventProvider;
}) => {
  if (!calendarEnabled) {
    return {
      readiness: calendarReadinessForAuthMode('user'),
      selectedCalendars: [],
      provider: undefined
    };
  }

  let connection: UserCalendarReadinessConnection;

  try {
    connection = await connectionStore.load(userId);
  } catch {
    return unavailableCalendarContext();
  }

  if (connection.status !== 'connected') {
    return {
      readiness: calendarReadinessForUserConnection(connection),
      selectedCalendars: [],
      provider: undefined
    };
  }

  let selectedCalendars: SavedSelectedCalendar[];

  try {
    selectedCalendars = await connectionStore.loadSelectedCalendars(userId);
  } catch {
    return unavailableCalendarContext();
  }

  if (selectedCalendars.length === 0) {
    return {
      readiness: calendarReadinessForUserConnection(connection),
      selectedCalendars,
      provider: undefined
    };
  }

  let accessToken: string | null;

  try {
    accessToken = await loadAccessToken(userId);
  } catch {
    return {
      readiness: calendarReadinessForUnavailableCredentials(),
      selectedCalendars: [],
      provider: undefined
    };
  }

  if (!accessToken) {
    return {
      readiness: calendarReadinessForUnavailableCredentials(),
      selectedCalendars: [],
      provider: undefined
    };
  }

  try {
    return {
      readiness: calendarReadinessForUserConnection(connection),
      selectedCalendars,
      provider: providerForAccessToken(accessToken)
    };
  } catch {
    return unavailableCalendarContext();
  }
};

const unavailableCalendarContext = () => ({
  readiness: calendarReadinessForUnavailableProvider(),
  selectedCalendars: [],
  provider: undefined
});
