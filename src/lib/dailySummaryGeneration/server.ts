import { randomUUID } from 'node:crypto';
import { createWeatherSectionGenerator } from './weatherSection';
import type { WeatherSummaryDiagnostic } from '$lib/weatherSummaryContract';
import type { LoadedCalendarEvents } from '$lib/calendar';
import { calendarReadinessForAuthMode } from '$lib/calendarReadiness';
import {
  createDailySummaryGenerator,
  type DailySummaryGenerator
} from './internal';
import type { SummaryConfiguration } from '$lib/summaryConfiguration';
import type { UserSummaryConfigurationStore } from '$lib/server/summaryConfigurationPersistence';
import { loadUserSummaryConfiguration } from '$lib/server/summaryConfigurationPersistence';
import type { UserTodoPersistenceStore } from '$lib/server/todoPersistence';
import { loadUserTodoStateSafely } from '$lib/server/todoPersistence';
import type { UserWeatherLocationPersistenceStore } from '$lib/server/weatherLocationPersistence';
import { loadUserWeatherLocation } from '$lib/server/weatherLocationPersistence';
import type { UserCommuteSetupStore } from '$lib/server/commuteSetupPersistence';
import { loadUserCommuteSetup } from '$lib/server/commuteSetupPersistence';
import type { WeatherForecastProvider, WeatherSummaryProvider } from '$lib/weatherForecast';
import type { GoogleMapsRequestGateway } from '$lib/server/googleMapsRequestGateway';
import type { UserCalendarEventsModule } from '$lib/server/userCalendarEvents';

export type UserDailySummaryRequest =
  | {
      userId: string;
      configuration?: SummaryConfiguration;
      snapshot?: never;
    }
  | {
      userId: string;
      configuration?: never;
      snapshot: {
        configuration: SummaryConfiguration;
        calendarEvents: LoadedCalendarEvents;
        generatedAt: Date;
      };
    };

export type UserDailySummaryGenerationOptions = {
  openDailyUrl?: string;
};

export type UserDailySummaryGenerationDependencies = {
  userNameStore?: { load(userId: string): Promise<string | undefined> };
  userLifecycleStore: { isActive(userId: string): Promise<boolean> };
  configurationStore: Pick<UserSummaryConfigurationStore, 'load'>;
  todoStore: Pick<UserTodoPersistenceStore, 'load'>;
  weatherLocationStore: Pick<UserWeatherLocationPersistenceStore, 'load'>;
  commuteSetupStore: Pick<UserCommuteSetupStore, 'load'>;
  calendarEvents: Pick<UserCalendarEventsModule, 'load'>;
  weatherProvider: WeatherForecastProvider;
  weatherSummaryProvider?: WeatherSummaryProvider;
  weatherDiagnostic?: (diagnostic: WeatherSummaryDiagnostic) => void;
  commuteEstimateProvider: (
    userId: string
  ) => Pick<GoogleMapsRequestGateway, 'estimateCommute'> | undefined;
  openDailyUrl?: string;
  now?: () => Date;
};

export const createUserDailySummaryGenerator = ({
  userNameStore,
  userLifecycleStore,
  configurationStore,
  todoStore,
  weatherLocationStore,
  commuteSetupStore,
  calendarEvents,
  weatherProvider,
  weatherSummaryProvider,
  weatherDiagnostic,
  commuteEstimateProvider,
  openDailyUrl = process.env.ORIGIN ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:5174/',
  now = () => new Date()
}: UserDailySummaryGenerationDependencies): DailySummaryGenerator<
  UserDailySummaryRequest,
  UserDailySummaryGenerationOptions
> => {
  const weatherSummarySessionId = `daily-summary-${process.pid}-${randomUUID()}`;
  const weatherSectionGenerator = createWeatherSectionGenerator({
    forecastProvider: weatherProvider,
    summaryProvider: weatherSummaryProvider,
    onDiagnostic: weatherDiagnostic
  });
  const generator = createDailySummaryGenerator<UserDailySummaryRequest>({
    openDailyUrl,
    now,
    source: {
      async load(
        { userId, configuration: requestedConfiguration, snapshot },
        requestedAt
      ) {
        if (!(await userLifecycleStore.isActive(userId))) {
          throw new UserDailySummaryNotActiveError();
        }

        const generatedAt = snapshot?.generatedAt ?? requestedAt;
        const configuration = snapshot?.configuration ?? requestedConfiguration ??
          (await loadUserSummaryConfiguration(configurationStore, userId));
        const [todoContext, weatherContext, commuteContext, loadedCalendarEvents, userName] =
          await Promise.all([
            loadUserTodoStateSafely(todoStore, userId, {
              enabled: !configuration.sectionPauses.todo
            }),
            loadUserWeatherContext({
              userId,
              weatherEnabled: !configuration.sectionPauses.weather,
              locationStore: weatherLocationStore
            }),
            loadUserCommuteContext({
              userId,
              commuteEnabled: !configuration.sectionPauses.commute,
              setupStore: commuteSetupStore
            }),
            snapshot
              ? Promise.resolve(snapshot.calendarEvents)
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
                    .then((result) => result.calendarEvents),
            userNameStore
              ? Promise.resolve().then(() => userNameStore.load(userId)).catch(() => undefined)
              : undefined
          ]);

        return {
          generatedAt,
          context: {
            userName,
            configuration,
            todoCategories: todoContext.state.todoCategories,
            todoTasks: todoContext.state.todoTasks,
            todoStateUnavailable: todoContext.unavailable,
            weatherLocation: weatherContext.location,
            weatherLocationUnavailable: weatherContext.unavailable,
            weatherSectionGenerator,
            ...(weatherSummaryProvider
              ? { weatherSummaryObservability: { distinctId: userId, sessionId: weatherSummarySessionId } }
              : {}),
            commuteRoutes: commuteContext.setup.routes,
            commuteDays: commuteContext.setup.days,
            commuteSetupUnavailable: commuteContext.unavailable,
            commuteEstimateMode: 'live',
            commuteEstimateProvider:
              !configuration.sectionPauses.commute
                ? safelyLoadCommuteEstimateProvider(commuteEstimateProvider, userId)
                : undefined,
            calendarEvents: loadedCalendarEvents
          }
        };
      }
    }
  });

  return {
    generate: (request, options) => generator.generate(request, options)
  };
};

export class UserDailySummaryNotActiveError extends Error {
  constructor() {
    super('Daily Summary generation requires an active User.');
    this.name = 'UserDailySummaryNotActiveError';
  }
}

const safelyLoadCommuteEstimateProvider = (
  providerForUser: UserDailySummaryGenerationDependencies['commuteEstimateProvider'],
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

const loadUserWeatherContext = async ({
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

const loadUserCommuteContext = async ({
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
