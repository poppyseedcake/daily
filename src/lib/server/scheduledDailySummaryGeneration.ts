import { calendarSectionHasEvents, type CalendarEventProvider } from '$lib/calendar';
import {
  calendarReadinessForAuthMode,
  calendarReadinessForUnavailableCredentials,
  calendarReadinessForUnavailableProvider,
  calendarReadinessForUserConnection,
  type UserCalendarReadinessConnection
} from '$lib/calendarReadiness';
import { buildDailySummaryInput } from '$lib/dailySummaryPreview';
import {
  renderDailySummary,
  type DailySummaryInput,
  type RenderedDailySummary
} from '$lib/dailySummaryRenderer';
import type { SavedSelectedCalendar } from '$lib/selectedCalendars';
import type { UserSummaryConfigurationStore } from './summaryConfigurationPersistence';
import { loadUserSummaryConfiguration } from './summaryConfigurationPersistence';
import type { UserTodoPersistenceStore } from './todoPersistence';
import { loadUserTodoState } from './todoPersistence';
import type { UserWeatherLocationPersistenceStore } from './weatherLocationPersistence';
import { loadUserWeatherLocation } from './weatherLocationPersistence';
import type { UserCommuteSetupStore } from './commuteSetupPersistence';
import { loadUserCommuteSetup } from './commuteSetupPersistence';
import type { WeatherForecastProvider, WeatherSummaryProvider } from '$lib/weatherForecast';
import type { GoogleMapsRequestGateway } from './googleMapsRequestGateway';

export type ScheduledSummarySectionContent =
  | 'qualifying'
  | 'empty'
  | 'inapplicable'
  | 'unavailable';

export type ScheduledDailySummaryGenerationResult = {
  input: DailySummaryInput;
  rendered: RenderedDailySummary;
  hasQualifyingContent: boolean;
  sectionContent: Record<keyof DailySummaryInput['sections'], ScheduledSummarySectionContent>;
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

export const createScheduledDailySummaryGenerator = ({
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
  async generate(userId: string): Promise<ScheduledDailySummaryGenerationResult> {
    if (!(await userLifecycleStore.isActive(userId))) {
      throw new ScheduledDailySummaryUserNotActiveError();
    }

    const configuration = await loadUserSummaryConfiguration(configurationStore, userId);
    const [todoState, weatherLocation, commuteContext, calendarContext] = await Promise.all([
      loadUserTodoState(todoStore, userId),
      loadUserWeatherLocation(weatherLocationStore, userId),
      loadScheduledCommuteContext({
        userId,
        commuteEnabled: configuration.sections.commute && !configuration.sectionPauses.commute,
        setupStore: commuteSetupStore
      }),
      loadScheduledCalendarContext({
        userId,
        calendarEnabled:
          configuration.sections.calendar && !configuration.sectionPauses.calendar,
        connectionStore: calendarConnectionStore,
        loadAccessToken: loadCalendarAccessToken,
        providerForAccessToken: calendarEventProvider
      })
    ]);
    const generatedAt = now();
    const input = await buildDailySummaryInput({
      authMode: 'user',
      configuration,
      todoCategories: todoState.todoCategories,
      todoTasks: todoState.todoTasks,
      weatherLocation,
      weatherProvider,
      weatherSummaryProvider,
      commuteRoutes: commuteContext.setup.routes,
      commuteDays: commuteContext.setup.days,
      commuteSetupUnavailable: commuteContext.unavailable,
      commuteEstimateMode: 'live',
      commuteEstimateProvider:
        configuration.sections.commute && !configuration.sectionPauses.commute
        ? safelyLoadCommuteEstimateProvider(commuteEstimateProvider, userId)
        : undefined,
      calendarReadiness: calendarContext.readiness,
      selectedCalendars: calendarContext.selectedCalendars,
      calendarEventProvider: calendarContext.provider,
      now: generatedAt,
      openDailyUrl
    });
    const sectionContent = classifySectionContent(input);

    return {
      input,
      rendered: renderDailySummary(input),
      hasQualifyingContent: Object.values(sectionContent).includes('qualifying'),
      sectionContent
    };
  }
});

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

const classifySectionContent = (
  input: DailySummaryInput
): ScheduledDailySummaryGenerationResult['sectionContent'] => ({
  weather: classifyWeatherContent(input),
  commute: classifyCommuteContent(input),
  calendar: classifyCalendarContent(input),
  todo: classifyTodoContent(input)
});

const classifyWeatherContent = (input: DailySummaryInput): ScheduledSummarySectionContent => {
  if (!input.configuration.sections.weather || input.configuration.sectionPauses.weather) {
    return 'inapplicable';
  }

  switch (input.sections.weather.status) {
    case 'unavailable':
      return 'unavailable';
    case 'unconfigured':
    case 'paused':
      return 'inapplicable';
    default:
      return 'qualifying';
  }
};

const classifyCommuteContent = (input: DailySummaryInput): ScheduledSummarySectionContent => {
  if (!input.configuration.sections.commute || input.configuration.sectionPauses.commute) {
    return 'inapplicable';
  }
  if (input.sections.commute.status === 'unavailable') return 'unavailable';
  if (input.sections.commute.status === 'empty') return 'empty';
  if (input.sections.commute.status === 'unconfigured' || input.sections.commute.status === 'paused') {
    return 'inapplicable';
  }
  if (!input.commuteSection) return 'inapplicable';
  return input.commuteSection.estimates.some((estimate) => estimate.outcome === 'available')
    ? 'qualifying'
    : 'unavailable';
};

const classifyCalendarContent = (input: DailySummaryInput): ScheduledSummarySectionContent => {
  if (!input.configuration.sections.calendar || input.configuration.sectionPauses.calendar) {
    return 'inapplicable';
  }
  if (input.sections.calendar.status === 'unavailable') return 'unavailable';
  if (input.sections.calendar.status === 'unconfigured' || input.sections.calendar.status === 'paused') {
    return 'inapplicable';
  }
  if (!input.calendarSection) return 'empty';
  return calendarSectionHasEvents(input.calendarSection)
    ? 'qualifying'
    : 'empty';
};

const classifyTodoContent = (input: DailySummaryInput): ScheduledSummarySectionContent => {
  if (!input.configuration.sections.todo || input.configuration.sectionPauses.todo) {
    return 'inapplicable';
  }
  if (input.sections.todo.status === 'unavailable') return 'unavailable';
  if (input.sections.todo.status === 'paused') return 'inapplicable';
  return input.todoSection ? 'qualifying' : 'empty';
};
