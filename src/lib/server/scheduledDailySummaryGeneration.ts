import type { CalendarEventProvider } from '$lib/calendar';
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
import type { WeatherForecastProvider } from '$lib/weatherForecast';
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
  configurationStore: Pick<UserSummaryConfigurationStore, 'load'>;
  todoStore: Pick<UserTodoPersistenceStore, 'load'>;
  weatherLocationStore: Pick<UserWeatherLocationPersistenceStore, 'load'>;
  commuteSetupStore: Pick<UserCommuteSetupStore, 'load'>;
  calendarConnectionStore: ScheduledCalendarConnectionStore;
  loadCalendarAccessToken: (userId: string) => Promise<string | null>;
  calendarEventProvider: (accessToken: string) => CalendarEventProvider;
  weatherProvider: WeatherForecastProvider;
  commuteEstimateProvider: (
    userId: string
  ) => Pick<GoogleMapsRequestGateway, 'estimateCommute'> | undefined;
  now?: () => Date;
};

export const createScheduledDailySummaryGenerator = ({
  configurationStore,
  todoStore,
  weatherLocationStore,
  commuteSetupStore,
  calendarConnectionStore,
  loadCalendarAccessToken,
  calendarEventProvider,
  weatherProvider,
  commuteEstimateProvider,
  now = () => new Date()
}: ScheduledDailySummaryGenerationDependencies) => ({
  async generate(userId: string): Promise<ScheduledDailySummaryGenerationResult> {
    const configuration = await loadUserSummaryConfiguration(configurationStore, userId);
    const [todoState, weatherLocation, commuteSetup, calendarContext] = await Promise.all([
      loadUserTodoState(todoStore, userId),
      loadUserWeatherLocation(weatherLocationStore, userId),
      loadUserCommuteSetup(commuteSetupStore, userId),
      loadScheduledCalendarContext({
        userId,
        calendarEnabled: configuration.sections.calendar,
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
      commuteRoutes: commuteSetup.routes,
      commuteDays: commuteSetup.days,
      commuteEstimateProvider: configuration.sections.commute
        ? safelyLoadCommuteEstimateProvider(commuteEstimateProvider, userId)
        : undefined,
      calendarReadiness: calendarContext.readiness,
      selectedCalendars: calendarContext.selectedCalendars,
      calendarEventProvider: calendarContext.provider,
      now: generatedAt
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

  try {
    const accessToken = await loadAccessToken(userId);

    return accessToken
      ? {
          readiness: calendarReadinessForUserConnection(connection),
          selectedCalendars,
          provider: providerForAccessToken(accessToken)
        }
      : {
          readiness: calendarReadinessForUnavailableCredentials(),
          selectedCalendars: [],
          provider: undefined
        };
  } catch {
    return {
      readiness: calendarReadinessForUnavailableCredentials(),
      selectedCalendars: [],
      provider: undefined
    };
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
  if (!input.configuration.sections.weather) return 'inapplicable';
  return input.sections.weather.status === 'unavailable' ? 'unavailable' : 'qualifying';
};

const classifyCommuteContent = (input: DailySummaryInput): ScheduledSummarySectionContent => {
  if (!input.configuration.sections.commute) return 'inapplicable';
  if (input.sections.commute.status === 'unavailable') return 'unavailable';
  if (!input.commuteSection) return 'inapplicable';
  return input.commuteSection.estimates.some((estimate) => estimate.outcome === 'available')
    ? 'qualifying'
    : 'unavailable';
};

const classifyCalendarContent = (input: DailySummaryInput): ScheduledSummarySectionContent => {
  if (!input.configuration.sections.calendar) return 'inapplicable';
  if (input.sections.calendar.status === 'unavailable') return 'unavailable';
  if (!input.calendarSection) return 'empty';
  return input.calendarSection.today || input.calendarSection.weekAhead.length > 0
    ? 'qualifying'
    : 'empty';
};

const classifyTodoContent = (input: DailySummaryInput): ScheduledSummarySectionContent => {
  if (!input.configuration.sections.todo) return 'inapplicable';
  if (input.sections.todo.status === 'unavailable') return 'unavailable';
  return input.todoSection ? 'qualifying' : 'empty';
};
