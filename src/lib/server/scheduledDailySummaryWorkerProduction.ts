import { openMeteoWeatherForecastProvider } from '$lib/weatherForecast';
import { googleCalendarEventProvider, loadGoogleCalendarAccessToken } from './googleCalendarList';
import { googleMapsOperations } from './googleMapsOperations';
import {
  dailySummaryDeliveryProvider,
  dailySummarySenderAddress
} from './dailySummaryDelivery';
import { createScheduledDailySummaryDelivery } from './scheduledDailySummaryDelivery';
import { createScheduledDailySummaryGenerator } from './scheduledDailySummaryGeneration';
import { userCalendarConnectionStore } from './db/calendarConnectionStore';
import { userCommuteSetupStore } from './db/commuteSetupStore';
import { deliveryRecordStore } from './db/deliveryRecordStore';
import { scheduledDailySummaryOccurrenceStore } from './db/scheduledDailySummaryOccurrenceStore';
import { userSummaryConfigurationStore } from './db/summaryConfigurationStore';
import { userTodoStore } from './db/todoStore';
import { userWeatherLocationStore } from './db/weatherLocationStore';

export const createProductionScheduledDailySummaryWorkerDependencies = () => {
  const generator = createScheduledDailySummaryGenerator({
    configurationStore: userSummaryConfigurationStore,
    todoStore: userTodoStore,
    weatherLocationStore: userWeatherLocationStore,
    commuteSetupStore: userCommuteSetupStore,
    calendarConnectionStore: userCalendarConnectionStore,
    loadCalendarAccessToken: loadGoogleCalendarAccessToken,
    calendarEventProvider: googleCalendarEventProvider,
    weatherProvider: openMeteoWeatherForecastProvider,
    commuteEstimateProvider: (userId) =>
      googleMapsOperations.requestGateway({
        mode: 'user',
        userId
      })
  });
  const delivery = createScheduledDailySummaryDelivery({
    occurrenceStore: scheduledDailySummaryOccurrenceStore,
    deliveryRecordStore,
    generator,
    deliveryProvider: dailySummaryDeliveryProvider,
    providerName: 'resend',
    senderAddress: dailySummarySenderAddress
  });

  return {
    occurrenceStore: scheduledDailySummaryOccurrenceStore,
    delivery
  };
};
