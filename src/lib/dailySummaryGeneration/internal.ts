import { buildDemoCalendarSection } from '../demoCalendar';
import {
  renderDailySummary,
  type DailySummaryInput,
  type RenderedDailySummary
} from '../dailySummaryRenderer';
import type { LocalSetupInput } from '../localSetup';
import {
  buildCalendarSection,
  calendarSectionHasEvents,
  type LoadedCalendarEvents
} from '../calendar';
import type { SummaryConfiguration } from '../summaryConfiguration';
import { buildTodoSection, type TodoCategory, type TodoTask } from '../todo';
import type { WeatherLocation } from '../weatherLocation';
import { calendarReadinessForAuthMode } from '../calendarReadiness';
import {
  buildWeatherSection,
  buildWeatherDisplayForecast,
  openMeteoWeatherForecastProvider,
  type WeatherForecastProvider,
  type WeatherSummaryProvider
} from '../weatherForecast';
import { Temporal } from '@js-temporal/polyfill';
import type { CommuteDay, CommuteRoute } from '../commuteRoute';
import {
  classifyCommuteTraffic,
  commuteTrafficDescription
} from '../commuteTraffic';
import type { GoogleMapsRequestGateway } from '../server/googleMapsRequestGateway';

export type DailySummaryGenerationContext = {
  calendarEvents?: LoadedCalendarEvents;
  configuration: SummaryConfiguration;
  todoCategories: TodoCategory[];
  todoTasks: TodoTask[];
  todoStateUnavailable?: boolean;
  weatherLocation?: WeatherLocation | null;
  weatherLocationUnavailable?: boolean;
  weatherProvider?: WeatherForecastProvider;
  weatherSummaryProvider?: WeatherSummaryProvider;
  commuteRoutes?: CommuteRoute[];
  commuteDays?: readonly CommuteDay[];
  commuteSetupUnavailable?: boolean;
  commuteEstimateProvider?: Pick<GoogleMapsRequestGateway, 'estimateCommute'>;
  commuteEstimateMode?: 'saved' | 'live';
};

export type DailySummaryGenerationOptions = {
  openDailyUrl?: string;
  now?: Date;
};

export type DailySummaryGenerationResult = {
  input: DailySummaryInput;
  rendered: RenderedDailySummary;
};

export type DailySummaryGenerator<Request, Options = DailySummaryGenerationOptions> = {
  generate(
    request: Request,
    options?: Options
  ): Promise<DailySummaryGenerationResult>;
};

type LoadedDailySummaryGenerationContext = {
  context: DailySummaryGenerationContext;
  generatedAt: Date;
};

export type DailySummaryGenerationSource<Request> = {
  load(
    request: Request,
    generatedAt: Date
  ):
    | DailySummaryGenerationContext
    | LoadedDailySummaryGenerationContext
    | Promise<DailySummaryGenerationContext | LoadedDailySummaryGenerationContext>;
};

export type DailySummaryGeneratorDependencies<Request> = {
  source: DailySummaryGenerationSource<Request>;
  openDailyUrl?: string;
  now?: () => Date;
};

const buildDailySummaryInput = async ({
  calendarEvents = {
    readiness: calendarReadinessForAuthMode('visitor'),
    selectedCalendars: [],
    eventResult: { outcome: 'not-requested' }
  },
  configuration,
  todoCategories,
  todoTasks,
  todoStateUnavailable = false,
  weatherLocation = null,
  weatherLocationUnavailable = false,
  weatherProvider = openMeteoWeatherForecastProvider,
  weatherSummaryProvider,
  commuteRoutes = [],
  commuteDays = [],
  commuteSetupUnavailable = false,
  commuteEstimateProvider,
  commuteEstimateMode = 'saved',
  openDailyUrl = '/',
  now = new Date()
}: DailySummaryGenerationContext & DailySummaryGenerationOptions): Promise<DailySummaryInput> => {
  const weather = await buildWeatherGenerationState({
    configuration,
    weatherLocation,
    weatherLocationUnavailable,
    weatherProvider,
    weatherSummaryProvider,
    assetOrigin: openDailyUrl,
    now
  });
  const calendarGeneration = buildCalendarGenerationResult({
    calendarEvents,
    configuration,
    now
  });
  const commuteGeneration = await buildCommuteGenerationResult({
    configuration,
    routes: commuteRoutes,
    days: commuteDays,
    setupUnavailable: commuteSetupUnavailable,
    provider: commuteEstimateProvider,
    mode: commuteEstimateMode,
    now
  });

  const todoSection = todoStateUnavailable ? null : buildTodoSection(todoCategories, todoTasks);

  return {
    userTimeZone: configuration.userTimeZone,
    generatedAt: new Date(now),
    openDailyUrl,
    sections: {
      weather,
      commute: commuteGeneration,
      calendar: calendarGeneration,
      todo: buildTodoGenerationSection({ configuration, todoSection, todoStateUnavailable })
    }
  };
};

export const createDailySummaryGenerator = <Request>({
  source,
  openDailyUrl = '/',
  now = () => new Date()
}: DailySummaryGeneratorDependencies<Request>): DailySummaryGenerator<Request> => ({
  async generate(request, options = {}) {
    const requestedAt = options.now ?? now();
    const loaded = await source.load(request, requestedAt);
    const { context, generatedAt } = 'context' in loaded
      ? loaded
      : { context: loaded, generatedAt: requestedAt };
    const input = await buildDailySummaryInput({
      ...context,
      openDailyUrl: options.openDailyUrl ?? openDailyUrl,
      now: generatedAt
    });

    return {
      input,
      rendered: renderDailySummary(input)
    };
  }
});

export const visitorDailySummaryGenerator = createDailySummaryGenerator<LocalSetupInput>({
  source: {
    load(setup) {
      return {
        configuration: setup.summaryConfiguration,
        todoCategories: setup.todoCategories,
        todoTasks: setup.todoTasks,
        weatherLocation: setup.weatherLocation,
        commuteRoutes: setup.commuteRoutes,
        commuteDays: setup.commuteDays
      };
    }
  }
});

const commuteDayByIsoDay = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
] as const;

const commuteRouteLabels = (route: CommuteRoute) => ({
  routeName: route.name,
  originLabel: route.origin.label,
  destinationLabel: route.destination.label
});

const buildCommuteGenerationResult = async ({ configuration, routes, days, setupUnavailable, provider, mode, now }: {
  configuration: SummaryConfiguration;
  routes: CommuteRoute[];
  days: readonly CommuteDay[];
  setupUnavailable: boolean;
  provider: Pick<GoogleMapsRequestGateway, 'estimateCommute'> | undefined;
  mode: 'saved' | 'live';
  now: Date;
}): Promise<DailySummaryInput['sections']['commute']> => {
  const localDay = commuteDayByIsoDay[
    Temporal.Instant.fromEpochMilliseconds(now.getTime())
      .toZonedDateTimeISO(configuration.userTimeZone).dayOfWeek - 1
  ];

  if (configuration.sectionPauses.commute) {
    return { status: 'paused', detail: 'Commute is paused.' };
  }

  const unavailable = (): DailySummaryInput['sections']['commute'] => ({
    status: 'unavailable',
    reason: 'Live Commute is unavailable right now.'
  });

  if (setupUnavailable) return unavailable();

  if (routes.length === 0) {
    return {
      status: 'unconfigured',
      detail: 'Add a Commute Route to include commute estimates.'
    };
  }

  const enabledRoutes = routes.slice(0, 5).filter(
    (route) => route.enabled && route.days.includes(localDay)
  );

  if (enabledRoutes.length === 0) {
    return { status: 'empty', detail: 'No Commute Routes are scheduled today.' };
  }

  if (mode === 'saved') {
    return {
      status: 'active',
      content: {
        label: 'Commute',
        estimates: enabledRoutes.map((route) => ({
          ...commuteRouteLabels(route),
          ...(route.previewDurationMinutes == null
            ? { outcome: 'unavailable' as const }
            : { outcome: 'available' as const, durationMinutes: route.previewDurationMinutes })
        }))
      }
    };
  }

  if (!provider) {
    return unavailable();
  }

  try {
    const settledResults = await Promise.allSettled(enabledRoutes.map(async (route) =>
      provider.estimateCommute({ origin: route.origin, destination: route.destination })
    ));
    const results = settledResults.map((settled, index) => ({
      route: enabledRoutes[index]!,
      result: settled.status === 'fulfilled'
        ? settled.value
        : { outcome: 'unavailable' as const, reason: 'provider-unavailable' as const }
    }));
    const hasSystemicFailure = results.some(({ result }) =>
      result.outcome === 'unavailable' &&
      result.reason !== 'route-unavailable' &&
      result.reason !== 'provider-unavailable'
    );
    const hasProviderFailure = results.some(({ result }) =>
      result.outcome === 'unavailable' && result.reason === 'provider-unavailable'
    );
    const estimates = results.map(({ route, result }) => {
      const routeLabels = commuteRouteLabels(route);

      if (result.outcome !== 'available') {
        return { ...routeLabels, outcome: 'unavailable' as const };
      }

      try {
        const trafficLevel = classifyCommuteTraffic(result.estimate);
        return {
          ...routeLabels,
          outcome: 'available' as const,
          durationMinutes: Math.round(result.estimate.durationMinutes),
          trafficLevel,
          trafficDescription: commuteTrafficDescription(trafficLevel)
        };
      } catch {
        return { ...routeLabels, outcome: 'unavailable' as const };
      }
    });
    const hasAvailableEstimate = estimates.some((estimate) => estimate.outcome === 'available');
    const hasMalformedEstimate = results.some(({ result }, index) =>
      result.outcome === 'available' && estimates[index]?.outcome === 'unavailable'
    );

    if (!hasAvailableEstimate && (hasSystemicFailure || hasProviderFailure || hasMalformedEstimate)) {
      return unavailable();
    }

    return {
      status: 'active',
      content: {
        label: 'Commute',
        estimates
      }
    };
  } catch {
    return unavailable();
  }
};

const buildCalendarGenerationResult = ({
  calendarEvents,
  configuration,
  now
}: {
  calendarEvents: LoadedCalendarEvents;
  configuration: SummaryConfiguration;
  now: Date;
}): DailySummaryInput['sections']['calendar'] => {
  const { readiness: calendarReadiness, selectedCalendars, eventResult } = calendarEvents;
  if (configuration.sectionPauses.calendar) {
    return { status: 'paused', detail: 'Calendar is paused.' };
  }

  if (calendarReadiness.status === 'demo') {
    return {
      status: 'active',
      detail: buildDemoCalendarSection({
        userTimeZone: configuration.userTimeZone,
        now
      }).summaryDetail
    };
  }

  if (calendarReadiness.status !== 'connected') {
    const unavailable =
      calendarReadiness.status === 'reconnect-required' ||
      calendarReadiness.status === 'unavailable';

    if (unavailable) {
      return {
        status: 'unavailable',
        reason: calendarReadiness.unavailableReason
      };
    }

    return {
      status: 'unconfigured',
      detail: calendarReadiness.unavailableReason
    };
  }

  if (selectedCalendars.length === 0) {
    return {
      status: 'unconfigured',
      detail: 'Select a Calendar to include Calendar Events.'
    };
  }

  if (eventResult.outcome === 'not-requested') {
    return {
      status: 'unavailable',
      reason: 'Calendar preview is unavailable until Calendar Events can be loaded.'
    };
  }

  if (eventResult.outcome === 'unavailable') {
    return {
      status: 'unavailable',
      reason: safeCalendarProviderReason(eventResult.reason)
    };
  }

  const calendarSection = buildCalendarSection({
    providerEvents: eventResult.events,
    selectedCalendars,
    userTimeZone: configuration.userTimeZone,
    now
  });

  return calendarSectionHasEvents(calendarSection)
    ? { status: 'active', content: calendarSection }
    : {
        status: 'empty',
        detail: 'No Calendar Events in the Week Ahead.',
        content: calendarSection
      };
};

const buildWeatherGenerationState = async ({
  configuration,
  weatherLocation,
  weatherLocationUnavailable,
  weatherProvider,
  weatherSummaryProvider,
  assetOrigin,
  now
}: {
  configuration: SummaryConfiguration;
  weatherLocation: WeatherLocation | null;
  weatherLocationUnavailable: boolean;
  weatherProvider: WeatherForecastProvider;
  weatherSummaryProvider?: WeatherSummaryProvider;
  assetOrigin: string;
  now: Date;
}): Promise<DailySummaryInput['sections']['weather']> => {
  if (configuration.sectionPauses.weather) {
    return {
      status: 'paused',
      detail: 'Weather is paused.'
    };
  }

  if (weatherLocationUnavailable) {
    return {
      status: 'unavailable',
      reason: 'Live weather is unavailable right now.'
    };
  }

  if (!weatherLocation) {
    return {
      status: 'unconfigured',
      detail: 'Choose a Weather Location to include local weather.'
    };
  }

  try {
    const forecastResult = await weatherProvider.fetchDailyForecast({
      latitude: weatherLocation.latitude,
      longitude: weatherLocation.longitude,
      timeZone: configuration.userTimeZone,
      targetDate: Temporal.Instant.fromEpochMilliseconds(now.getTime())
        .toZonedDateTimeISO(configuration.userTimeZone)
        .toPlainDate()
        .toString()
    });

    if (forecastResult.outcome === 'unavailable') {
      return {
        status: 'unavailable',
        reason: forecastResult.reason
      };
    }

    const weatherSection = forecastResult.forecast.currentTemperatureCelsius === undefined
      ? null
      : buildWeatherDisplayForecast({
          forecast: forecastResult.forecast,
          userTimeZone: configuration.userTimeZone,
          now,
          assetOrigin
        });

    if (!weatherSection && forecastResult.forecast.currentTemperatureCelsius !== undefined) {
      return {
        status: 'unavailable',
        reason: 'Live weather is unavailable right now.'
      };
    }

    const displayWeatherSection = weatherSection ?? null;

    let summary: string | undefined;
    if (forecastResult.forecast.summaryInput && weatherSummaryProvider) {
      try {
        const summaryResult = await weatherSummaryProvider.summarize(
          forecastResult.forecast.summaryInput
        );
        summary = summaryResult.outcome === 'available' ? summaryResult.sentence : undefined;
      } catch {
        summary = undefined;
      }
    }

    const state = buildWeatherSection({
      forecast: forecastResult.forecast,
      userTimeZone: configuration.userTimeZone,
      now,
      summary,
      assetOrigin
    });

    if (state.status === 'unavailable') {
      return { status: 'unavailable', reason: state.reason };
    }

    const content = summary && displayWeatherSection
      ? { ...displayWeatherSection, summary }
      : displayWeatherSection;

    return content
      ? { status: 'active', detail: state.detail, content }
      : { status: 'active', detail: state.detail };
  } catch {
    return {
      status: 'unavailable',
      reason: 'Live weather is unavailable right now.'
    };
  }
};

const buildTodoGenerationSection = ({
  configuration,
  todoSection,
  todoStateUnavailable
}: {
  configuration: SummaryConfiguration;
  todoSection: ReturnType<typeof buildTodoSection>;
  todoStateUnavailable: boolean;
}): DailySummaryInput['sections']['todo'] => {
  if (configuration.sectionPauses.todo) {
    return { status: 'paused', detail: 'Todo is paused.' };
  }

  if (todoStateUnavailable) {
    return {
      status: 'unavailable',
      reason: 'Todo data is temporarily unavailable.'
    };
  }

  return todoSection
    ? { status: 'active', content: todoSection }
    : { status: 'empty', detail: 'There are no active Todo Tasks.' };
};

const safeCalendarProviderReason = (reason: string) =>
  reason === 'Reconnect Google Calendar to include Calendar Events.'
    ? reason
    : 'Live Calendar is unavailable right now.';
