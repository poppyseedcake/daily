import {
  googleCalendarEventProvider,
  googleCalendarListProvider,
  isGoogleCalendarAuthorizationFailure,
  loadGoogleCalendarAccessToken
} from './googleCalendarList';
import {
  dailySummaryDeliveryProvider,
  dailySummarySenderAddress
} from './dailySummaryDelivery';
import { createScheduledDelivery } from './scheduledDelivery';
import { createProductionUserDailySummaryGenerator } from './productionUserDailySummaryGeneration';
import { db } from './db';
import { userCalendarConnectionStore } from './db/calendarConnectionStore';
import { createUserCalendarEvents } from './userCalendarEvents';

export const createProductionScheduledDailySummaryWorkerDependencies = () => {
  const calendarEvents = createUserCalendarEvents({
    connectionStore: userCalendarConnectionStore,
    loadAccessToken: loadGoogleCalendarAccessToken,
    eventProvider: googleCalendarEventProvider,
    calendarListProvider: googleCalendarListProvider,
    isAuthorizationFailure: isGoogleCalendarAuthorizationFailure
  });
  const generator = createProductionUserDailySummaryGenerator(calendarEvents);
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
