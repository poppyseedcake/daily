import { env } from '$env/dynamic/private';
import { z } from 'zod';

export type GoogleMapsCallCategory = 'map-point-selection' | 'commute-estimate';

export type GoogleMapsSuspensionReason =
  | 'environment-kill-switch'
  | 'admin-kill-switch'
  | 'per-person-daily-limit'
  | 'global-daily-cap'
  | 'global-monthly-cap';

export type GoogleMapsUnavailableReason =
  | GoogleMapsSuspensionReason
  | 'provider-unavailable'
  | 'usage-gate-unavailable';

export type GoogleMapsPoint = {
  label: string;
  latitude: number;
  longitude: number;
};

export type GoogleMapsPointSelectionRequest = {
  latitude: number;
  longitude: number;
};

export type GoogleMapsCommuteEstimateRequest = {
  origin: GoogleMapsPoint;
  destination: GoogleMapsPoint;
};

export type GoogleMapsCommuteEstimate = {
  durationMinutes: number;
};

export type GoogleMapsProvider = {
  selectPoint: (request: GoogleMapsPointSelectionRequest) => Promise<GoogleMapsPoint>;
  estimateCommute: (
    request: GoogleMapsCommuteEstimateRequest
  ) => Promise<GoogleMapsCommuteEstimate>;
};

export type GoogleMapsAdmission =
  | { outcome: 'admitted' }
  | { outcome: 'suspended'; reason: GoogleMapsSuspensionReason };

export type GoogleMapsUsageGate = {
  admit: (category: GoogleMapsCallCategory) => Promise<GoogleMapsAdmission>;
};

export type GoogleMapsDiagnosticsEvent = {
  category: GoogleMapsCallCategory;
  outcome: 'unavailable';
  reason: GoogleMapsUnavailableReason;
};

export type GoogleMapsUnavailableResult = {
  outcome: 'unavailable';
  reason: GoogleMapsUnavailableReason;
};

export type GoogleMapsPointSelectionResult =
  | { outcome: 'available'; point: GoogleMapsPoint }
  | GoogleMapsUnavailableResult;

export type GoogleMapsCommuteEstimateResult =
  | { outcome: 'available'; estimate: GoogleMapsCommuteEstimate }
  | GoogleMapsUnavailableResult;

export type GoogleMapsRequestGateway = {
  selectPoint: (
    request: GoogleMapsPointSelectionRequest
  ) => Promise<GoogleMapsPointSelectionResult>;
  estimateCommute: (
    request: GoogleMapsCommuteEstimateRequest
  ) => Promise<GoogleMapsCommuteEstimateResult>;
};

export type GoogleMapsEnvironment = {
  GOOGLE_MAPS_KILL_SWITCH?: string;
  [key: string]: string | undefined;
};

export type GoogleMapsRequestGatewayOptions = {
  provider: GoogleMapsProvider;
  usageGate: GoogleMapsUsageGate;
  environment?: GoogleMapsEnvironment;
  environmentKillSwitch?: boolean | (() => boolean);
  diagnostics?: (event: GoogleMapsDiagnosticsEvent) => void;
};

const googleMapsPointSchema = z.object({
  label: z.string().trim().min(1).max(240),
  latitude: z.number().finite().gte(-90).lte(90),
  longitude: z.number().finite().gte(-180).lte(180)
});

const googleMapsCommuteEstimateSchema = z.object({
  durationMinutes: z.number().finite().nonnegative()
});

const defaultDiagnostics = (event: GoogleMapsDiagnosticsEvent) => {
  console.warn('Google Maps request is unavailable.', event);
};

export const isGoogleMapsEnvironmentKillSwitchEnabled = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false;
  }

  return ['1', 'true', 'on', 'yes'].includes(value.trim().toLowerCase());
};

export const createGoogleMapsRequestGateway = ({
  provider,
  usageGate,
  environment = env,
  environmentKillSwitch,
  diagnostics = defaultDiagnostics
}: GoogleMapsRequestGatewayOptions): GoogleMapsRequestGateway => {
  const environmentStopIsActive = () =>
    typeof environmentKillSwitch === 'function'
      ? environmentKillSwitch()
      : typeof environmentKillSwitch === 'boolean'
        ? environmentKillSwitch
        : isGoogleMapsEnvironmentKillSwitchEnabled(environment.GOOGLE_MAPS_KILL_SWITCH);

  const unavailable = (
    category: GoogleMapsCallCategory,
    reason: GoogleMapsUnavailableReason
  ): GoogleMapsUnavailableResult => {
    const result = { outcome: 'unavailable' as const, reason };
    diagnostics({ category, ...result });
    return result;
  };

  const executeProtectedGoogleMapsRequest = async <T, TAvailable extends { outcome: 'available' }>(
    category: GoogleMapsCallCategory,
    request: () => Promise<T>,
    mapAvailable: (value: T) => TAvailable
  ): Promise<TAvailable | GoogleMapsUnavailableResult> => {
    if (environmentStopIsActive()) {
      return unavailable(category, 'environment-kill-switch');
    }

    let admission: GoogleMapsAdmission;

    try {
      admission = await usageGate.admit(category);
    } catch {
      return unavailable(category, 'usage-gate-unavailable');
    }

    if (admission.outcome === 'suspended') {
      return unavailable(category, admission.reason);
    }

    if (environmentStopIsActive()) {
      return unavailable(category, 'environment-kill-switch');
    }

    try {
      return mapAvailable(await request());
    } catch {
      return unavailable(category, 'provider-unavailable');
    }
  };

  return {
    async selectPoint(request) {
      return executeProtectedGoogleMapsRequest(
        'map-point-selection',
        () => provider.selectPoint(request),
        (point) => ({
          outcome: 'available' as const,
          point: googleMapsPointSchema.parse(point)
        })
      );
    },
    async estimateCommute(request) {
      return executeProtectedGoogleMapsRequest(
        'commute-estimate',
        () => provider.estimateCommute(request),
        (estimate) => ({
          outcome: 'available' as const,
          estimate: googleMapsCommuteEstimateSchema.parse(estimate)
        })
      );
    }
  };
};
