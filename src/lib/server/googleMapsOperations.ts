import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import {
  createGoogleMapsUsageGate,
  readGoogleMapsUsageCaps,
  setGoogleMapsAdminKillSwitch
} from '$lib/server/db/googleMapsUsageGate';
import { isGoogleMapsEnvironmentKillSwitchEnabled } from '$lib/server/googleMapsRequestGateway';
import { googleMapsCapAlertDelivery } from '$lib/server/googleMapsCapAlertDelivery';
import { createGoogleMapsRequestGateway } from './googleMapsRequestGateway';
import { createGoogleMapsPersonAttribution } from './googleMapsPersonAttribution';
import { createGoogleRoutesProvider } from './googleRoutesProvider';
import type { DailyPageAuthState } from './pageAuthState';

const usageGate = () =>
  createGoogleMapsUsageGate({
    database: db,
    capAlertDelivery: googleMapsCapAlertDelivery,
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
  setAdminKillSwitch: async (enabled: boolean) => setGoogleMapsAdminKillSwitch(db, enabled),
  requestGateway: (authState: DailyPageAuthState, visitorRequest?: { clientAddress: string; userAgent: string }) =>
    createGoogleMapsRequestGateway({
      provider: createGoogleRoutesProvider({ apiKey: env.GOOGLE_MAPS_API_KEY ?? '' }),
      usageGate: usageGate(),
      attribution: createGoogleMapsPersonAttribution({
        authState,
        visitorRequest,
        secret: env.GOOGLE_MAPS_ATTRIBUTION_SECRET ?? ''
      })
    })
};
