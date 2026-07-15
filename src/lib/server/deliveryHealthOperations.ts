import { db } from '$lib/server/db';
import {
  createDeliveryHealthStore,
  scheduledWorkerOverdueMinutesFromEnvironment
} from '$lib/server/db/deliveryHealthStore';

const deliveryHealthStore = createDeliveryHealthStore(db);

export const deliveryHealthOperations = {
  current: () =>
    deliveryHealthStore.load({
      now: new Date().toISOString(),
      overdueThresholdMinutes: scheduledWorkerOverdueMinutesFromEnvironment()
    })
};
