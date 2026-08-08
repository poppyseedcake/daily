import { auth } from '$lib/server/auth';
import { isAdministratorAuthState } from '$lib/server/adminAuthorization';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { userSummaryConfigurationStore } from '$lib/server/db/summaryConfigurationStore';
import { deliveryRecordStore } from '$lib/server/db/deliveryRecordStore';
import { userTodoStore } from '$lib/server/db/todoStore';
import { userWeatherLocationStore } from '$lib/server/db/weatherLocationStore';
import { userCommuteSetupStore } from '$lib/server/db/commuteSetupStore';
import {
  userSavedCommuteAddressStore,
  userSavedWeatherCityStore
} from '$lib/server/db/savedLocationStore';
import {
  userCalendarConnectionStore,
  type CalendarConnection
} from '$lib/server/db/calendarConnectionStore';
import {
  DailySummaryDeliveryError,
  type DailySummaryDeliveryErrorClassification,
  dailySummaryDeliveryProvider,
  dailySummarySenderAddress
} from '$lib/server/dailySummaryDelivery';
import { buildDailySummaryInput } from '$lib/dailySummaryPreview';
import { dailySummarySubject } from '$lib/dailySummaryRenderer';
import {
  calendarReadinessForAuthMode,
  calendarReadinessForUnavailableCredentials,
  calendarReadinessForUnavailableProvider,
  calendarReadinessForUserConnection
} from '$lib/calendarReadiness';
import {
  buildSelectedCalendarConfiguration,
  type SavedSelectedCalendar
} from '$lib/selectedCalendars';
import {
  googleCalendarEventProvider,
  googleCalendarListProvider,
  isGoogleCalendarAuthorizationFailure,
  loadGoogleCalendarAccessToken
} from '$lib/server/googleCalendarList';
import { loadUserSummaryConfiguration } from '$lib/server/summaryConfigurationPersistence';
import { loadUserTodoStateSafely } from '$lib/server/todoPersistence';
import { loadUserWeatherLocation } from '$lib/server/weatherLocationPersistence';
import { loadUserCommuteSetup } from '$lib/server/commuteSetupPersistence';
import {
  defaultSummaryConfiguration,
  summaryConfigurationSchema
} from '$lib/summaryConfiguration';
import { createDefaultTodoState, todoStateSchema } from '$lib/todo';
import { googleMapsOperations } from '$lib/server/googleMapsOperations';
import { toDeliveryHistoryRecord } from '$lib/deliveryRecords';
import { userLifecycleStore } from '$lib/server/db/userLifecycleStore';
import { accountDeletionStore } from '$lib/server/db/accountDeletionStore';
import { accountDeletionConfirmation } from '$lib/accountDeletion';
import { deleteDailyAccount } from '$lib/server/accountDeletion';
import { openAiWeatherSummaryProvider } from '$lib/server/weatherSummaryProvider';
import { openMeteoWeatherForecastProvider } from '$lib/weatherForecast';
import {
  createDailySummaryGenerator,
  ScheduledDailySummaryUserNotActiveError
} from '$lib/server/scheduledDailySummaryGeneration';
import { defaultCommuteDays } from '$lib/commuteRoute';
import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';

const testDeliveryFailureMessage = (classification: DailySummaryDeliveryErrorClassification) => {
  switch (classification) {
    case 'configuration-missing':
      return 'Test Daily Summary delivery is not configured.';
    case 'validation-failed':
      return 'The delivery provider could not validate the test Daily Summary.';
    case 'authentication-failed':
      return 'The delivery provider could not authenticate the test Daily Summary request.';
    case 'provider-rejected':
      return 'The delivery provider rejected the test Daily Summary.';
    case 'provider-unavailable':
      return 'The test Daily Summary could not be sent.';
    default: {
      const exhaustiveClassification: never = classification;
      return exhaustiveClassification;
    }
  }
};

const validationFailureResponse = {
  outcome: 'failed',
  reason: 'validation-failed',
  message: 'The saved Daily Summary setup is invalid, so no provider request was made.'
} as const;

const deletingUserTestDeliveryFailure = {
  outcome: 'failed',
  reason: 'user-deleting',
  message: 'User deletion has started, so no Daily Summary was sent.'
} as const;

const rejectTestDeliveryForInactiveUser = async (userId: string) =>
  (await userLifecycleStore.isActive(userId)) ? null : deletingUserTestDeliveryFailure;

type CalendarGenerationContext = {
  accessToken: string | null;
  selectedCalendars: SavedSelectedCalendar[];
  readiness: ReturnType<typeof calendarReadinessForUserConnection>;
};

const commuteEstimateProviderFor = (userId: string) => {
  try {
    return googleMapsOperations.requestGateway({ mode: 'user', userId });
  } catch {
    return undefined;
  }
};

const dailySummaryGenerator = createDailySummaryGenerator({
  userLifecycleStore,
  configurationStore: userSummaryConfigurationStore,
  todoStore: userTodoStore,
  weatherLocationStore: userWeatherLocationStore,
  commuteSetupStore: userCommuteSetupStore,
  calendarConnectionStore: userCalendarConnectionStore,
  loadCalendarAccessToken: loadGoogleCalendarAccessToken,
  calendarEventProvider: googleCalendarEventProvider,
  weatherProvider: openMeteoWeatherForecastProvider,
  weatherSummaryProvider: openAiWeatherSummaryProvider,
  commuteEstimateProvider: (userId) => commuteEstimateProviderFor(userId)
});

type LoadedCommuteSetup = Awaited<ReturnType<typeof loadUserCommuteSetup>>;

const defaultLoadedCommuteSetup: LoadedCommuteSetup = {
  routes: [],
  days: [...defaultCommuteDays]
};

const loadPageCommuteSetup = async (userId: string): Promise<{
  setup: LoadedCommuteSetup;
  unavailable: boolean;
}> => {
  try {
    return {
      setup: await loadUserCommuteSetup(userCommuteSetupStore, userId),
      unavailable: false
    };
  } catch {
    console.warn('Failed to load User Commute setup.', {
      userId,
      classification: 'commute-setup-unavailable'
    });
    return { setup: defaultLoadedCommuteSetup, unavailable: true };
  }
};

const loadCalendarGenerationContext = async (
  userId: string,
  connection: CalendarConnection
): Promise<CalendarGenerationContext> => {
  if (connection.status !== 'connected') {
    return {
      accessToken: null,
      selectedCalendars: [],
      readiness: calendarReadinessForUserConnection(connection)
    };
  }

  try {
    const accessToken = await loadGoogleCalendarAccessToken(userId);

    if (!accessToken) {
      return {
        accessToken: null,
        selectedCalendars: [],
        readiness: calendarReadinessForUnavailableCredentials()
      };
    }

    return {
      accessToken,
      selectedCalendars: await userCalendarConnectionStore.loadSelectedCalendars(userId),
      readiness: calendarReadinessForUserConnection(connection)
    };
  } catch {
    console.warn('Failed to load Calendar generation configuration.', { userId });

    return {
      accessToken: null,
      selectedCalendars: [],
      readiness: calendarReadinessForUnavailableCredentials()
    };
  }
};

export const load = async ({ request }) => {
  const requestOrigin = env.ORIGIN ?? env.BETTER_AUTH_URL ?? new URL(request.url).origin;
  const openDailyUrl = `${requestOrigin}/`;
  const session = await auth.api.getSession({
    headers: request.headers
  });
  let authState = authStateFromSession(session);
  if (
    authState.mode === 'user' &&
    !(await userLifecycleStore.isActive(authState.userId))
  ) {
    try {
      const attributionSecret = env.GOOGLE_MAPS_ATTRIBUTION_SECRET;
      if (attributionSecret) {
        await deleteDailyAccount({
          userId: authState.userId,
          attributionSecret,
          store: accountDeletionStore
        });
      }
    } catch {
      // The committed deleting state is resumable; a later page load will retry cleanup.
      console.warn('Account deletion cleanup remains pending.');
    }
    authState = { mode: 'visitor' };
  }
  const calendarConnectionResult = new URL(request.url).searchParams.get('calendarConnection');

  if (authState.mode === 'user' && calendarConnectionResult === 'success') {
    const storedConnection = await userCalendarConnectionStore.saveConnectedFromGoogleAuthAccount(
      authState.userId
    );

    if (!storedConnection) {
      await userCalendarConnectionStore.markFailed(authState.userId);
    }
  }

  if (authState.mode === 'user' && calendarConnectionResult === 'failed') {
    await userCalendarConnectionStore.markFailed(authState.userId);
  }
  let summaryConfigurationLoadFailed = false;
  const savedSummaryConfiguration =
    authState.mode === 'user'
      ? await userSummaryConfigurationStore.load(authState.userId).catch(() => {
          summaryConfigurationLoadFailed = true;
          console.warn('Failed to load User Summary Configuration.', {
            userId: authState.userId,
            classification: 'summary-configuration-unavailable'
          });

          return null;
        })
      : null;
  const summaryConfiguration =
    authState.mode === 'user'
      ? summaryConfigurationLoadFailed
        ? null
        : savedSummaryConfiguration ?? defaultSummaryConfiguration
      : null;
  const todoStateContext =
    authState.mode === 'user'
      ? await loadUserTodoStateSafely(userTodoStore, authState.userId)
      : { state: createDefaultTodoState(), unavailable: false };
  const todoState = todoStateContext.state;
  const todoStateLoadFailed = todoStateContext.unavailable;

  if (todoStateLoadFailed && authState.mode === 'user') {
    console.warn('Failed to load User Todo state.', {
      userId: authState.userId,
      classification: 'todo-state-unavailable'
    });
  }
  const deliveryRecords =
    authState.mode === 'user'
      ? await deliveryRecordStore
          .loadRecentForUser(authState.userId, new Date().toISOString())
          .then((records) => records.map(toDeliveryHistoryRecord))
          .catch(() => {
            console.warn('Failed to load User Delivery Records.', {
              userId: authState.userId,
              classification: 'delivery-records-unavailable'
            });

            return [];
          })
      : [];
  const weatherLocation =
    authState.mode === 'user'
      ? await loadUserWeatherLocation(userWeatherLocationStore, authState.userId).catch(() => {
          console.warn('Failed to load User Weather Location.', {
            userId: authState.userId,
            classification: 'weather-location-unavailable'
          });

          return null;
        })
      : null;
  const commuteContext =
    authState.mode === 'user' ? await loadPageCommuteSetup(authState.userId) : null;
  const commuteSetup = commuteContext?.setup ?? null;
  const savedWeatherCities =
    authState.mode === 'user'
      ? await userSavedWeatherCityStore.load(authState.userId).catch(() => {
          console.warn('Failed to load User Saved Weather Cities.', {
            userId: authState.userId,
            classification: 'saved-weather-cities-unavailable'
          });

          return [];
        })
      : [];
  const savedCommuteAddresses =
    authState.mode === 'user'
      ? await userSavedCommuteAddressStore.load(authState.userId).catch(() => {
          console.warn('Failed to load User Saved Commute Addresses.', {
            userId: authState.userId,
            classification: 'saved-commute-addresses-unavailable'
          });

          return [];
        })
      : [];
  const calendarConnection =
    authState.mode === 'user'
      ? await userCalendarConnectionStore.load(authState.userId).catch(() => {
          console.warn('Failed to load User Calendar Connection.', {
            userId: authState.userId,
            classification: 'calendar-connection-unavailable'
          });

          return { status: 'not-connected' } as const;
        })
      : null;
  const calendarGenerationContext =
    authState.mode === 'user' &&
    calendarConnection
      ? await loadCalendarGenerationContext(authState.userId, calendarConnection)
      : null;
  let calendarReadiness =
    calendarGenerationContext?.readiness ??
    (authState.mode === 'user' && calendarConnection
      ? calendarReadinessForUserConnection(calendarConnection)
      : calendarReadinessForAuthMode(authState.mode));
  const calendarListAccessToken = calendarGenerationContext?.accessToken;
  const selectedCalendarConfiguration =
    authState.mode === 'user' &&
    calendarConnection?.status === 'connected' &&
    calendarListAccessToken
      ? await (async () => {
          try {
            const providerCalendars = await googleCalendarListProvider.loadCalendars(
              calendarListAccessToken
            );
            const configuration = buildSelectedCalendarConfiguration({
              providerCalendars,
              savedCalendars: calendarGenerationContext.selectedCalendars
            });

            if (
              calendarGenerationContext.selectedCalendars.length === 0 &&
              configuration.selectedCalendarIds.length > 0
            ) {
              await userCalendarConnectionStore.saveSelectedCalendars(
                authState.userId,
                configuration.calendars
                  .filter((calendar) => calendar.selected)
                  .map((calendar) => ({
                    id: calendar.id,
                    summary: calendar.summary,
                    backgroundColor: calendar.backgroundColor,
                    primary: calendar.primary
                  }))
              );
            }

            return configuration;
          } catch (error) {
            const authorizationFailed = isGoogleCalendarAuthorizationFailure(error);

            if (authorizationFailed) {
              calendarReadiness = calendarReadinessForUnavailableCredentials();
            }

            console.warn('Failed to load User Selected Calendar configuration.', {
              userId: authState.userId,
              classification: authorizationFailed
                ? 'authorization-failed'
                : 'provider-unavailable'
            });

            return null;
          }
      })()
      : null;
  const renderedSummary =
    authState.mode === 'user'
      ? await (async () => {
          const validConfiguration = summaryConfigurationSchema.safeParse(summaryConfiguration);
          const validTodoState = todoStateSchema.safeParse(todoState);

          if (!validConfiguration.success) {
            return null;
          }

          const generationTodoState = validTodoState.success
            ? validTodoState.data
            : createDefaultTodoState();

          const selectedCalendars =
            calendarConnection?.status === 'connected'
              ? selectedCalendarConfiguration
                ? selectedCalendarConfiguration.calendars
                    .filter((calendar) => calendar.selected)
                    .map((calendar) => ({
                      id: calendar.id,
                      summary: calendar.summary,
                      backgroundColor: calendar.backgroundColor,
                      primary: calendar.primary
                    }))
                : (calendarGenerationContext?.selectedCalendars ?? [])
              : [];
          const generationSetup = {
            authMode: 'user',
            configuration: validConfiguration.data,
            todoCategories: generationTodoState.todoCategories,
            todoTasks: generationTodoState.todoTasks,
            todoStateUnavailable: todoStateLoadFailed || !validTodoState.success,
            weatherLocation,
            commuteRoutes: commuteSetup?.routes ?? [],
            commuteDays: commuteSetup?.days ?? [],
            commuteSetupUnavailable: commuteContext?.unavailable ?? false,
            calendarReadiness,
            selectedCalendars,
            calendarEventProvider: calendarGenerationContext?.accessToken
              ? googleCalendarEventProvider(calendarGenerationContext.accessToken)
              : undefined,
            weatherSummaryProvider: openAiWeatherSummaryProvider,
            openDailyUrl
          } as const;
          const calendarSummaryIsActive = !validConfiguration.data.sectionPauses.calendar;
          let generatedSummary;
          try {
            generatedSummary = await dailySummaryGenerator.generate(authState.userId, {
              configuration: validConfiguration.data,
              openDailyUrl,
              calendarContext: calendarSummaryIsActive
                ? {
                    readiness: calendarReadiness,
                    selectedCalendars,
                    provider: calendarGenerationContext?.accessToken
                      ? googleCalendarEventProvider(calendarGenerationContext.accessToken)
                      : undefined
                  }
                : undefined
            });
          } catch (error) {
            if (error instanceof ScheduledDailySummaryUserNotActiveError) {
              return null;
            }

            throw error;
          }
          const input = generatedSummary.input;
          // The dashboard Calendar agenda is independent from the Calendar
          // Summary Section, so pausing the Summary must not hide page context.
          const calendarAgendaInput = calendarSummaryIsActive
            ? input
            : await buildDailySummaryInput({
                ...generationSetup,
                configuration: {
                  ...validConfiguration.data,
                  sectionPauses: {
                    ...validConfiguration.data.sectionPauses,
                    calendar: false
                  }
                }
              });

          if (
            calendarReadiness.status === 'connected' &&
            (input.sections.calendar.status === 'unavailable' ||
              calendarAgendaInput?.sections.calendar.status === 'unavailable')
          ) {
            calendarReadiness = calendarReadinessForUnavailableProvider();
          }

          return {
            html: generatedSummary.rendered.html,
            calendarSection: calendarAgendaInput?.calendarSection ?? null
          };
        })()
      : null;

  return {
    authState,
    isAdministrator: isAdministratorAuthState(authState),
    calendarReadiness,
    summaryConfiguration,
    ...(authState.mode === 'user' && !summaryConfigurationLoadFailed
      ? { hasSavedSummaryConfiguration: savedSummaryConfiguration !== null }
      : {}),
    todoState,
    weatherLocation,
    commuteSetup,
    savedWeatherCities,
    savedCommuteAddresses,
    deliveryRecords,
    selectedCalendarConfiguration,
    renderedSummaryHtml: renderedSummary?.html ?? null,
    calendarSection: renderedSummary?.calendarSection ?? null
  };
};

export const actions = {
  deleteAccount: async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    const authState = authStateFromSession(session);
    if (authState.mode !== 'user') {
      return fail(403, { accountDeletionError: 'Only a signed-in User can delete an account.' });
    }

    const formData = await request.formData();
    if (formData.get('confirmation') !== accountDeletionConfirmation) {
      return fail(400, {
        accountDeletionError: `Enter ${accountDeletionConfirmation} exactly to continue.`
      });
    }

    const attributionSecret = env.GOOGLE_MAPS_ATTRIBUTION_SECRET;
    if (!attributionSecret) {
      return fail(503, { accountDeletionError: 'Account deletion is temporarily unavailable.' });
    }

    const deleted = await deleteDailyAccount({
      userId: authState.userId,
      attributionSecret,
      store: accountDeletionStore
    });
    if (!deleted) {
      return fail(409, { accountDeletionError: 'Account deletion could not be completed.' });
    }
    return { accountDeletionSucceeded: true as const };
  },
  disconnectGoogleCalendar: async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers
    });
    const authState = authStateFromSession(session);

    if (authState.mode !== 'user') {
      return {
        outcome: 'failed',
        reason: 'visitor-not-allowed',
        message: 'Sign in with Google to disconnect Google Calendar.'
      };
    }

    await userCalendarConnectionStore.disconnect(authState.userId);

    return { outcome: 'disconnected' };
  },
  sendTestDailySummary: async ({ request }) => {
    const openDailyUrl = `${env.ORIGIN ?? env.BETTER_AUTH_URL ?? new URL(request.url).origin}/`;
    const session = await auth.api.getSession({
      headers: request.headers
    });
    const authState = authStateFromSession(session);

    if (authState.mode !== 'user') {
      return {
        outcome: 'failed',
        reason: 'visitor-not-allowed',
        message: 'Sign in with Google to send a test Daily Summary.'
      };
    }

    const inactiveUserFailure = await rejectTestDeliveryForInactiveUser(authState.userId);
    if (inactiveUserFailure) {
      return inactiveUserFailure;
    }

    const requestedAt = new Date().toISOString();
    const configuration = await loadUserSummaryConfiguration(
      userSummaryConfigurationStore,
      authState.userId
    );
    const validConfiguration = summaryConfigurationSchema.safeParse(configuration);

    if (!validConfiguration.success) {
      return validationFailureResponse;
    }

    let generatedSummary;
    try {
      generatedSummary = await dailySummaryGenerator.generate(authState.userId, {
        configuration: validConfiguration.data,
        openDailyUrl
      });
    } catch (error) {
      if (error instanceof ScheduledDailySummaryUserNotActiveError) {
        return deletingUserTestDeliveryFailure;
      }

      throw error;
    }
    const message = {
      to: authState.summaryRecipient,
      from: dailySummarySenderAddress(),
      subject: dailySummarySubject(
        'test',
        generatedSummary.input.generatedAt ?? new Date(),
        generatedSummary.input.configuration.userTimeZone
      ),
      html: generatedSummary.rendered.html,
      text: generatedSummary.rendered.text
    };
    let accepted;

    try {
      const inactiveUserFailure = await rejectTestDeliveryForInactiveUser(authState.userId);
      if (inactiveUserFailure) {
        return inactiveUserFailure;
      }

      accepted = await dailySummaryDeliveryProvider.send(message);
    } catch (error) {
      if (!(error instanceof DailySummaryDeliveryError)) {
        throw error;
      }

      await deliveryRecordStore.recordAttempt(authState.userId, {
        id: crypto.randomUUID(),
        attemptType: 'test',
        requestedAt,
        completedAt: new Date().toISOString(),
        deliveryStatus: 'failed',
        providerName: error.providerName,
        providerMessageId: null,
        providerStatusMetadata: error.providerStatusMetadata,
        errorClassification: error.classification
      });

      return {
        outcome: 'failed',
        reason: error.classification,
        message: testDeliveryFailureMessage(error.classification)
      };
    }

    if (!accepted.providerMessageId) {
      await deliveryRecordStore.recordAttempt(authState.userId, {
        id: crypto.randomUUID(),
        attemptType: 'test',
        requestedAt,
        completedAt: new Date().toISOString(),
        deliveryStatus: 'failed',
        providerName: accepted.providerName,
        providerMessageId: null,
        providerStatusMetadata: accepted.providerStatusMetadata
          ? `${accepted.providerStatusMetadata}; missing message id`
          : 'missing message id',
        errorClassification: 'provider-missing-message-id'
      });

      return {
        outcome: 'failed',
        reason: 'provider-missing-message-id',
        message: 'The delivery provider accepted the request without a message id.'
      };
    }

    await deliveryRecordStore.recordAttempt(authState.userId, {
      id: crypto.randomUUID(),
      attemptType: 'test',
      requestedAt,
      completedAt: new Date().toISOString(),
      deliveryStatus: 'sent',
      providerName: accepted.providerName,
      providerMessageId: accepted.providerMessageId,
      providerStatusMetadata: accepted.providerStatusMetadata,
      errorClassification: null
    });

    return { outcome: 'sent' };
  }
};
