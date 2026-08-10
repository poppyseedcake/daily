import type { LoadedCalendarEvents } from '$lib/calendar';
import { calendarReadinessForAuthMode } from '$lib/calendarReadiness';
import { buildDailySummaryInput } from '$lib/dailySummaryPreview';
import {
  renderDailySummary,
  type DailySummaryInput,
  type RenderedDailySummary
} from '$lib/dailySummaryRenderer';
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
import type { UserCalendarEventsModule } from './userCalendarEvents';

export type ScheduledDailySummaryGenerationResult = {
  input: DailySummaryInput;
  rendered: RenderedDailySummary;
};

export type DailySummaryGenerationOptions = {
  configuration?: SummaryConfiguration;
  openDailyUrl?: string;
  now?: Date;
  calendarEvents?: LoadedCalendarEvents;
};

export type DailySummaryInputBuilder = typeof buildDailySummaryInput;

export type ScheduledDailySummaryGenerationDependencies = {
  userLifecycleStore: { isActive(userId: string): Promise<boolean> };
  configurationStore: Pick<UserSummaryConfigurationStore, 'load'>;
  todoStore: Pick<UserTodoPersistenceStore, 'load'>;
  weatherLocationStore: Pick<UserWeatherLocationPersistenceStore, 'load'>;
  commuteSetupStore: Pick<UserCommuteSetupStore, 'load'>;
  calendarEvents: Pick<UserCalendarEventsModule, 'load'>;
  weatherProvider: WeatherForecastProvider;
  weatherSummaryProvider?: WeatherSummaryProvider;
  commuteEstimateProvider: (
    userId: string
  ) => Pick<GoogleMapsRequestGateway, 'estimateCommute'> | undefined;
  buildInput?: DailySummaryInputBuilder;
  openDailyUrl?: string;
  now?: () => Date;
};

export const createDailySummaryGenerator = ({
  userLifecycleStore,
  configurationStore,
  todoStore,
  weatherLocationStore,
  commuteSetupStore,
  calendarEvents,
  weatherProvider,
  weatherSummaryProvider,
  commuteEstimateProvider,
  buildInput = buildDailySummaryInput,
  openDailyUrl = process.env.ORIGIN ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:5174/',
  now = () => new Date()
}: ScheduledDailySummaryGenerationDependencies) => ({
  async generate(
    userId: string,
    {
      configuration: requestedConfiguration,
      openDailyUrl: requestedOpenDailyUrl,
      now: requestedNow,
      calendarEvents: requestedCalendarEvents
    }: DailySummaryGenerationOptions = {}
  ): Promise<ScheduledDailySummaryGenerationResult> {
    if (!(await userLifecycleStore.isActive(userId))) {
      throw new ScheduledDailySummaryUserNotActiveError();
    }

    const configuration =
      requestedConfiguration ?? (await loadUserSummaryConfiguration(configurationStore, userId));
    const generatedAt = requestedNow ?? now();
    const [todoContext, weatherContext, commuteContext, loadedCalendarEvents] = await Promise.all([
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
      requestedCalendarEvents
        ? Promise.resolve(requestedCalendarEvents)
        : configuration.sectionPauses.calendar
          ? Promise.resolve({
              readiness: calendarReadinessForAuthMode('user'),
              selectedCalendars: [],
              eventResult: { outcome: 'not-requested' as const }
            })
          : calendarEvents
              .load({
                userId,
                userTimeZone: configuration.userTimeZone,
                now: generatedAt
              })
              .then((result) => result.calendarEvents)
    ]);
    const input = await buildInput({
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
      calendarEvents: loadedCalendarEvents,
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
