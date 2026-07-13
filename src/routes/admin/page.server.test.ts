import { beforeEach, describe, expect, test, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn()
}));
const { currentOperations, setAdminKillSwitch } = vi.hoisted(() => ({
  currentOperations: vi.fn(),
  setAdminKillSwitch: vi.fn()
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
  });

  test('denies a Visitor before rendering operational Admin Panel output', async () => {
    getSession.mockResolvedValue(null);

    await expect(loadAdminPage()).rejects.toSatisfy(
      (thrown) =>
        isHttpError(thrown, 403) &&
        thrown.body.message === 'Sign in with an authorized Google account to access the Admin Panel.'
    );
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
      })
    });
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
