import { openMeteoWeatherForecastProvider } from '$lib/weatherForecast';
import { userCommuteSetupStore } from './db/commuteSetupStore';
import { userSummaryConfigurationStore } from './db/summaryConfigurationStore';
import { userTodoStore } from './db/todoStore';
import { userWeatherLocationStore } from './db/weatherLocationStore';
import { userLifecycleStore } from './db/userLifecycleStore';
import { userNameStore } from './db/userNameStore';
import { googleMapsOperations } from './googleMapsOperations';
import { openAiWeatherSummaryProvider, writeWeatherSummaryDiagnostic } from './weatherSummaryProvider';
import { createUserDailySummaryGenerator } from '$lib/dailySummaryGeneration/server';
import type { UserCalendarEventsModule } from './userCalendarEvents';

export const createProductionUserDailySummaryGenerator = (
  calendarEvents: Pick<UserCalendarEventsModule, 'load'>
) =>
  createUserDailySummaryGenerator({
    userNameStore,
    userLifecycleStore,
    configurationStore: userSummaryConfigurationStore,
    todoStore: userTodoStore,
    weatherLocationStore: userWeatherLocationStore,
    commuteSetupStore: userCommuteSetupStore,
    calendarEvents,
    weatherProvider: {
      async fetchDailyForecast(request) {
        const startedAt = performance.now();
        const result = await openMeteoWeatherForecastProvider.fetchDailyForecast(request);
        if (result.outcome === 'available' && !result.forecast.summaryInput) {
          writeWeatherSummaryDiagnostic({
            reason: 'missing-weather-context',
            durationMilliseconds: Math.round(performance.now() - startedAt),
            attempt: 0
          });
        }
        return result;
      }
    },
    weatherSummaryProvider: openAiWeatherSummaryProvider,
    commuteEstimateProvider: (userId) =>
      googleMapsOperations.requestGateway({ mode: 'user', userId })
  });
