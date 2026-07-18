import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { defaultSummaryConfiguration } from '$lib/summaryConfiguration';

const {
  getSession,
  savedConfiguration,
  savedTodoState,
  savedWeatherLocation,
  savedCommuteSetup,
  savedCalendarConnection,
  savedSelectedCalendars,
  providerCalendars,
  sentCalendarEventRequests,
  loadedGoogleCalendarAccessTokens,
  loadedSelectedCalendars,
  calendarConnectionWrites,
  selectedCalendarWrites,
  savedDeliveryRecords,
  recordedDeliveryRecords,
  sentForecastRequests,
  sentCommuteEstimateRequests,
  commuteUsageAdmissions,
  sentMessages,
  deliveryProviderMode,
  weatherProviderMode,
  commuteProviderMode,
  calendarAccessTokenMode,
  calendarListProviderMode,
  calendarEventProviderMode,
  validationFailure,
  loadFailure,
  lifecycleActive,
  deletionStart,
  deletionFinish
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  loadFailure: { enabled: false },
  lifecycleActive: { value: true },
  deletionStart: vi.fn(),
  deletionFinish: vi.fn(),
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
  commuteProviderMode: {
    outcome: 'available' as 'available' | 'provider-unavailable' | 'suspended'
  },
  calendarAccessTokenMode: {
    outcome: 'available' as 'available' | 'unavailable'
  },
  calendarListProviderMode: {
    outcome: 'available' as 'available' | 'unavailable' | 'authorization-failed'
  },
  calendarEventProviderMode: {
    outcome: 'available' as 'available' | 'unavailable' | 'private-failure'
  },
  validationFailure: { enabled: false },
  recordedDeliveryRecords: [] as Array<{ userId: string; record: unknown }>,
  sentForecastRequests: [] as unknown[],
  sentCommuteEstimateRequests: [] as unknown[],
  commuteUsageAdmissions: [] as unknown[],
  sentCalendarEventRequests: [] as unknown[],
  loadedGoogleCalendarAccessTokens: [] as string[],
  loadedSelectedCalendars: [] as string[],
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
  savedCommuteSetup: {
    routes: [] as Array<{
      id: string;
      name: string;
      origin: { label: string; latitude: number; longitude: number };
      destination: { label: string; latitude: number; longitude: number };
      enabled: boolean;
    }>,
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as Array<
      'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
    >
  },
  savedCalendarConnection: {
    status: 'not-connected' as 'not-connected' | 'connected' | 'failed'
  },
  savedSelectedCalendars: [] as Array<{
    id: string;
    summary: string;
    backgroundColor: string | null;
    primary: boolean;
  }>,
  providerCalendars: [] as Array<{
    id: string;
    summary: string;
    backgroundColor: string | null;
    primary: boolean;
  }>,
  calendarConnectionWrites: [] as Array<{ operation: string; userId: string }>,
  selectedCalendarWrites: [] as Array<{ userId: string; calendars: unknown }>,
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

const visitorCalendarReadiness = {
  status: 'demo',
  label: 'Demo Calendar',
  detail: 'Sample Calendar Events for Visitor mode'
} as const;

const userCalendarReadiness = {
  status: 'not-connected',
  label: 'Calendar',
  statusLabel: 'Calendar not connected',
  detail: 'Calendar Events will appear after Google Calendar setup is available.',
  unavailableReason: 'Connect Google Calendar to include Calendar Events.'
} as const;

const commuteRoute = (id: string, name: string, enabled = true, previewDurationMinutes = 26) => ({
  id,
  name,
  origin: { label: `${name} origin`, latitude: 52.1, longitude: 21.1 },
  destination: { label: `${name} destination`, latitude: 52.2, longitude: 21.2 },
  previewDurationMinutes,
  enabled
});

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      getSession
    }
  }
}));

vi.mock('$lib/server/db/userLifecycleStore', () => ({
  userLifecycleStore: {
    async isActive() {
      return lifecycleActive.value;
    }
  }
}));

vi.mock('$lib/server/db/accountDeletionStore', () => ({
  accountDeletionStore: {
    startDeleting: deletionStart,
    loadGoogleTokens: vi.fn().mockResolvedValue([]),
    finishDeleting: deletionFinish
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

vi.mock('$lib/server/db/commuteSetupStore', () => ({
  userCommuteSetupStore: {
    async load(userId: string) {
      if (loadFailure.enabled) throw new Error('store unavailable');
      return userId === 'user-1' ? savedCommuteSetup : null;
    },
    async createRoute() { throw new Error('not implemented'); },
    async updateRoute() { throw new Error('not implemented'); },
    async deleteRoute() { return false; },
    async saveDays() {}
  }
}));

vi.mock('$lib/server/db/calendarConnectionStore', () => ({
  userCalendarConnectionStore: {
    async load(userId: string) {
      if (loadFailure.enabled) {
        throw new Error('store unavailable');
      }

      return userId === 'user-1' ? savedCalendarConnection : { status: 'not-connected' };
    },
    async saveConnectedFromGoogleAuthAccount(userId: string) {
      calendarConnectionWrites.push({ operation: 'saveConnectedFromGoogleAuthAccount', userId });
      savedCalendarConnection.status = 'connected';
      return true;
    },
    async markFailed(userId: string) {
      calendarConnectionWrites.push({ operation: 'markFailed', userId });
      savedCalendarConnection.status = 'failed';
    },
    async disconnect(userId: string) {
      calendarConnectionWrites.push({ operation: 'disconnect', userId });
      savedCalendarConnection.status = 'not-connected';
    },
    async loadSelectedCalendars(userId: string) {
      loadedSelectedCalendars.push(userId);
      return userId === 'user-1' ? savedSelectedCalendars : [];
    },
    async saveSelectedCalendars(userId: string, calendars: unknown) {
      selectedCalendarWrites.push({ userId, calendars });
    }
  }
}));

vi.mock('$lib/server/googleCalendarList', () => ({
  googleCalendarListProvider: {
    async loadCalendars() {
      if (calendarListProviderMode.outcome === 'authorization-failed') {
        throw new Error('calendar-authorization-failed');
      }

      if (calendarListProviderMode.outcome === 'unavailable') {
        throw new Error('Private calendar list payload');
      }

      return providerCalendars;
    }
  },
  isGoogleCalendarAuthorizationFailure(error: unknown) {
    return error instanceof Error && error.message === 'calendar-authorization-failed';
  },
  googleCalendarEventProvider: () => ({
    async fetchEvents(request: unknown) {
      sentCalendarEventRequests.push(request);

      if (calendarEventProviderMode.outcome === 'unavailable') {
        return {
          outcome: 'unavailable',
          reason: 'Live Calendar is unavailable right now.'
        } as const;
      }

      if (calendarEventProviderMode.outcome === 'private-failure') {
        throw new Error('Therapy at 10:00 with secret-provider-token');
      }

      return {
        outcome: 'available',
        events: [{
          kind: 'timed',
          id: 'calendar-event-1',
          calendarId: 'work',
          calendarSummary: 'Work',
          summary: 'Planning',
          start: '2026-07-07T15:00:00.000Z',
          end: '2026-07-07T16:00:00.000Z'
        }]
      } as const;
    }
  }),
  async loadGoogleCalendarAccessToken(userId: string) {
    loadedGoogleCalendarAccessTokens.push(userId);

    return userId === 'user-1' && calendarAccessTokenMode.outcome === 'available'
      ? 'calendar-access-token'
      : null;
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
    ADMINISTRATOR_EMAIL_ALLOWLIST: ' admin@example.com ',
    GOOGLE_MAPS_ATTRIBUTION_SECRET: 'page-server-test-attribution-secret-32-bytes'
  }
}));

vi.mock('$lib/server/googleMapsOperations', async () => {
  const { createGoogleMapsRequestGateway } = await vi.importActual<
    typeof import('$lib/server/googleMapsRequestGateway')
  >('$lib/server/googleMapsRequestGateway');

  return {
    googleMapsOperations: {
      requestGateway: () => createGoogleMapsRequestGateway({
        environment: {},
        attribution: { personUsageIdentity: 'test-user-1' },
        diagnostics: () => {},
        usageGate: {
          async admit(category, attribution) {
            commuteUsageAdmissions.push({ category, attribution });
            return commuteProviderMode.outcome === 'suspended'
              ? { outcome: 'suspended', reason: 'per-person-daily-limit' }
              : { outcome: 'admitted' };
          }
        },
        provider: {
          async selectPoint() {
            throw new Error('not used');
          },
          async estimateCommute(request) {
            sentCommuteEstimateRequests.push(request);

            if (commuteProviderMode.outcome === 'provider-unavailable') {
              throw new Error('fake provider unavailable');
            }

            return {
              durationMinutes: sentCommuteEstimateRequests.length === 1 ? 24.4 : 38.7
            };
          }
        }
      })
    }
  };
});

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

const loadPageAt = (url: string) =>
  load({
    request: new Request(url)
  } as Parameters<typeof load>[0]);

const sendTestDailySummary = () =>
  actions.sendTestDailySummary({
    request: new Request('http://localhost/?/sendTestDailySummary', {
      method: 'POST'
    })
  } as Parameters<typeof actions.sendTestDailySummary>[0]);

const disconnectGoogleCalendar = () =>
  actions.disconnectGoogleCalendar({
    request: new Request('http://localhost/?/disconnectGoogleCalendar', {
      method: 'POST'
    })
  } as Parameters<typeof actions.disconnectGoogleCalendar>[0]);

const deleteAccount = (confirmation?: string) => {
  const formData = new FormData();
  if (confirmation !== undefined) formData.set('confirmation', confirmation);
  return actions.deleteAccount({
    request: new Request('http://localhost/?/deleteAccount', { method: 'POST', body: formData })
  } as Parameters<typeof actions.deleteAccount>[0]);
};

describe('Daily page server load', () => {
  beforeEach(() => {
    getSession.mockReset();
    loadFailure.enabled = false;
    lifecycleActive.value = true;
    deletionStart.mockReset().mockResolvedValue('started');
    deletionFinish.mockReset().mockResolvedValue(true);
    deliveryProviderMode.outcome = 'accepted';
    weatherProviderMode.outcome = 'available';
    commuteProviderMode.outcome = 'available';
    calendarAccessTokenMode.outcome = 'available';
    calendarListProviderMode.outcome = 'available';
    calendarEventProviderMode.outcome = 'available';
    savedConfiguration.sections.calendar = true;
    savedConfiguration.sections.commute = true;
    savedCommuteSetup.routes.length = 0;
    savedCommuteSetup.days.splice(0, savedCommuteSetup.days.length, 'monday', 'tuesday', 'wednesday', 'thursday', 'friday');
    validationFailure.enabled = false;
    savedCalendarConnection.status = 'not-connected';
    savedSelectedCalendars.length = 0;
    providerCalendars.length = 0;
    selectedCalendarWrites.length = 0;
    calendarConnectionWrites.length = 0;
    recordedDeliveryRecords.length = 0;
    sentForecastRequests.length = 0;
    sentCommuteEstimateRequests.length = 0;
    commuteUsageAdmissions.length = 0;
    sentCalendarEventRequests.length = 0;
    loadedGoogleCalendarAccessTokens.length = 0;
    loadedSelectedCalendars.length = 0;
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
      calendarReadiness: visitorCalendarReadiness,
      summaryConfiguration: null,
      todoState: {
        todoCategories: [],
        todoTasks: [],
        nextTodoId: 1
      },
      weatherLocation: null,
      commuteSetup: null,
      deliveryRecords: [],
      selectedCalendarConfiguration: null,
      renderedSummaryHtml: null
    });
  });

  test('loads User Selected Calendar configuration from Google calendar list and saved selection', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedCalendarConnection.status = 'connected';
    providerCalendars.push(
      {
        id: 'primary',
        summary: 'Ada Lovelace',
        backgroundColor: '#3f51b5',
        primary: true
      },
      {
        id: 'work',
        summary: 'Work',
        backgroundColor: '#0b8043',
        primary: false
      }
    );
    savedSelectedCalendars.push({
      id: 'work',
      summary: 'Work',
      backgroundColor: '#0b8043',
      primary: false
    });

    await expect(loadPage()).resolves.toEqual(
      expect.objectContaining({
        selectedCalendarConfiguration: {
          calendars: [
            {
              id: 'primary',
              summary: 'Ada Lovelace',
              backgroundColor: '#3f51b5',
              primary: true,
              selected: false
            },
            {
              id: 'work',
              summary: 'Work',
              backgroundColor: '#0b8043',
              primary: false,
              selected: true
            }
          ],
          selectedCalendarIds: ['work']
        }
      })
    );
  });

  test('loads live selected Calendar Events into the signed-in User Daily Summary preview', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedCalendarConnection.status = 'connected';
    savedSelectedCalendars.push({
      id: 'work',
      summary: 'Work',
      backgroundColor: '#0b8043',
      primary: false
    });
    providerCalendars.push({
      id: 'work',
      summary: 'Work',
      backgroundColor: '#0b8043',
      primary: false
    });

    await expect(loadPage()).resolves.toEqual(
      expect.objectContaining({
        renderedSummaryHtml: expect.stringContaining('Planning')
      })
    );
    expect(sentCalendarEventRequests).toEqual([
      {
        calendarIds: ['work'],
        timeMin: '2026-07-07T04:00:00Z',
        timeMax: '2026-07-14T04:00:00Z',
        timeZone: 'America/New_York'
      }
    ]);
    expect(loadedGoogleCalendarAccessTokens).toEqual(['user-1']);
  });

  test('guides a connected User to reconnect when Calendar credentials are unusable', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedCalendarConnection.status = 'connected';
    savedSelectedCalendars.push({
      id: 'work',
      summary: 'Work',
      backgroundColor: '#0b8043',
      primary: false
    });
    calendarAccessTokenMode.outcome = 'unavailable';

    await expect(loadPage()).resolves.toEqual(
      expect.objectContaining({
        calendarReadiness: expect.objectContaining({
          status: 'reconnect-required',
          unavailableReason: 'Reconnect Google Calendar to include Calendar Events.'
        }),
        renderedSummaryHtml: expect.stringContaining(
          'Reconnect Google Calendar to include Calendar Events.'
        )
      })
    );
    expect(savedSelectedCalendars.map((calendar) => calendar.id)).toEqual(['work']);
    expect(selectedCalendarWrites).toEqual([]);
    expect(sentCalendarEventRequests).toEqual([]);
  });

  test('keeps saved Selected Calendars usable when the Calendar list provider is unavailable', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedCalendarConnection.status = 'connected';
    savedSelectedCalendars.push({
      id: 'work',
      summary: 'Work',
      backgroundColor: '#0b8043',
      primary: false
    });
    calendarListProviderMode.outcome = 'unavailable';

    await expect(loadPage()).resolves.toEqual(
      expect.objectContaining({
        selectedCalendarConfiguration: null,
        renderedSummaryHtml: expect.stringContaining('Planning')
      })
    );
    expect(sentCalendarEventRequests).toEqual([
      expect.objectContaining({ calendarIds: ['work'] })
    ]);
    expect(selectedCalendarWrites).toEqual([]);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      'Private calendar list payload'
    );
  });

  test('reports revoked Calendar list credentials as reconnect-required instead of connected', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedCalendarConnection.status = 'connected';
    savedSelectedCalendars.push({
      id: 'work',
      summary: 'Work',
      backgroundColor: '#0b8043',
      primary: false
    });
    calendarListProviderMode.outcome = 'authorization-failed';

    await expect(loadPage()).resolves.toEqual(
      expect.objectContaining({
        calendarReadiness: expect.objectContaining({
          status: 'reconnect-required',
          unavailableReason: 'Reconnect Google Calendar to include Calendar Events.'
        }),
        renderedSummaryHtml: expect.stringContaining(
          'Reconnect Google Calendar to include Calendar Events.'
        )
      })
    );
    expect(sentCalendarEventRequests).toEqual([]);
    expect(selectedCalendarWrites).toEqual([]);
  });

  test('persists the primary Google calendar as the first default Selected Calendar', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedCalendarConnection.status = 'connected';
    providerCalendars.push(
      {
        id: 'primary',
        summary: 'Ada Lovelace',
        backgroundColor: '#3f51b5',
        primary: true
      },
      {
        id: 'work',
        summary: 'Work',
        backgroundColor: '#0b8043',
        primary: false
      }
    );

    await loadPage();

    expect(selectedCalendarWrites).toEqual([
      {
        userId: 'user-1',
        calendars: [
          {
            id: 'primary',
            summary: 'Ada Lovelace',
            backgroundColor: '#3f51b5',
            primary: true
          }
        ]
      }
    ]);
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
      calendarReadiness: userCalendarReadiness,
      summaryConfiguration: savedConfiguration,
      todoState: savedTodoState,
      weatherLocation: savedWeatherLocation,
      commuteSetup: savedCommuteSetup,
      deliveryRecords: savedDeliveryRecords,
      selectedCalendarConfiguration: null,
      renderedSummaryHtml: expect.any(String)
    });
  });

  test('renders the signed-in User Commute preview from its saved baseline without Maps usage', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedCommuteSetup.routes.push(commuteRoute('route-office', 'Office'));

    const result = await loadPage();

    expect(result.renderedSummaryHtml).toContain('Office: 26 minutes');
    expect(commuteUsageAdmissions).toEqual([]);
    expect(sentCommuteEstimateRequests).toEqual([]);
  });

  test('persists successful Calendar consent and reports a connected Calendar state', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    await expect(loadPageAt('http://localhost/?calendarConnection=success')).resolves.toEqual(
      expect.objectContaining({
        calendarReadiness: expect.objectContaining({
          status: 'connected',
          statusLabel: 'Calendar connected'
        })
      })
    );
    expect(calendarConnectionWrites).toEqual([
      { operation: 'saveConnectedFromGoogleAuthAccount', userId: 'user-1' }
    ]);
  });

  test('keeps the signed-in User usable when Calendar consent fails or is canceled', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    await expect(loadPageAt('http://localhost/?calendarConnection=failed')).resolves.toEqual(
      expect.objectContaining({
        authState: expect.objectContaining({ mode: 'user', userId: 'user-1' }),
        calendarReadiness: expect.objectContaining({
          status: 'failed',
          statusLabel: 'Calendar not connected'
        })
      })
    );
    expect(calendarConnectionWrites).toEqual([{ operation: 'markFailed', userId: 'user-1' }]);
  });

  test('disconnects Google Calendar for the signed-in User only', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedCalendarConnection.status = 'connected';

    await expect(disconnectGoogleCalendar()).resolves.toEqual({ outcome: 'disconnected' });
    expect(calendarConnectionWrites).toEqual([{ operation: 'disconnect', userId: 'user-1' }]);
  });

  test('does not disconnect Google Calendar for a Visitor', async () => {
    getSession.mockResolvedValue(null);

    await expect(disconnectGoogleCalendar()).resolves.toEqual({
      outcome: 'failed',
      reason: 'visitor-not-allowed',
      message: 'Sign in with Google to disconnect Google Calendar.'
    });
    expect(calendarConnectionWrites).toEqual([]);
  });

  test('rejects account deletion for a Visitor without touching User data', async () => {
    getSession.mockResolvedValue(null);
    await expect(deleteAccount('DELETE MY ACCOUNT')).resolves.toMatchObject({ status: 403 });
    expect(deletionStart).not.toHaveBeenCalled();
    expect(deletionFinish).not.toHaveBeenCalled();
  });

  test.each([undefined, '', 'delete my account', 'DELETE MY ACCOUNT '])(
    'rejects missing or incorrect account confirmation %s without touching User data',
    async (confirmation) => {
      getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
      });
      await expect(deleteAccount(confirmation)).resolves.toMatchObject({ status: 400 });
      expect(deletionStart).not.toHaveBeenCalled();
      expect(deletionFinish).not.toHaveBeenCalled();
    }
  );

  test('finishes account deletion for the currently signed-in User', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    await expect(deleteAccount('DELETE MY ACCOUNT')).resolves.toEqual({
      accountDeletionSucceeded: true
    });
    expect(deletionStart).toHaveBeenCalledWith('user-1');
    expect(deletionFinish).toHaveBeenCalledOnce();
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
      calendarReadiness: userCalendarReadiness,
      summaryConfiguration: defaultSummaryConfiguration,
      todoState: {
        todoCategories: [],
        todoTasks: [],
        nextTodoId: 1
      },
      weatherLocation: null,
      commuteSetup: {
        routes: [],
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      },
      deliveryRecords: [],
      selectedCalendarConfiguration: null,
      renderedSummaryHtml: expect.any(String)
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
      calendarReadiness: userCalendarReadiness,
      summaryConfiguration: null,
      todoState: {
        todoCategories: [],
        todoTasks: [],
        nextTodoId: 1
      },
      weatherLocation: null,
      commuteSetup: {
        routes: [],
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      },
      deliveryRecords: [],
      selectedCalendarConfiguration: null,
      renderedSummaryHtml: null
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
      calendarReadiness: userCalendarReadiness,
      summaryConfiguration: defaultSummaryConfiguration,
      todoState: {
        todoCategories: [],
        todoTasks: [],
        nextTodoId: 1
      },
      weatherLocation: null,
      commuteSetup: {
        routes: [],
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      },
      deliveryRecords: [],
      selectedCalendarConfiguration: null,
      renderedSummaryHtml: expect.any(String)
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
        text: expect.not.stringContaining('Commute')
      })
    );
    expect(sentMessages[0]).toEqual(
      expect.objectContaining({
        html: expect.stringContaining('Connect Google Calendar to include Calendar Events.'),
        text: expect.stringContaining('Calendar\nConnect Google Calendar to include Calendar Events.')
      })
    );
    expect(sentMessages[0]).toEqual(
      expect.objectContaining({
        html: expect.not.stringContaining('Demo Calendar'),
        text: expect.not.stringContaining('Demo Calendar')
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

  test('uses live qualifying Commute Routes in HTML and text test delivery', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedCommuteSetup.routes.push(
      commuteRoute('route-office', 'Office'),
      commuteRoute('route-school', 'School'),
      commuteRoute('route-disabled', 'Disabled route', false)
    );

    await expect(sendTestDailySummary()).resolves.toEqual({ outcome: 'sent' });

    expect(sentCommuteEstimateRequests).toEqual([
      {
        origin: savedCommuteSetup.routes[0]?.origin,
        destination: savedCommuteSetup.routes[0]?.destination
      },
      {
        origin: savedCommuteSetup.routes[1]?.origin,
        destination: savedCommuteSetup.routes[1]?.destination
      }
    ]);
    expect(commuteUsageAdmissions).toEqual([
      {
        category: 'commute-estimate',
        attribution: { personUsageIdentity: 'test-user-1' }
      },
      {
        category: 'commute-estimate',
        attribution: { personUsageIdentity: 'test-user-1' }
      }
    ]);
    expect(sentMessages).toEqual([
      expect.objectContaining({
        html: expect.stringContaining('<li>Office: 24 minutes</li><li>School: 39 minutes</li>'),
        text: expect.stringContaining('Commute\nOffice: 24 minutes\nSchool: 39 minutes')
      })
    ]);
    expect(JSON.stringify(sentMessages)).not.toContain('Disabled route');
  });

  test.each([
    ['Commute is disabled', () => { savedConfiguration.sections.commute = false; }],
    ['the local weekday is not a Commute Day', () => { savedCommuteSetup.days.splice(0); }],
    ['there are no enabled routes', () => { savedCommuteSetup.routes[0]!.enabled = false; }]
  ])('makes no Maps estimate call when %s during test delivery', async (_scenario, arrange) => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedCommuteSetup.routes.push(commuteRoute('route-office', 'Office'));
    arrange();

    await expect(sendTestDailySummary()).resolves.toEqual({ outcome: 'sent' });

    expect(sentCommuteEstimateRequests).toEqual([]);
    expect(commuteUsageAdmissions).toEqual([]);
    expect(sentMessages[0]).toEqual(
      expect.objectContaining({ text: expect.not.stringContaining('Commute') })
    );
  });

  test.each(['provider-unavailable', 'suspended'] as const)(
    'keeps test delivery working with a section-level unavailable state when Commute is %s',
    async (outcome) => {
      getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
      });
      savedCommuteSetup.routes.push(commuteRoute('route-office', 'Office'));
      savedCalendarConnection.status = 'connected';
      savedSelectedCalendars.push({
        id: 'work',
        summary: 'Work',
        backgroundColor: '#0b8043',
        primary: false
      });
      commuteProviderMode.outcome = outcome;

      await expect(sendTestDailySummary()).resolves.toEqual({ outcome: 'sent' });

      expect(commuteUsageAdmissions).toHaveLength(1);
      expect(sentCommuteEstimateRequests).toHaveLength(outcome === 'suspended' ? 0 : 1);
      expect(sentMessages).toEqual([
        expect.objectContaining({
          html: expect.stringContaining('Live Commute is unavailable right now.'),
          text: expect.stringContaining('Commute\nLive Commute is unavailable right now.')
        })
      ]);
      expect(sentMessages[0]).toEqual(
        expect.objectContaining({
          text: expect.stringMatching(/Weather[\s\S]*Planning[\s\S]*Draft update/),
          html: expect.stringContaining('Planning')
        })
      );
    }
  );

  test('sends live selected Calendar Events in HTML and text test delivery', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedCalendarConnection.status = 'connected';
    savedSelectedCalendars.push({
      id: 'work',
      summary: 'Work',
      backgroundColor: '#0b8043',
      primary: false
    });

    const result = await sendTestDailySummary();

    expect(result).toEqual({ outcome: 'sent' });
    expect(sentCalendarEventRequests).toEqual([
      {
        calendarIds: ['work'],
        timeMin: '2026-07-07T04:00:00Z',
        timeMax: '2026-07-14T04:00:00Z',
        timeZone: 'America/New_York'
      }
    ]);
    expect(sentMessages).toEqual([
      expect.objectContaining({
        html: expect.stringContaining('Planning'),
        text: expect.stringContaining('Today\n11:00 Planning (Work)')
      })
    ]);
    expect(recordedDeliveryRecords).toEqual([
      {
        userId: 'user-1',
        record: expect.not.objectContaining({
          html: expect.any(String),
          text: expect.any(String),
          calendarEvents: expect.anything()
        })
      }
    ]);
    expect(JSON.stringify(recordedDeliveryRecords)).not.toContain('Planning');
    expect(JSON.stringify(recordedDeliveryRecords)).not.toContain('calendar-event-1');
  });

  test('does not load Calendar credentials when the Calendar section is disabled', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedConfiguration.sections.calendar = false;
    savedCalendarConnection.status = 'connected';
    savedSelectedCalendars.push({
      id: 'work',
      summary: 'Work',
      backgroundColor: '#0b8043',
      primary: false
    });

    const result = await sendTestDailySummary();

    expect(result).toEqual({ outcome: 'sent' });
    expect(loadedGoogleCalendarAccessTokens).toEqual([]);
    expect(loadedSelectedCalendars).toEqual([]);
    expect(sentCalendarEventRequests).toEqual([]);
    expect(sentMessages[0]).toEqual(
      expect.objectContaining({
        html: expect.not.stringContaining('Planning'),
        text: expect.not.stringContaining('Planning')
      })
    );
  });

  test('sends an unavailable Calendar Section without retaining provider failure content', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    savedCalendarConnection.status = 'connected';
    savedSelectedCalendars.push({
      id: 'work',
      summary: 'Work',
      backgroundColor: '#0b8043',
      primary: false
    });
    calendarEventProviderMode.outcome = 'private-failure';

    const result = await sendTestDailySummary();

    expect(result).toEqual({ outcome: 'sent' });
    expect(sentMessages).toEqual([
      expect.objectContaining({
        html: expect.stringContaining('Live Calendar is unavailable right now.'),
        text: expect.stringContaining('Calendar\nLive Calendar is unavailable right now.')
      })
    ]);
    expect(recordedDeliveryRecords).toEqual([
      {
        userId: 'user-1',
        record: expect.objectContaining({
          deliveryStatus: 'sent',
          providerMessageId: 'fake-message-1'
        })
      }
    ]);
    expect(JSON.stringify(recordedDeliveryRecords)).not.toContain('Therapy at 10:00');
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('Therapy at 10:00');
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      'secret-provider-token'
    );
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
    savedCalendarConnection.status = 'connected';
    savedSelectedCalendars.push({
      id: 'work',
      summary: 'Work',
      backgroundColor: '#0b8043',
      primary: false
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
    expect(sentCalendarEventRequests).toHaveLength(1);
    expect(JSON.stringify(recordedDeliveryRecords)).not.toContain('Planning');
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

  test('does not generate a preview or call its providers for a deleting User', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    lifecycleActive.value = false;

    const result = await loadPage();

    expect(result.authState).toEqual({ mode: 'visitor' });
    expect(result.renderedSummaryHtml).toBeNull();
    expect(sentForecastRequests).toEqual([]);
    expect(sentCommuteEstimateRequests).toEqual([]);
    expect(sentCalendarEventRequests).toEqual([]);
    expect(deletionStart).toHaveBeenCalledWith('user-1');
    expect(deletionFinish).toHaveBeenCalledOnce();
  });

  test('retries interrupted deletion cleanup on the next page load', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    lifecycleActive.value = false;
    deletionStart.mockResolvedValue('resuming');
    deletionFinish.mockRejectedValueOnce(new Error('database temporarily unavailable'));

    await expect(loadPage()).resolves.toEqual(expect.objectContaining({
      authState: { mode: 'visitor' },
      renderedSummaryHtml: null
    }));
    await expect(loadPage()).resolves.toEqual(expect.objectContaining({
      authState: { mode: 'visitor' },
      renderedSummaryHtml: null
    }));

    expect(deletionStart).toHaveBeenCalledTimes(2);
    expect(deletionFinish).toHaveBeenCalledTimes(2);
  });

  test('does not submit a test Daily Summary for a deleting User', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    lifecycleActive.value = false;

    await expect(sendTestDailySummary()).resolves.toEqual({
      outcome: 'failed',
      reason: 'user-deleting',
      message: 'User deletion has started, so no Daily Summary was sent.'
    });
    expect(sentMessages).toEqual([]);
  });
});
