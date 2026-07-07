import { buildDemoCalendarSection } from './demoCalendar';
import type { DailySummaryInput } from './dailySummaryRenderer';
import type { SummaryConfiguration } from './summaryConfiguration';
import { buildTodoSection, type TodoCategory, type TodoTask } from './todo';
import type { WeatherLocation } from './weatherLocation';
import {
  buildWeatherSection,
  openMeteoWeatherForecastProvider,
  type WeatherForecastProvider
} from './weatherForecast';

export type DailySummaryPreviewSetup = {
  configuration: SummaryConfiguration;
  todoCategories: TodoCategory[];
  todoTasks: TodoTask[];
  weatherLocation?: WeatherLocation | null;
  weatherProvider?: WeatherForecastProvider;
  now?: Date;
};

export const buildDailySummaryPreviewInput = async ({
  configuration,
  todoCategories,
  todoTasks,
  weatherLocation = null,
  weatherProvider = openMeteoWeatherForecastProvider,
  now = new Date()
}: DailySummaryPreviewSetup): Promise<DailySummaryInput> => {
  const demoCalendar = buildDemoCalendarSection({ userTimeZone: configuration.userTimeZone });
  const weather = await buildPreviewWeatherSection({
    configuration,
    weatherLocation,
    weatherProvider,
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
      calendar: {
        status: 'available',
        label: demoCalendar.label,
        detail: demoCalendar.summaryDetail
      },
      todo: {
        status: 'available',
        label: 'Todo',
        detail: 'No active Todo Tasks.'
      }
    },
    todoSection: buildTodoSection(todoCategories, todoTasks)
  };
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
