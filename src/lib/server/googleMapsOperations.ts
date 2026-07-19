import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import {
  changeGoogleMapsAdminKillSwitch,
  createGoogleMapsUsageGate,
  readGoogleMapsUsageCaps
} from '$lib/server/db/googleMapsUsageGate';
import { createTechnicalLogStore } from '$lib/server/db/technicalLogStore';
import { isGoogleMapsEnvironmentKillSwitchEnabled } from '$lib/server/googleMapsRequestGateway';
import { googleMapsCapAlertDelivery } from '$lib/server/googleMapsCapAlertDelivery';
import { createGoogleMapsRequestGateway } from './googleMapsRequestGateway';
import {
  createGoogleMapsPersonAttribution,
  type GoogleMapsAttributionAuthState
} from './googleMapsPersonAttribution';
import { createGoogleRoutesProvider } from './googleRoutesProvider';
import { createGooglePlacesProvider } from './googlePlacesProvider';
import { selectLocalPoint } from './localPointSelection';
import { createTechnicalEventRecorder } from './technicalEventRecorder';

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

const technicalEventRecorder = createTechnicalEventRecorder({
  store: createTechnicalLogStore(db)
});

export const googleMapsOperations = {
  currentOperations: () =>
    usageGate().currentOperations(
      isGoogleMapsEnvironmentKillSwitchEnabled(env.GOOGLE_MAPS_KILL_SWITCH)
    ),
  setAdminKillSwitch: async (enabled: boolean) => {
    const change = changeGoogleMapsAdminKillSwitch(db, enabled);
    if (!change.changed) return;

    await technicalEventRecorder.record({
      eventCode: 'admin-google-maps-kill-switch-changed',
      occurredAt: new Date().toISOString(),
      previousEnabled: change.previousEnabled,
      newEnabled: change.newEnabled
    });
  },
  requestGateway: (
    authState: GoogleMapsAttributionAuthState,
    visitorRequest?: { clientAddress: string; userAgent: string }
  ) =>
    createGoogleMapsRequestGateway({
      provider: {
        selectPoint: async (request) => selectLocalPoint(request),
        ...createGooglePlacesProvider({ apiKey: env.GOOGLE_MAPS_API_KEY ?? '' }),
        ...createGoogleRoutesProvider({ apiKey: env.GOOGLE_MAPS_API_KEY ?? '' })
      },
      usageGate: usageGate(),
      attribution: createGoogleMapsPersonAttribution({
        authState,
        visitorRequest,
        secret: env.GOOGLE_MAPS_ATTRIBUTION_SECRET ?? ''
      })
    })
};
