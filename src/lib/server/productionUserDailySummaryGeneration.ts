import { openMeteoWeatherForecastProvider } from '$lib/weatherForecast';
import { userCommuteSetupStore } from './db/commuteSetupStore';
import { userSummaryConfigurationStore } from './db/summaryConfigurationStore';
import { userTodoStore } from './db/todoStore';
import { userWeatherLocationStore } from './db/weatherLocationStore';
import { userLifecycleStore } from './db/userLifecycleStore';
import { googleMapsOperations } from './googleMapsOperations';
import { openAiWeatherSummaryProvider } from './weatherSummaryProvider';
import { createUserDailySummaryGenerator } from '$lib/dailySummaryGeneration/server';
import type { UserCalendarEventsModule } from './userCalendarEvents';

export const createProductionUserDailySummaryGenerator = (
  calendarEvents: Pick<UserCalendarEventsModule, 'load'>
) =>
  createUserDailySummaryGenerator({
    userLifecycleStore,
    configurationStore: userSummaryConfigurationStore,
    todoStore: userTodoStore,
    weatherLocationStore: userWeatherLocationStore,
    commuteSetupStore: userCommuteSetupStore,
    calendarEvents,
    weatherProvider: openMeteoWeatherForecastProvider,
    weatherSummaryProvider: openAiWeatherSummaryProvider,
    commuteEstimateProvider: (userId) =>
      googleMapsOperations.requestGateway({ mode: 'user', userId })
  });
