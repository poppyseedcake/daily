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

export type DailySummaryPreviewSetup = {
  authMode?: CalendarReadinessAuthMode;
  calendarReadiness?: CalendarReadiness;
  configuration: SummaryConfiguration;
  todoCategories: TodoCategory[];
  todoTasks: TodoTask[];
  weatherLocation?: WeatherLocation | null;
  weatherProvider?: WeatherForecastProvider;
  selectedCalendars?: SavedSelectedCalendar[];
  calendarEventProvider?: CalendarEventProvider;
  now?: Date;
};

export const buildDailySummaryPreviewInput = async ({
  authMode = 'visitor',
  calendarReadiness = calendarReadinessForAuthMode(authMode),
  configuration,
  todoCategories,
  todoTasks,
  weatherLocation = null,
  weatherProvider = openMeteoWeatherForecastProvider,
  selectedCalendars = [],
  calendarEventProvider,
  now = new Date()
}: DailySummaryPreviewSetup): Promise<DailySummaryInput> => {
  const demoCalendar = buildDemoCalendarSection({ userTimeZone: configuration.userTimeZone });
  const weather = await buildPreviewWeatherSection({
    configuration,
    weatherLocation,
    weatherProvider,
    now
  });
  const calendarSection = await buildPreviewCalendarSection({
    calendarReadiness,
    configuration,
    selectedCalendars,
    calendarEventProvider,
    now
  });

  return {
    configuration,
    sections: {
      weather,
      commute: {
        status: 'available',
        label: 'Mock Commute',
        detail: 'Mock provider data: 24 minutes by tram to the office.'
      },
      calendar:
        calendarReadiness.status === 'demo'
          ? {
              status: 'available',
              label: calendarReadiness.label,
              detail: demoCalendar.summaryDetail
            }
          : calendarSection.sectionState,
      todo: {
        status: 'available',
        label: 'Todo',
        detail: 'No active Todo Tasks.'
      }
    },
    calendarSection: calendarSection.calendarSection,
    todoSection: buildTodoSection(todoCategories, todoTasks)
  };
};

const buildPreviewCalendarSection = async ({
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
        detail: calendarReadiness.detail
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

const buildPreviewWeatherSection = async ({
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
