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
const { listTechnicalLogs } = vi.hoisted(() => ({
  listTechnicalLogs: vi.fn()
}));
const { hasGoogleAuthAccount } = vi.hoisted(() => ({
  hasGoogleAuthAccount: vi.fn()
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

vi.mock('$lib/server/technicalLogOperations', () => ({
  technicalLogOperations: {
    list: listTechnicalLogs
  }
}));

vi.mock('$lib/server/adminGoogleSession', () => ({
  hasGoogleAuthAccount
}));

const { actions, load } = await import('./+page.server');

const loadAdminPage = (query = '') => {
  const url = new URL(`http://localhost/admin${query}`);
  return load({
    request: new Request(url),
    url
  } as Parameters<typeof load>[0]);
};

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
    listTechnicalLogs.mockReset();
    hasGoogleAuthAccount.mockReset();
    hasGoogleAuthAccount.mockResolvedValue(true);
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
      capAlerts: {
        daily: {
          periodStart: '2026-07-13',
          status: 'delivered',
          completedAt: '2026-07-13T10:00:00.000Z',
          failureCode: null
        },
        monthly: {
          periodStart: '2026-07',
          status: 'failed',
          completedAt: '2026-07-13T10:00:01.000Z',
          failureCode: 'delivery-failed'
        }
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
    listTechnicalLogs.mockResolvedValue({ records: [], nextCursor: null });
  });

  test('denies a Visitor before rendering operational Admin Panel output', async () => {
    getSession.mockResolvedValue(null);

    await expect(loadAdminPage()).rejects.toSatisfy(
      (thrown) =>
        isHttpError(thrown, 403) &&
        thrown.body.message === 'Sign in with an authorized Google account to access the Admin Panel.'
    );
    expect(currentDeliveryHealth).not.toHaveBeenCalled();
    expect(listTechnicalLogs).not.toHaveBeenCalled();
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
    expect(listTechnicalLogs).not.toHaveBeenCalled();
  });

  test('denies an allowlisted Google email when the current session is not verified', async () => {
    getSession.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com', emailVerified: false }
    });

    await expect(loadAdminPage()).rejects.toSatisfy((thrown) => isHttpError(thrown, 403));
    expect(currentDeliveryHealth).not.toHaveBeenCalled();
    expect(listTechnicalLogs).not.toHaveBeenCalled();
  });

  test('denies a verified allowlisted session without a current Google account', async () => {
    getSession.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com', emailVerified: true }
    });
    hasGoogleAuthAccount.mockResolvedValue(false);

    await expect(loadAdminPage()).rejects.toSatisfy((thrown) => isHttpError(thrown, 403));
    expect(hasGoogleAuthAccount).toHaveBeenCalledWith('admin-1');
    expect(currentDeliveryHealth).not.toHaveBeenCalled();
    expect(listTechnicalLogs).not.toHaveBeenCalled();
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
        monthly: expect.objectContaining({ total: 110, cap: 500 }),
        capAlerts: {
          daily: expect.objectContaining({ status: 'delivered' }),
          monthly: expect.objectContaining({
            status: 'failed',
            failureCode: 'delivery-failed'
          })
        }
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
      }),
      technicalLogs: { records: [], nextCursor: null },
      technicalLogFilters: {},
      technicalLogFilterOptions: {
        severities: ['info', 'warning', 'error'],
        subsystems: ['scheduled-delivery', 'admin-controls'],
        eventCodes: [
          'scheduled-daily-summary-worker-completed',
          'scheduled-daily-summary-worker-failed',
          'admin-google-maps-kill-switch-changed'
        ]
      }
    });
    expect(currentDeliveryHealth).toHaveBeenCalledOnce();
    expect(hasGoogleAuthAccount).toHaveBeenCalledWith('admin-1');
  });

  test('applies bounded Technical Log filters and cursor pagination from the URL', async () => {
    getSession.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com', emailVerified: true }
    });
    listTechnicalLogs.mockResolvedValue({
      records: [
        {
          id: 'log-2',
          eventCode: 'scheduled-daily-summary-worker-failed',
          severity: 'error',
          subsystem: 'scheduled-delivery',
          occurredAt: '2026-07-15T11:00:00.000Z',
          outcome: 'failed',
          failureClassification: 'unexpected',
          durationMilliseconds: 2,
          metadata: {
            dueCount: 1,
            sentCount: 0,
            skippedCount: 0,
            retryingCount: 0,
            failedCount: 1,
            isolatedErrorCount: 1
          }
        }
      ],
      nextCursor: 'next-page'
    });

    const result = await loadAdminPage(
      '?from=2026-07-15T08%3A30%3A00Z&to=2026-07-15T11%3A30%3A00.000Z&severity=error&subsystem=scheduled-delivery&eventCode=scheduled-daily-summary-worker-failed&cursor=current-page'
    );

    expect(listTechnicalLogs).toHaveBeenCalledWith({
      pageSize: 25,
      fromUtc: '2026-07-15T08:30:00.000Z',
      toUtc: '2026-07-15T11:30:00.000Z',
      severity: 'error',
      subsystem: 'scheduled-delivery',
      eventCode: 'scheduled-daily-summary-worker-failed',
      cursor: 'current-page'
    });
    expect(result).toMatchObject({
      technicalLogs: { nextCursor: 'next-page' },
      technicalLogFilters: {
        from: '2026-07-15T08:30:00.000Z',
        to: '2026-07-15T11:30:00.000Z',
        severity: 'error',
        subsystem: 'scheduled-delivery',
        eventCode: 'scheduled-daily-summary-worker-failed'
      }
    });
  });

  test('rejects invalid Technical Log filters without querying operational records', async () => {
    getSession.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com', emailVerified: true }
    });

    await expect(loadAdminPage('?severity=debug')).rejects.toSatisfy((thrown) =>
      isHttpError(thrown, 400)
    );
    expect(listTechnicalLogs).not.toHaveBeenCalled();
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
