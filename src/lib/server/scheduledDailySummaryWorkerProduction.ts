import { openMeteoWeatherForecastProvider } from '$lib/weatherForecast';
import {
  googleCalendarEventProvider,
  googleCalendarListProvider,
  isGoogleCalendarAuthorizationFailure,
  loadGoogleCalendarAccessToken
} from './googleCalendarList';
import { googleMapsOperations } from './googleMapsOperations';
import {
  dailySummaryDeliveryProvider,
  dailySummarySenderAddress
} from './dailySummaryDelivery';
import { createScheduledDelivery } from './scheduledDelivery';
import { createDailySummaryGenerator } from './scheduledDailySummaryGeneration';
import { db } from './db';
import { userCalendarConnectionStore } from './db/calendarConnectionStore';
import { userCommuteSetupStore } from './db/commuteSetupStore';
import { userSummaryConfigurationStore } from './db/summaryConfigurationStore';
import { userTodoStore } from './db/todoStore';
import { userWeatherLocationStore } from './db/weatherLocationStore';
import { userLifecycleStore } from './db/userLifecycleStore';
import { openAiWeatherSummaryProvider } from './weatherSummaryProvider';
import { createUserCalendarEvents } from './userCalendarEvents';

export const createProductionScheduledDailySummaryWorkerDependencies = () => {
  const calendarEvents = createUserCalendarEvents({
    connectionStore: userCalendarConnectionStore,
    loadAccessToken: loadGoogleCalendarAccessToken,
    eventProvider: googleCalendarEventProvider,
    calendarListProvider: googleCalendarListProvider,
    isAuthorizationFailure: isGoogleCalendarAuthorizationFailure
  });
  const generator = createDailySummaryGenerator({
    userLifecycleStore,
    configurationStore: userSummaryConfigurationStore,
    todoStore: userTodoStore,
    weatherLocationStore: userWeatherLocationStore,
    commuteSetupStore: userCommuteSetupStore,
    calendarEvents,
    weatherProvider: openMeteoWeatherForecastProvider,
    weatherSummaryProvider: openAiWeatherSummaryProvider,
    commuteEstimateProvider: (userId) =>
      googleMapsOperations.requestGateway({
        mode: 'user',
        userId
      })
  });
  const scheduledDelivery = createScheduledDelivery({
    database: db,
    generator,
    deliveryProvider: dailySummaryDeliveryProvider,
    providerName: 'resend',
    senderAddress: dailySummarySenderAddress
  });

  return {
    scheduledDelivery
  };
};
