import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import {
  createGoogleMapsUsageGate,
  readGoogleMapsUsageCaps
} from '$lib/server/db/googleMapsUsageGate';
import { isGoogleMapsEnvironmentKillSwitchEnabled } from '$lib/server/googleMapsRequestGateway';

const usageGate = () =>
  createGoogleMapsUsageGate({
    database: db,
    ...readGoogleMapsUsageCaps({
      GOOGLE_MAPS_GLOBAL_DAILY_CAP: env.GOOGLE_MAPS_GLOBAL_DAILY_CAP,
      GOOGLE_MAPS_GLOBAL_MONTHLY_CAP: env.GOOGLE_MAPS_GLOBAL_MONTHLY_CAP,
      GOOGLE_MAPS_PER_PERSON_DAILY_LIMIT: env.GOOGLE_MAPS_PER_PERSON_DAILY_LIMIT
    })
  });

export const googleMapsOperations = {
  currentOperations: () =>
    usageGate().currentOperations(
      isGoogleMapsEnvironmentKillSwitchEnabled(env.GOOGLE_MAPS_KILL_SWITCH)
    ),
  setAdminKillSwitch: (enabled: boolean) => usageGate().setAdminKillSwitch(enabled)
};
