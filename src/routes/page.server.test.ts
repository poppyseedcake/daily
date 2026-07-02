import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { defaultSummaryConfiguration } from '$lib/summaryConfiguration';

const { getSession, savedConfiguration, loadFailure } = vi.hoisted(() => ({
  getSession: vi.fn(),
  loadFailure: { enabled: false },
  savedConfiguration: {
    summaryTime: '18:45',
    userTimeZone: 'America/New_York' as const,
    summaryTheme: 'light' as const,
    summaryDeliveryEnabled: true,
    sections: {
      weather: true,
      commute: true,
      calendar: true,
      todo: true
    }
  }
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      getSession
    }
  }
}));

vi.mock('$lib/server/db/summaryConfigurationStore', () => ({
  userSummaryConfigurationStore: {
    async load(userId: string) {
      if (loadFailure.enabled) {
        throw new Error('store unavailable');
      }

      return userId === 'user-1' ? savedConfiguration : null;
    },
    async save() {}
  }
}));

const { load } = await import('./+page.server');

const loadPage = () =>
  load({
    request: new Request('http://localhost/')
  } as Parameters<typeof load>[0]);

describe('Daily page server load', () => {
  beforeEach(() => {
    getSession.mockReset();
    loadFailure.enabled = false;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('loads Visitor mode without server Summary Configuration', async () => {
    getSession.mockResolvedValue(null);

    await expect(loadPage()).resolves.toEqual({
      authState: { mode: 'visitor' },
      summaryConfiguration: null
    });
  });

  test('loads signed-in User Summary Configuration from server persistence', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    await expect(loadPage()).resolves.toEqual({
      authState: {
        mode: 'user',
        userId: 'user-1',
        summaryRecipient: 'user@example.com'
      },
      summaryConfiguration: savedConfiguration
    });
  });

  test('loads defaults for a new signed-in User without imported Local Setup', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-2', email: 'new@example.com', emailVerified: true }
    });

    await expect(loadPage()).resolves.toEqual({
      authState: {
        mode: 'user',
        userId: 'user-2',
        summaryRecipient: 'new@example.com'
      },
      summaryConfiguration: defaultSummaryConfiguration
    });
  });

  test('keeps the page load available when User Summary Configuration cannot be loaded', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    loadFailure.enabled = true;

    await expect(loadPage()).resolves.toEqual({
      authState: {
        mode: 'user',
        userId: 'user-1',
        summaryRecipient: 'user@example.com'
      },
      summaryConfiguration: null
    });
    expect(console.warn).toHaveBeenCalledWith(
      'Failed to load User Summary Configuration.',
      expect.objectContaining({ userId: 'user-1' })
    );
  });
});
