import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { defaultSummaryConfiguration } from '$lib/summaryConfiguration';

const {
  getSession,
  savedConfiguration,
  savedTodoState,
  savedWeatherLocation,
  savedDeliveryRecords,
  recordedDeliveryRecords,
  sentForecastRequests,
  sentMessages,
  deliveryProviderMode,
  weatherProviderMode,
  validationFailure,
  loadFailure
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  loadFailure: { enabled: false },
  deliveryProviderMode: {
    outcome: 'accepted' as
      | 'accepted'
      | 'failed'
      | 'missing-message-id'
      | 'configuration-missing'
      | 'unavailable'
  },
  weatherProviderMode: {
    outcome: 'available' as 'available' | 'unavailable'
  },
  validationFailure: { enabled: false },
  recordedDeliveryRecords: [] as Array<{ userId: string; record: unknown }>,
  sentForecastRequests: [] as unknown[],
  sentMessages: [] as unknown[],
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
  savedWeatherLocation: {
    label: 'Warsaw, Masovian Voivodeship, Poland',
    latitude: 52.2297,
    longitude: 21.0122
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

      if (validationFailure.enabled) {
        return {
          ...savedConfiguration,
          summaryTime: 'not-a-time'
        };
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

vi.mock('$lib/server/db/weatherLocationStore', () => ({
  userWeatherLocationStore: {
    async load(userId: string) {
      if (loadFailure.enabled) {
        throw new Error('store unavailable');
      }

      return userId === 'user-1' ? savedWeatherLocation : null;
    },
    async save() {}
  }
}));

vi.mock('$lib/server/db/deliveryRecordStore', () => ({
  deliveryRecordStore: {
    async recordAttempt(userId: string, record: unknown) {
      recordedDeliveryRecords.push({ userId, record });
    },
    async loadRecentForUser(userId: string) {
      if (loadFailure.enabled) {
        throw new Error('store unavailable');
      }

      return userId === 'user-1' ? savedDeliveryRecords : [];
    }
  }
}));

vi.mock('$lib/server/dailySummaryDelivery', async () => {
  const actual = await vi.importActual<typeof import('$lib/server/dailySummaryDelivery')>(
    '$lib/server/dailySummaryDelivery'
  );

  return {
    ...actual,
    dailySummaryDeliveryProvider: {
      async send(message: unknown) {
        sentMessages.push(message);

        if (deliveryProviderMode.outcome === 'failed') {
          throw new actual.DailySummaryDeliveryError(
            'Resend rejected Daily Summary delivery.',
            'provider-rejected',
            {
              providerName: 'fake-resend',
              providerStatusMetadata: 'status=503'
            }
          );
        }

        if (deliveryProviderMode.outcome === 'configuration-missing') {
          throw new actual.DailySummaryDeliveryError(
            'Resend delivery is not configured.',
            'configuration-missing',
            {
              providerName: 'fake-resend',
              providerStatusMetadata: 'missing RESEND_API_KEY'
            }
          );
        }

        if (deliveryProviderMode.outcome === 'unavailable') {
          throw new actual.DailySummaryDeliveryError(
            'Resend delivery request failed.',
            'provider-unavailable',
            {
              providerName: 'fake-resend',
              providerStatusMetadata: null
            }
          );
        }

        return {
          providerName: 'fake-resend',
          providerMessageId:
            deliveryProviderMode.outcome === 'missing-message-id' ? null : 'fake-message-1',
          providerStatusMetadata: 'accepted'
        };
      }
    }
  };
});

vi.mock('$env/dynamic/private', () => ({
  env: {
    ADMINISTRATOR_EMAIL_ALLOWLIST: ' admin@example.com '
  }
}));

vi.mock('$lib/weatherForecast', async () => {
  const actual = await vi.importActual<typeof import('$lib/weatherForecast')>('$lib/weatherForecast');

  return {
    ...actual,
    openMeteoWeatherForecastProvider: {
      async fetchDailyForecast(request: unknown) {
        sentForecastRequests.push(request);

        if (weatherProviderMode.outcome === 'unavailable') {
          return {
            outcome: 'unavailable',
            reason: 'Live weather is unavailable right now.'
          };
        }

        return {
          outcome: 'available',
          forecast: {
            dates: ['2026-07-07'],
            weatherCodes: [0],
            minimumTemperaturesCelsius: [16],
            maximumTemperaturesCelsius: [23],
            precipitationProbabilities: [10]
          }
        };
      }
    }
  };
});

const { actions, load } = await import('./+page.server');

const loadPage = () =>
  load({
    request: new Request('http://localhost/')
  } as Parameters<typeof load>[0]);

const sendTestDailySummary = () =>
  actions.sendTestDailySummary({
    request: new Request('http://localhost/?/sendTestDailySummary', {
      method: 'POST'
    })
  } as Parameters<typeof actions.sendTestDailySummary>[0]);

describe('Daily page server load', () => {
  beforeEach(() => {
    getSession.mockReset();
    loadFailure.enabled = false;
    deliveryProviderMode.outcome = 'accepted';
    weatherProviderMode.outcome = 'available';
    validationFailure.enabled = false;
    recordedDeliveryRecords.length = 0;
    sentForecastRequests.length = 0;
    sentMessages.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
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
      weatherLocation: null,
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
      weatherLocation: savedWeatherLocation,
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
      weatherLocation: null,
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
      weatherLocation: null,
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
      weatherLocation: null,
      deliveryRecords: []
    });
  });

  test('sends a test Daily Summary for a signed-in User through the delivery boundary', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    const result = await sendTestDailySummary();

    expect(result).toEqual({ outcome: 'sent' });
    expect(sentMessages).toEqual([
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('Test'),
        html: expect.stringContaining('Draft update'),
        text: expect.stringContaining('Draft update')
      })
    ]);
    expect(sentMessages[0]).toEqual(
      expect.objectContaining({
        html: expect.stringContaining('Clear. Low 16C, high 23C. Chance of precipitation 10%.'),
        text: expect.stringContaining('Clear. Low 16C, high 23C. Chance of precipitation 10%.')
      })
    );
    expect(sentMessages[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('Mock Commute')
      })
    );
    expect(sentForecastRequests).toEqual([
      {
        latitude: 52.2297,
        longitude: 21.0122,
        timeZone: 'America/New_York'
      }
    ]);
    expect(recordedDeliveryRecords).toEqual([
      {
        userId: 'user-1',
        record: expect.objectContaining({
          attemptType: 'test',
          deliveryStatus: 'sent',
          providerName: 'fake-resend',
          providerMessageId: 'fake-message-1',
          providerStatusMetadata: 'accepted',
          errorClassification: null
        })
      }
    ]);
    expect(savedConfiguration).toEqual({
      summaryTime: '18:45',
      userTimeZone: 'America/New_York',
      summaryTheme: 'light',
      summaryDeliveryEnabled: true,
      sections: {
        weather: true,
        commute: true,
        calendar: true,
        todo: true
      }
    });
    expect(savedTodoState.todoTasks).toEqual([
      expect.objectContaining({
        id: 'todo-work',
        title: 'Draft update'
      })
    ]);
  });

  test('records Delivery Records without rendered Daily Summary content or forecast snapshots', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    const result = await sendTestDailySummary();

    expect(result).toEqual({ outcome: 'sent' });
    expect(recordedDeliveryRecords).toEqual([
      {
        userId: 'user-1',
        record: {
          id: expect.any(String),
          attemptType: 'test',
          requestedAt: '2026-07-07T12:00:00.000Z',
          completedAt: '2026-07-07T12:00:00.000Z',
          deliveryStatus: 'sent',
          providerName: 'fake-resend',
          providerMessageId: 'fake-message-1',
          providerStatusMetadata: 'accepted',
          errorClassification: null
        }
      }
    ]);
    expect(JSON.stringify(recordedDeliveryRecords)).not.toContain('Draft update');
    expect(JSON.stringify(recordedDeliveryRecords)).not.toContain('Clear. Low 16C');
    expect(JSON.stringify(recordedDeliveryRecords)).not.toContain('weatherCodes');
  });

  test('does not send or record a test Daily Summary for a Visitor', async () => {
    getSession.mockResolvedValue(null);

    const result = await sendTestDailySummary();

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'visitor-not-allowed',
      message: 'Sign in with Google to send a test Daily Summary.'
    });
    expect(sentMessages).toEqual([]);
    expect(recordedDeliveryRecords).toEqual([]);
  });

  test('records a failed Delivery Record when the provider rejects a test Daily Summary', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    deliveryProviderMode.outcome = 'failed';

    const result = await sendTestDailySummary();

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'provider-rejected',
      message: 'The delivery provider rejected the test Daily Summary.'
    });
    expect(recordedDeliveryRecords).toEqual([
      {
        userId: 'user-1',
        record: expect.objectContaining({
          attemptType: 'test',
          deliveryStatus: 'failed',
          providerName: 'fake-resend',
          providerMessageId: null,
          providerStatusMetadata: 'status=503',
          errorClassification: 'provider-rejected'
        })
      }
    ]);
  });

  test('sends unavailable Weather content without failing the accepted test Daily Summary', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    weatherProviderMode.outcome = 'unavailable';

    const result = await sendTestDailySummary();

    expect(result).toEqual({ outcome: 'sent' });
    expect(sentMessages).toEqual([
      expect.objectContaining({
        html: expect.stringContaining('Live weather is unavailable right now.'),
        text: expect.stringContaining('Weather\nLive weather is unavailable right now.')
      })
    ]);
    expect(recordedDeliveryRecords).toEqual([
      {
        userId: 'user-1',
        record: expect.objectContaining({
          attemptType: 'test',
          deliveryStatus: 'sent',
          providerName: 'fake-resend',
          providerMessageId: 'fake-message-1',
          providerStatusMetadata: 'accepted',
          errorClassification: null
        })
      }
    ]);
    expect(recordedDeliveryRecords[0]?.record).not.toEqual(
      expect.objectContaining({
        providerStatusMetadata: expect.stringContaining('Live weather is unavailable right now.')
      })
    );
  });

  test('records a failed Delivery Record when delivery configuration is missing', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    deliveryProviderMode.outcome = 'configuration-missing';

    const result = await sendTestDailySummary();

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'configuration-missing',
      message: 'Test Daily Summary delivery is not configured.'
    });
    expect(recordedDeliveryRecords).toEqual([
      {
        userId: 'user-1',
        record: expect.objectContaining({
          attemptType: 'test',
          deliveryStatus: 'failed',
          providerName: 'fake-resend',
          providerMessageId: null,
          providerStatusMetadata: 'missing RESEND_API_KEY',
          errorClassification: 'configuration-missing'
        })
      }
    ]);
  });

  test('records a failed Delivery Record when the delivery provider is unavailable', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    deliveryProviderMode.outcome = 'unavailable';

    const result = await sendTestDailySummary();

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'provider-unavailable',
      message: 'The test Daily Summary could not be sent.'
    });
    expect(recordedDeliveryRecords).toEqual([
      {
        userId: 'user-1',
        record: expect.objectContaining({
          attemptType: 'test',
          deliveryStatus: 'failed',
          providerName: 'fake-resend',
          providerMessageId: null,
          providerStatusMetadata: null,
          errorClassification: 'provider-unavailable'
        })
      }
    ]);
  });

  test('normalizes provider acceptance without a message id into a failed Delivery Record', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    deliveryProviderMode.outcome = 'missing-message-id';

    const result = await sendTestDailySummary();

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'provider-missing-message-id',
      message: 'The delivery provider accepted the request without a message id.'
    });
    expect(recordedDeliveryRecords).toEqual([
      {
        userId: 'user-1',
        record: expect.objectContaining({
          attemptType: 'test',
          deliveryStatus: 'failed',
          providerName: 'fake-resend',
          providerMessageId: null,
          providerStatusMetadata: 'accepted; missing message id',
          errorClassification: 'provider-missing-message-id'
        })
      }
    ]);
  });

  test('does not submit to the provider when validation prevents a test Daily Summary', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    validationFailure.enabled = true;

    const result = await sendTestDailySummary();

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'validation-failed',
      message: 'The saved Daily Summary setup is invalid, so no provider request was made.'
    });
    expect(sentMessages).toEqual([]);
    expect(recordedDeliveryRecords).toEqual([]);
  });
});
