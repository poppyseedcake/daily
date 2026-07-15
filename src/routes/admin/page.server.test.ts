import { beforeEach, describe, expect, test, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn()
}));
const { currentOperations, setAdminKillSwitch } = vi.hoisted(() => ({
  currentOperations: vi.fn(),
  setAdminKillSwitch: vi.fn()
}));
const { currentDeliveryHealth } = vi.hoisted(() => ({
  currentDeliveryHealth: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      getSession
    }
  }
}));

vi.mock('$env/dynamic/private', () => ({
  env: {
    ADMINISTRATOR_EMAIL_ALLOWLIST: ' admin@example.com , other@example.com '
  }
}));

vi.mock('$lib/server/googleMapsOperations', () => ({
  googleMapsOperations: {
    currentOperations,
    setAdminKillSwitch
  }
}));

vi.mock('$lib/server/deliveryHealthOperations', () => ({
  deliveryHealthOperations: {
    current: currentDeliveryHealth
  }
}));

const { actions, load } = await import('./+page.server');

const loadAdminPage = () =>
  load({
    request: new Request('http://localhost/admin')
  } as Parameters<typeof load>[0]);

const submitKillSwitch = (enabled: string) =>
  actions.setGoogleMapsKillSwitch({
    request: new Request('http://localhost/admin?/setGoogleMapsKillSwitch', {
      method: 'POST',
      body: new URLSearchParams({ enabled })
    })
  } as Parameters<typeof actions.setGoogleMapsKillSwitch>[0]);

describe('Admin Panel server load', () => {
  beforeEach(() => {
    getSession.mockReset();
    currentOperations.mockReset();
    currentDeliveryHealth.mockReset();
    setAdminKillSwitch.mockReset();
    currentOperations.mockResolvedValue({
      timeBasis: 'UTC',
      daily: {
        periodStart: '2026-07-13',
        total: 12,
        cap: 25,
        byCategory: { 'map-point-selection': 7, 'commute-estimate': 5 }
      },
      monthly: {
        periodStart: '2026-07',
        total: 110,
        cap: 500,
        byCategory: { 'map-point-selection': 60, 'commute-estimate': 50 }
      },
      environmentKillSwitchEnabled: false,
      adminKillSwitchEnabled: false,
      effectiveState: 'active',
      suspensionReason: null
    });
    currentDeliveryHealth.mockResolvedValue({
      timeBasis: 'UTC',
      worker: {
        status: 'healthy',
        overdueThresholdMinutes: 5,
        latestRun: {
          completedAt: '2026-07-15T11:59:00.010Z',
          durationMilliseconds: 10,
          outcome: 'succeeded',
          failureClassification: null,
          counts: { due: 2, sent: 1, skipped: 0, retrying: 1, failed: 0, isolatedError: 0 }
        }
      },
      windows: [
        {
          key: '24-hours',
          label: 'Last 24 hours',
          totals: { sent: 4, retrying: 1, failed: 2, activeProcessing: 1, expiredProcessing: 1 },
          failureClassifications: [{ classification: 'provider-rejected', count: 2 }]
        }
      ]
    });
  });

  test('denies a Visitor before rendering operational Admin Panel output', async () => {
    getSession.mockResolvedValue(null);

    await expect(loadAdminPage()).rejects.toSatisfy(
      (thrown) =>
        isHttpError(thrown, 403) &&
        thrown.body.message === 'Sign in with an authorized Google account to access the Admin Panel.'
    );
    expect(currentDeliveryHealth).not.toHaveBeenCalled();
  });

  test('denies a signed-in User whose verified Google email is not allowlisted', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    await expect(loadAdminPage()).rejects.toSatisfy(
      (thrown) =>
        isHttpError(thrown, 403) &&
        thrown.body.message === 'Your signed-in Google account is not authorized for the Admin Panel.'
    );
    expect(currentDeliveryHealth).not.toHaveBeenCalled();
  });

  test('denies an allowlisted Google email when the current session is not verified', async () => {
    getSession.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com', emailVerified: false }
    });

    await expect(loadAdminPage()).rejects.toSatisfy((thrown) => isHttpError(thrown, 403));
    expect(currentDeliveryHealth).not.toHaveBeenCalled();
  });

  test('allows a signed-in Administrator whose verified Google email is allowlisted', async () => {
    getSession.mockResolvedValue({
      user: { id: 'admin-1', email: 'Admin@Example.com', emailVerified: true }
    });

    await expect(loadAdminPage()).resolves.toEqual({
      access: {
        mode: 'allowed'
      },
      googleMaps: expect.objectContaining({
        effectiveState: 'active',
        daily: expect.objectContaining({ total: 12, cap: 25 }),
        monthly: expect.objectContaining({ total: 110, cap: 500 })
      }),
      deliveryHealth: expect.objectContaining({
        timeBasis: 'UTC',
        worker: expect.objectContaining({
          status: 'healthy',
          overdueThresholdMinutes: 5
        }),
        windows: [
          expect.objectContaining({
            key: '24-hours',
            totals: expect.objectContaining({ sent: 4, expiredProcessing: 1 })
          })
        ]
      })
    });
    expect(currentDeliveryHealth).toHaveBeenCalledOnce();
  });

  test('allows only an authorized Administrator to mutate the SQLite kill switch', async () => {
    getSession.mockResolvedValueOnce(null);
    await expect(submitKillSwitch('true')).rejects.toSatisfy((thrown) => isHttpError(thrown, 403));
    expect(setAdminKillSwitch).not.toHaveBeenCalled();

    getSession.mockResolvedValueOnce({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    await expect(submitKillSwitch('true')).rejects.toSatisfy((thrown) => isHttpError(thrown, 403));
    expect(setAdminKillSwitch).not.toHaveBeenCalled();

    getSession.mockResolvedValue({
      user: { id: 'admin-1', email: 'Admin@Example.com', emailVerified: true }
    });
    await expect(submitKillSwitch('true')).resolves.toEqual({ success: true });
    expect(setAdminKillSwitch).toHaveBeenCalledWith(true);

    await expect(submitKillSwitch('not-a-boolean')).resolves.toMatchObject({ status: 400 });
    expect(setAdminKillSwitch).toHaveBeenCalledTimes(1);
  });
});
