import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { defaultSummaryConfiguration } from '$lib/summaryConfiguration';

const { getSession, savedConfiguration, savedTodoState, savedDeliveryRecords, loadFailure } = vi.hoisted(() => ({
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
  },
  savedTodoState: {
    todoCategories: [{ id: 'category-work', name: 'Work', position: 1 }],
    todoTasks: [
      {
        id: 'todo-work',
        title: 'Draft update',
        categoryId: 'category-work',
        urgency: 'high' as const,
        position: 1,
        completed: false
      }
    ],
    nextTodoId: 1
  },
  savedDeliveryRecords: [
    {
      id: 'delivery-1',
      attemptType: 'test' as const,
      requestedAt: '2026-07-05T06:45:00.000Z',
      completedAt: '2026-07-05T06:45:03.000Z',
      deliveryStatus: 'sent' as const,
      providerName: 'resend',
      providerMessageId: 'message-123',
      providerStatusMetadata: 'accepted',
      errorClassification: null
    }
  ]
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

vi.mock('$lib/server/db/todoStore', () => ({
  userTodoStore: {
    async load(userId: string) {
      if (loadFailure.enabled) {
        throw new Error('store unavailable');
      }

      return userId === 'user-1'
        ? {
            todoCategories: savedTodoState.todoCategories,
            todoTasks: savedTodoState.todoTasks
          }
        : null;
    },
    async save() {}
  }
}));

vi.mock('$lib/server/db/deliveryRecordStore', () => ({
  deliveryRecordStore: {
    async loadRecentForUser(userId: string) {
      if (loadFailure.enabled) {
        throw new Error('store unavailable');
      }

      return userId === 'user-1' ? savedDeliveryRecords : [];
    }
  }
}));

vi.mock('$env/dynamic/private', () => ({
  env: {
    ADMINISTRATOR_EMAIL_ALLOWLIST: ' admin@example.com '
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
      isAdministrator: false,
      summaryConfiguration: null,
      todoState: {
        todoCategories: [],
        todoTasks: [],
        nextTodoId: 1
      },
      deliveryRecords: []
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
      isAdministrator: false,
      summaryConfiguration: savedConfiguration,
      todoState: savedTodoState,
      deliveryRecords: savedDeliveryRecords
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
      isAdministrator: false,
      summaryConfiguration: defaultSummaryConfiguration,
      todoState: {
        todoCategories: [],
        todoTasks: [],
        nextTodoId: 1
      },
      deliveryRecords: []
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
      isAdministrator: false,
      summaryConfiguration: null,
      todoState: {
        todoCategories: [],
        todoTasks: [],
        nextTodoId: 1
      },
      deliveryRecords: []
    });
    expect(console.warn).toHaveBeenCalledWith(
      'Failed to load User Summary Configuration.',
      expect.objectContaining({ userId: 'user-1' })
    );
  });

  test('marks an allowlisted signed-in User as an Administrator', async () => {
    getSession.mockResolvedValue({
      user: { id: 'admin-1', email: 'Admin@Example.com', emailVerified: true }
    });

    await expect(loadPage()).resolves.toEqual({
      authState: {
        mode: 'user',
        userId: 'admin-1',
        summaryRecipient: 'Admin@Example.com'
      },
      isAdministrator: true,
      summaryConfiguration: defaultSummaryConfiguration,
      todoState: {
        todoCategories: [],
        todoTasks: [],
        nextTodoId: 1
      },
      deliveryRecords: []
    });
  });
});
