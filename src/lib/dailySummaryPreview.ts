import { buildDemoCalendarSection } from './demoCalendar';
import type { DailySummaryInput } from './dailySummaryRenderer';
import {
  buildCalendarEventFetchRequest,
  buildCalendarSection,
  type CalendarEventProvider
} from './calendar';
import type { SavedSelectedCalendar } from './selectedCalendars';
import type { SummaryConfiguration } from './summaryConfiguration';
import { buildTodoSection, type TodoCategory, type TodoTask } from './todo';
import type { WeatherLocation } from './weatherLocation';
import {
  calendarReadinessForAuthMode,
  type CalendarReadiness,
  type CalendarReadinessAuthMode
} from './calendarReadiness';
import {
  buildWeatherSection,
  openMeteoWeatherForecastProvider,
  type WeatherForecastProvider
} from './weatherForecast';
import { Temporal } from '@js-temporal/polyfill';
import type { CommuteDay, CommuteRoute } from './commuteRoute';
import type { GoogleMapsRequestGateway } from './server/googleMapsRequestGateway';

export type DailySummaryGenerationSetup = {
  authMode?: CalendarReadinessAuthMode;
  calendarReadiness?: CalendarReadiness;
  configuration: SummaryConfiguration;
  todoCategories: TodoCategory[];
  todoTasks: TodoTask[];
  weatherLocation?: WeatherLocation | null;
  weatherProvider?: WeatherForecastProvider;
  selectedCalendars?: SavedSelectedCalendar[];
  calendarEventProvider?: CalendarEventProvider;
  commuteRoutes?: CommuteRoute[];
  commuteDays?: readonly CommuteDay[];
  commuteEstimateProvider?: Pick<GoogleMapsRequestGateway, 'estimateCommute'>;
  now?: Date;
};

export const buildDailySummaryInput = async ({
  authMode = 'visitor',
  calendarReadiness = calendarReadinessForAuthMode(authMode),
  configuration,
  todoCategories,
  todoTasks,
  weatherLocation = null,
  weatherProvider = openMeteoWeatherForecastProvider,
  selectedCalendars = [],
  calendarEventProvider,
  commuteRoutes = [],
  commuteDays = [],
  commuteEstimateProvider,
  now = new Date()
}: DailySummaryGenerationSetup): Promise<DailySummaryInput> => {
  const weather = await buildWeatherGenerationState({
    configuration,
    weatherLocation,
    weatherProvider,
    now
  });
  const calendarGeneration = await buildCalendarGenerationResult({
    calendarReadiness,
    configuration,
    selectedCalendars,
    calendarEventProvider,
    now
  });
  const commuteGeneration = await buildCommuteGenerationResult({
    configuration,
    routes: commuteRoutes,
    days: commuteDays,
    provider: commuteEstimateProvider,
    now
  });

  return {
    configuration,
    sections: {
      weather,
      commute: commuteGeneration.sectionState,
      calendar: calendarGeneration.sectionState,
      todo: {
        status: 'available',
        label: 'Todo',
        detail: 'No active Todo Tasks.'
      }
    },
    calendarSection: calendarGeneration.calendarSection,
    commuteSection: commuteGeneration.commuteSection,
    todoSection: buildTodoSection(todoCategories, todoTasks)
  };
};

const commuteDayByIsoDay = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
] as const;

const buildCommuteGenerationResult = async ({ configuration, routes, days, provider, now }: {
  configuration: SummaryConfiguration;
  routes: CommuteRoute[];
  days: readonly CommuteDay[];
  provider: Pick<GoogleMapsRequestGateway, 'estimateCommute'> | undefined;
  now: Date;
}): Promise<{
  commuteSection: DailySummaryInput['commuteSection'];
  sectionState: DailySummaryInput['sections']['commute'];
}> => {
  const localDay = commuteDayByIsoDay[
    Temporal.Instant.fromEpochMilliseconds(now.getTime())
      .toZonedDateTimeISO(configuration.userTimeZone).dayOfWeek - 1
  ];
  const enabledRoutes = routes.filter((route) => route.enabled);

  if (!configuration.sections.commute || !days.includes(localDay) || enabledRoutes.length === 0) {
    return { commuteSection: null, sectionState: { status: 'available', label: 'Commute', detail: '' } };
  }

  const unavailable = () => ({
    commuteSection: null,
    sectionState: {
      status: 'unavailable' as const,
      label: 'Commute',
      reason: 'Live Commute is unavailable right now.'
    }
  });

  if (!provider) {
    return unavailable();
  }

  try {
    const results = await Promise.all(enabledRoutes.map(async (route) => ({
      route,
      result: await provider.estimateCommute({ origin: route.origin, destination: route.destination })
    })));

    if (results.some(({ result }) => result.outcome === 'unavailable' && result.reason !== 'route-unavailable')) {
      return unavailable();
    }

    return {
      commuteSection: {
        label: 'Commute',
        estimates: results.map(({ route, result }) => ({
          routeName: route.name,
          ...(result.outcome === 'available'
            ? { outcome: 'available' as const, durationMinutes: Math.round(result.estimate.durationMinutes) }
            : { outcome: 'unavailable' as const })
        }))
      },
      sectionState: { status: 'available', label: 'Commute', detail: '' }
    };
  } catch {
    return unavailable();
  }
};

const buildCalendarGenerationResult = async ({
  calendarReadiness,
  configuration,
  selectedCalendars,
  calendarEventProvider,
  now
}: {
  calendarReadiness: CalendarReadiness;
  configuration: SummaryConfiguration;
  selectedCalendars: SavedSelectedCalendar[];
  calendarEventProvider: CalendarEventProvider | undefined;
  now: Date;
}): Promise<{
  calendarSection: DailySummaryInput['calendarSection'];
  sectionState: DailySummaryInput['sections']['calendar'];
}> => {
  if (calendarReadiness.status === 'demo') {
    return {
      calendarSection: null,
      sectionState: {
        status: 'available',
        label: calendarReadiness.label,
        detail: buildDemoCalendarSection({
          userTimeZone: configuration.userTimeZone
        }).summaryDetail
      }
    };
  }

  if (calendarReadiness.status !== 'connected') {
    return {
      calendarSection: null,
      sectionState: {
        status: 'unavailable',
        label: calendarReadiness.label,
        reason: calendarReadiness.unavailableReason
      }
    };
  }

  if (!configuration.sections.calendar) {
    return {
      calendarSection: null,
      sectionState: { status: 'available', label: 'Calendar', detail: '' }
    };
  }

  if (selectedCalendars.length === 0) {
    return {
      calendarSection: null,
      sectionState: {
        status: 'available',
        label: 'Calendar',
        detail: 'No calendars are selected.'
      }
    };
  }

  if (!calendarEventProvider) {
    return {
      calendarSection: null,
      sectionState: {
        status: 'unavailable',
        label: 'Calendar',
        reason: 'Calendar preview is unavailable until Calendar Events can be loaded.'
      }
    };
  }

  try {
    const providerResult = await calendarEventProvider.fetchEvents(
      buildCalendarEventFetchRequest({
        selectedCalendars,
        userTimeZone: configuration.userTimeZone,
        now
      })
    );

    if (providerResult.outcome === 'unavailable') {
      return {
        calendarSection: null,
        sectionState: {
          status: 'unavailable',
          label: 'Calendar',
          reason: providerResult.reason
        }
      };
    }

    return {
      calendarSection: buildCalendarSection({
        providerEvents: providerResult.events,
        selectedCalendars,
        userTimeZone: configuration.userTimeZone,
        now
      }),
      sectionState: {
        status: 'available',
        label: 'Calendar',
        detail: 'No Calendar Events in the next week.'
      }
    };
  } catch {
    console.warn('Calendar Event provider failed during Daily Summary generation.');

    return {
      calendarSection: null,
      sectionState: {
        status: 'unavailable',
        label: 'Calendar',
        reason: 'Live Calendar is unavailable right now.'
      }
    };
  }
};

const buildWeatherGenerationState = async ({
  configuration,
  weatherLocation,
  weatherProvider,
  now
}: {
  configuration: SummaryConfiguration;
  weatherLocation: WeatherLocation | null;
  weatherProvider: WeatherForecastProvider;
  now: Date;
}): Promise<DailySummaryInput['sections']['weather']> => {
  if (!configuration.sections.weather) {
    return {
      status: 'available',
      label: 'Weather',
      detail: ''
    };
  }

  if (!weatherLocation) {
    return {
      status: 'unavailable',
      label: 'Weather',
      reason: 'Choose a Weather Location to preview live weather.'
    };
  }

  try {
    const forecastResult = await weatherProvider.fetchDailyForecast({
      latitude: weatherLocation.latitude,
      longitude: weatherLocation.longitude,
      timeZone: configuration.userTimeZone
    });

    if (forecastResult.outcome === 'unavailable') {
      return {
        status: 'unavailable',
        label: 'Weather',
        reason: forecastResult.reason
      };
    }

    return buildWeatherSection({
      forecast: forecastResult.forecast,
      userTimeZone: configuration.userTimeZone,
      now
    });
  } catch {
    return {
      status: 'unavailable',
      label: 'Weather',
      reason: 'Live weather is unavailable right now.'
    };
  }
};
