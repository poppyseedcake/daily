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
    configuration,
    generatedAt: new Date(now),
    openDailyUrl,
    sections: {
      weather: weather.sectionState,
      commute: commuteGeneration.sectionState,
      calendar: calendarGeneration.sectionState,
      todo: buildTodoGenerationState({ configuration, todoSection, todoStateUnavailable })
    },
    calendarSection: calendarGeneration.calendarSection,
    commuteSection: commuteGeneration.commuteSection,
    weatherSection: weather.weatherSection,
    todoSection
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
}): Promise<{
  commuteSection: DailySummaryInput['commuteSection'];
  sectionState: DailySummaryInput['sections']['commute'];
}> => {
  const localDay = commuteDayByIsoDay[
    Temporal.Instant.fromEpochMilliseconds(now.getTime())
      .toZonedDateTimeISO(configuration.userTimeZone).dayOfWeek - 1
  ];

  if (configuration.sectionPauses.commute) {
    return {
      commuteSection: null,
      sectionState: { status: 'paused', label: 'Commute', detail: 'Commute is paused.' }
    };
  }

  const unavailable = () => ({
    commuteSection: null,
    sectionState: {
      status: 'unavailable' as const,
      label: 'Commute',
      reason: 'Live Commute is unavailable right now.'
    }
  });

  if (setupUnavailable) return unavailable();

  if (routes.length === 0) {
    return {
      commuteSection: null,
      sectionState: {
        status: 'unconfigured',
        label: 'Commute',
        detail: 'Add a Commute Route to include commute estimates.'
      }
    };
  }

  const enabledRoutes = routes.slice(0, 5).filter(
    (route) => route.enabled && route.days.includes(localDay)
  );

  if (enabledRoutes.length === 0) {
    return {
      commuteSection: null,
      sectionState: {
        status: 'empty',
        label: 'Commute',
        detail: 'No Commute Routes are scheduled today.'
      }
    };
  }

  if (mode === 'saved') {
    return {
      commuteSection: {
        label: 'Commute',
        estimates: enabledRoutes.map((route) => ({
          ...commuteRouteLabels(route),
          ...(route.previewDurationMinutes == null
            ? { outcome: 'unavailable' as const }
            : { outcome: 'available' as const, durationMinutes: route.previewDurationMinutes })
        }))
      },
      sectionState: { status: 'active', label: 'Commute' }
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
      commuteSection: {
        label: 'Commute',
        estimates
      },
      sectionState: { status: 'active', label: 'Commute' }
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
}): {
  calendarSection: DailySummaryInput['calendarSection'];
  sectionState: DailySummaryInput['sections']['calendar'];
} => {
  const { readiness: calendarReadiness, selectedCalendars, eventResult } = calendarEvents;
  if (configuration.sectionPauses.calendar) {
    return {
      calendarSection: null,
      sectionState: { status: 'paused', label: 'Calendar', detail: 'Calendar is paused.' }
    };
  }

  if (calendarReadiness.status === 'demo') {
    return {
      calendarSection: null,
      sectionState: {
        status: 'active',
        label: 'Calendar',
        detail: buildDemoCalendarSection({
          userTimeZone: configuration.userTimeZone,
          now
        }).summaryDetail
      }
    };
  }

  if (calendarReadiness.status !== 'connected') {
    const unavailable =
      calendarReadiness.status === 'reconnect-required' ||
      calendarReadiness.status === 'unavailable';

    if (unavailable) {
      return {
        calendarSection: null,
        sectionState: {
          status: 'unavailable',
          label: 'Calendar',
          reason: calendarReadiness.unavailableReason
        }
      };
    }

    return {
      calendarSection: null,
      sectionState: {
        status: 'unconfigured',
        label: 'Calendar',
        detail: calendarReadiness.unavailableReason
      }
    };
  }

  if (selectedCalendars.length === 0) {
    return {
      calendarSection: null,
      sectionState: {
        status: 'unconfigured',
        label: 'Calendar',
        detail: 'Select a Calendar to include Calendar Events.'
      }
    };
  }

  if (eventResult.outcome === 'not-requested') {
    return {
      calendarSection: null,
      sectionState: {
        status: 'unavailable',
        label: 'Calendar',
        reason: 'Calendar preview is unavailable until Calendar Events can be loaded.'
      }
    };
  }

  if (eventResult.outcome === 'unavailable') {
    return {
      calendarSection: null,
      sectionState: {
        status: 'unavailable',
        label: 'Calendar',
        reason: safeCalendarProviderReason(eventResult.reason)
      }
    };
  }

  const calendarSection = buildCalendarSection({
    providerEvents: eventResult.events,
    selectedCalendars,
    userTimeZone: configuration.userTimeZone,
    now
  });

  return {
    calendarSection,
    sectionState: calendarSectionHasEvents(calendarSection)
      ? { status: 'active', label: 'Calendar' }
      : { status: 'empty', label: 'Calendar', detail: 'No Calendar Events in the Week Ahead.' }
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
}): Promise<{
  sectionState: DailySummaryInput['sections']['weather'];
  weatherSection: DailySummaryInput['weatherSection'];
}> => {
  if (configuration.sectionPauses.weather) {
    return {
      sectionState: {
        status: 'paused',
        label: 'Weather',
        detail: 'Weather is paused.'
      },
      weatherSection: null
    };
  }

  if (weatherLocationUnavailable) {
    return {
      sectionState: {
        status: 'unavailable',
        label: 'Weather',
        reason: 'Live weather is unavailable right now.'
      },
      weatherSection: null
    };
  }

  if (!weatherLocation) {
    return {
      sectionState: {
        status: 'unconfigured',
        label: 'Weather',
        detail: 'Choose a Weather Location to include local weather.'
      },
      weatherSection: null
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
        sectionState: {
          status: 'unavailable',
          label: 'Weather',
          reason: forecastResult.reason
        },
        weatherSection: null
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
        sectionState: {
          status: 'unavailable',
          label: 'Weather',
          reason: 'Live weather is unavailable right now.'
        },
        weatherSection: null
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

    return {
      sectionState: buildWeatherSection({
        forecast: forecastResult.forecast,
        userTimeZone: configuration.userTimeZone,
        now,
        summary,
        assetOrigin
      }),
      weatherSection: summary && displayWeatherSection
        ? { ...displayWeatherSection, summary }
        : displayWeatherSection
    };
  } catch {
    return {
      sectionState: {
        status: 'unavailable',
        label: 'Weather',
        reason: 'Live weather is unavailable right now.'
      },
      weatherSection: null
    };
  }
};

const buildTodoGenerationState = ({
  configuration,
  todoSection,
  todoStateUnavailable
}: {
  configuration: SummaryConfiguration;
  todoSection: DailySummaryInput['todoSection'];
  todoStateUnavailable: boolean;
}): DailySummaryInput['sections']['todo'] => {
  if (configuration.sectionPauses.todo) {
    return { status: 'paused', label: 'Todo', detail: 'Todo is paused.' };
  }

  if (todoStateUnavailable) {
    return {
      status: 'unavailable',
      label: 'Todo',
      reason: 'Todo data is temporarily unavailable.'
    };
  }

  return todoSection
    ? { status: 'active', label: 'Todo' }
    : { status: 'empty', label: 'Todo', detail: 'There are no active Todo Tasks.' };
};

const safeCalendarProviderReason = (reason: string) =>
  reason === 'Reconnect Google Calendar to include Calendar Events.'
    ? reason
    : 'Live Calendar is unavailable right now.';
