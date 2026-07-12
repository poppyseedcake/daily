import { describe, expect, test, vi } from 'vitest';
import {
  createGoogleMapsRequestGateway,
  type GoogleMapsDiagnosticsEvent,
  type GoogleMapsProvider,
  type GoogleMapsUsageGate
} from './googleMapsRequestGateway';

const origin = {
  label: 'Home point',
  latitude: 52.2297,
  longitude: 21.0122
};

const destination = {
  label: 'Office point',
  latitude: 52.2365,
  longitude: 21.0181
};

const createProvider = (): GoogleMapsProvider => ({
  selectPoint: vi.fn().mockResolvedValue(origin),
  estimateCommute: vi.fn().mockResolvedValue({ durationMinutes: 24 })
});

const createAdmittingGate = (categories: string[]): GoogleMapsUsageGate => ({
  admit: vi.fn(async (category) => {
    categories.push(category);
    return { outcome: 'admitted' as const };
  })
});

describe('Google Maps request gateway', () => {
  test('routes point selection and Commute Estimate calls through one categorized gate', async () => {
    const provider = createProvider();
    const categories: string[] = [];
    const gateway = createGoogleMapsRequestGateway({
      provider,
      usageGate: createAdmittingGate(categories),
      attribution: { personUsageIdentity: "test-person" },
      environmentKillSwitch: false,
      diagnostics: vi.fn()
    });

    await expect(gateway.selectPoint({ latitude: origin.latitude, longitude: origin.longitude })).resolves.toEqual({
      outcome: 'available',
      point: origin
    });
    await expect(gateway.estimateCommute({ origin, destination })).resolves.toEqual({
      outcome: 'available',
      estimate: { durationMinutes: 24 }
    });

    expect(categories).toEqual(['map-point-selection', 'commute-estimate']);
    expect(provider.selectPoint).toHaveBeenCalledWith({
      latitude: origin.latitude,
      longitude: origin.longitude
    });
    expect(provider.estimateCommute).toHaveBeenCalledWith({ origin, destination });
  });

  test('rejects every protected call before the usage gate or provider when the environment kill switch is active', async () => {
    const provider = createProvider();
    const categories: string[] = [];
    const diagnostics: GoogleMapsDiagnosticsEvent[] = [];
    const gateway = createGoogleMapsRequestGateway({
      provider,
      usageGate: createAdmittingGate(categories),
      attribution: { personUsageIdentity: "test-person" },
      environment: { GOOGLE_MAPS_KILL_SWITCH: 'true' },
      diagnostics: (event) => diagnostics.push(event)
    });

    await expect(gateway.selectPoint({ latitude: origin.latitude, longitude: origin.longitude })).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'environment-kill-switch'
    });
    await expect(gateway.estimateCommute({ origin, destination })).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'environment-kill-switch'
    });

    expect(categories).toEqual([]);
    expect(provider.selectPoint).not.toHaveBeenCalled();
    expect(provider.estimateCommute).not.toHaveBeenCalled();
    expect(diagnostics).toEqual([
      { category: 'map-point-selection', outcome: 'unavailable', reason: 'environment-kill-switch' },
      { category: 'commute-estimate', outcome: 'unavailable', reason: 'environment-kill-switch' }
    ]);
  });

  test('keeps the typed unavailable result when diagnostics fail', async () => {
    const provider = createProvider();
    const gateway = createGoogleMapsRequestGateway({
      provider,
      usageGate: createAdmittingGate([]),
      attribution: { personUsageIdentity: "test-person" },
      environmentKillSwitch: true,
      diagnostics: () => {
        throw new Error('diagnostics unavailable');
      }
    });

    await expect(gateway.selectPoint({ latitude: origin.latitude, longitude: origin.longitude })).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'environment-kill-switch'
    });
    expect(provider.selectPoint).not.toHaveBeenCalled();
  });

  test('returns a typed suspension from the shared usage gate without invoking the provider', async () => {
    const provider = createProvider();
    const diagnostics: GoogleMapsDiagnosticsEvent[] = [];
    const usageGate: GoogleMapsUsageGate = {
      admit: vi.fn().mockResolvedValue({ outcome: 'suspended', reason: 'global-daily-cap' as const })
    };
    const gateway = createGoogleMapsRequestGateway({
      provider,
      attribution: { personUsageIdentity: "test-person" },
      usageGate,
      environmentKillSwitch: false,
      diagnostics: (event) => diagnostics.push(event)
    });

    await expect(gateway.estimateCommute({ origin, destination })).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'global-daily-cap'
    });

    expect(provider.estimateCommute).not.toHaveBeenCalled();
    expect(diagnostics).toEqual([
      { category: 'commute-estimate', outcome: 'unavailable', reason: 'global-daily-cap' }
    ]);
  });

  test('does not log an unexpected runtime suspension reason from the usage gate', async () => {
    const provider = createProvider();
    const diagnostics: GoogleMapsDiagnosticsEvent[] = [];
    const usageGate: GoogleMapsUsageGate = {
      admit: vi.fn().mockResolvedValue({
        outcome: 'suspended',
        reason: 'Commute Origin: 123 Private St' as never
      })
    };
    const gateway = createGoogleMapsRequestGateway({
      provider,
      attribution: { personUsageIdentity: "test-person" },
      usageGate,
      environmentKillSwitch: false,
      diagnostics: (event) => diagnostics.push(event)
    });

    await expect(gateway.estimateCommute({ origin, destination })).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'usage-gate-unavailable'
    });
    expect(provider.estimateCommute).not.toHaveBeenCalled();
    expect(JSON.stringify(diagnostics)).not.toContain('123 Private St');
    expect(diagnostics).toEqual([
      { category: 'commute-estimate', outcome: 'unavailable', reason: 'usage-gate-unavailable' }
    ]);
  });

  test('maps provider failures to a typed unavailable outcome and keeps private content out of diagnostics', async () => {
    const provider = createProvider();
    vi.mocked(provider.estimateCommute).mockRejectedValue(
      new Error(
        'Commute Origin: 123 Private St; Commute Destination: Office; Commute Route: Morning; rendered summary; raw provider payload'
      )
    );
    const diagnostics: GoogleMapsDiagnosticsEvent[] = [];
    const gateway = createGoogleMapsRequestGateway({
      provider,
      usageGate: createAdmittingGate([]),
      attribution: { personUsageIdentity: "test-person" },
      environmentKillSwitch: false,
      diagnostics: (event) => diagnostics.push(event)
    });

    await expect(gateway.estimateCommute({ origin, destination })).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'provider-unavailable'
    });

    expect(JSON.stringify(diagnostics)).not.toContain('123 Private St');
    expect(JSON.stringify(diagnostics)).not.toContain('Office');
    expect(JSON.stringify(diagnostics)).not.toContain('Morning');
    expect(JSON.stringify(diagnostics)).not.toContain('rendered summary');
    expect(JSON.stringify(diagnostics)).not.toContain('raw provider payload');
    expect(diagnostics).toEqual([
      { category: 'commute-estimate', outcome: 'unavailable', reason: 'provider-unavailable' }
    ]);
  });

  test('keeps point-selection provider failures typed and diagnostics free of provider payloads', async () => {
    const provider = createProvider();
    vi.mocked(provider.selectPoint).mockRejectedValue(
      new Error('Commute Destination: 456 Private Ave; raw provider payload')
    );
    const diagnostics: GoogleMapsDiagnosticsEvent[] = [];
    const gateway = createGoogleMapsRequestGateway({
      provider,
      usageGate: createAdmittingGate([]),
      attribution: { personUsageIdentity: "test-person" },
      environmentKillSwitch: false,
      diagnostics: (event) => diagnostics.push(event)
    });

    await expect(gateway.selectPoint({ latitude: destination.latitude, longitude: destination.longitude })).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'provider-unavailable'
    });
    expect(JSON.stringify(diagnostics)).not.toContain('456 Private Ave');
    expect(JSON.stringify(diagnostics)).not.toContain('raw provider payload');
    expect(diagnostics).toEqual([
      { category: 'map-point-selection', outcome: 'unavailable', reason: 'provider-unavailable' }
    ]);
  });

  test('checks the environment kill switch again after usage admission', async () => {
    const provider = createProvider();
    let killSwitchActive = false;
    const usageGate: GoogleMapsUsageGate = {
      admit: vi.fn(async () => {
        killSwitchActive = true;
        return { outcome: 'admitted' as const };
      })
    };
    const gateway = createGoogleMapsRequestGateway({
      provider,
      attribution: { personUsageIdentity: "test-person" },
      usageGate,
      environmentKillSwitch: () => killSwitchActive,
      diagnostics: vi.fn()
    });

    await expect(gateway.selectPoint({ latitude: origin.latitude, longitude: origin.longitude })).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'environment-kill-switch'
    });
    expect(provider.selectPoint).not.toHaveBeenCalled();
  });

  test('fails closed with a typed unavailable outcome when the usage gate cannot decide', async () => {
    const provider = createProvider();
    const usageGate: GoogleMapsUsageGate = {
      admit: vi.fn().mockRejectedValue(new Error('private gate diagnostic'))
    };
    const diagnostics: GoogleMapsDiagnosticsEvent[] = [];
    const gateway = createGoogleMapsRequestGateway({
      provider,
      attribution: { personUsageIdentity: "test-person" },
      usageGate,
      environmentKillSwitch: false,
      diagnostics: (event) => diagnostics.push(event)
    });

    await expect(gateway.estimateCommute({ origin, destination })).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'usage-gate-unavailable'
    });
    expect(provider.estimateCommute).not.toHaveBeenCalled();
    expect(JSON.stringify(diagnostics)).not.toContain('private gate diagnostic');
  });
});
