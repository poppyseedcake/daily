import { auth } from '$lib/server/auth';
import { isAdministratorAuthState } from '$lib/server/adminAuthorization';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { userSummaryConfigurationStore } from '$lib/server/db/summaryConfigurationStore';
import { deliveryRecordStore } from '$lib/server/db/deliveryRecordStore';
import { userTodoStore } from '$lib/server/db/todoStore';
import { userWeatherLocationStore } from '$lib/server/db/weatherLocationStore';
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
import { renderDailySummary } from '$lib/dailySummaryRenderer';
import {
  calendarReadinessForAuthMode,
  calendarReadinessForUnavailableCredentials,
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
import { loadUserTodoState } from '$lib/server/todoPersistence';
import { loadUserWeatherLocation } from '$lib/server/weatherLocationPersistence';
import { summaryConfigurationSchema } from '$lib/summaryConfiguration';
import { createDefaultTodoState, todoStateSchema } from '$lib/todo';

const testDeliveryFailureMessage = (classification: DailySummaryDeliveryErrorClassification) => {
  switch (classification) {
    case 'configuration-missing':
      return 'Test Daily Summary delivery is not configured.';
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

type CalendarGenerationContext = {
  accessToken: string | null;
  selectedCalendars: SavedSelectedCalendar[];
  readiness: ReturnType<typeof calendarReadinessForUserConnection>;
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
  const session = await auth.api.getSession({
    headers: request.headers
  });
  const authState = authStateFromSession(session);
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
  const summaryConfiguration =
    authState.mode === 'user'
      ? await loadUserSummaryConfiguration(userSummaryConfigurationStore, authState.userId).catch((error: unknown) => {
          console.warn('Failed to load User Summary Configuration.', {
            userId: authState.userId,
            error
          });

          return null;
        })
      : null;
  const todoState =
    authState.mode === 'user'
      ? await loadUserTodoState(userTodoStore, authState.userId).catch((error: unknown) => {
          console.warn('Failed to load User Todo state.', {
            userId: authState.userId,
            error
          });

          return createDefaultTodoState();
        })
      : createDefaultTodoState();
  const deliveryRecords =
    authState.mode === 'user'
      ? await deliveryRecordStore.loadRecentForUser(authState.userId, new Date().toISOString()).catch((error: unknown) => {
          console.warn('Failed to load User Delivery Records.', {
            userId: authState.userId,
            error
          });

          return [];
        })
      : [];
  const weatherLocation =
    authState.mode === 'user'
      ? await loadUserWeatherLocation(userWeatherLocationStore, authState.userId).catch((error: unknown) => {
          console.warn('Failed to load User Weather Location.', {
            userId: authState.userId,
            error
          });

          return null;
        })
      : null;
  const calendarConnection =
    authState.mode === 'user'
      ? await userCalendarConnectionStore.load(authState.userId).catch((error: unknown) => {
          console.warn('Failed to load User Calendar Connection.', {
            userId: authState.userId,
            error
          });

          return { status: 'not-connected' } as const;
        })
      : null;
  const calendarGenerationContext =
    authState.mode === 'user' && calendarConnection
      ? await loadCalendarGenerationContext(authState.userId, calendarConnection)
      : null;
  let calendarReadiness =
    calendarGenerationContext?.readiness ?? calendarReadinessForAuthMode(authState.mode);
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
  const renderedSummaryHtml =
    authState.mode === 'user'
      ? await (async () => {
          const validConfiguration = summaryConfigurationSchema.safeParse(summaryConfiguration);
          const validTodoState = todoStateSchema.safeParse(todoState);

          if (!validConfiguration.success || !validTodoState.success) {
            return null;
          }

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
          return renderDailySummary(
            await buildDailySummaryInput({
              authMode: 'user',
              configuration: validConfiguration.data,
              todoCategories: validTodoState.data.todoCategories,
              todoTasks: validTodoState.data.todoTasks,
              weatherLocation,
              calendarReadiness,
              selectedCalendars,
              calendarEventProvider: calendarGenerationContext?.accessToken
                ? googleCalendarEventProvider(calendarGenerationContext.accessToken)
                : undefined
            })
          ).html;
        })()
      : null;

  return {
    authState,
    isAdministrator: isAdministratorAuthState(authState),
    calendarReadiness,
    summaryConfiguration,
    todoState,
    weatherLocation,
    deliveryRecords,
    selectedCalendarConfiguration,
    renderedSummaryHtml
  };
};

export const actions = {
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

    const requestedAt = new Date().toISOString();
    const configuration = await loadUserSummaryConfiguration(
      userSummaryConfigurationStore,
      authState.userId
    );
    const todoState = await loadUserTodoState(userTodoStore, authState.userId);
    const weatherLocation = await loadUserWeatherLocation(userWeatherLocationStore, authState.userId);
    const validConfiguration = summaryConfigurationSchema.safeParse(configuration);
    const validTodoState = todoStateSchema.safeParse(todoState);

    if (!validConfiguration.success || !validTodoState.success) {
      return validationFailureResponse;
    }

    const calendarConnection = await userCalendarConnectionStore.load(authState.userId);
    const calendarGenerationContext = validConfiguration.data.sections.calendar
      ? await loadCalendarGenerationContext(authState.userId, calendarConnection)
      : {
          accessToken: null,
          selectedCalendars: [],
          readiness: calendarReadinessForAuthMode('user')
        };

    const renderedSummary = renderDailySummary(
      await buildDailySummaryInput({
        configuration: validConfiguration.data,
        todoCategories: validTodoState.data.todoCategories,
        todoTasks: validTodoState.data.todoTasks,
        weatherLocation,
        calendarReadiness: calendarGenerationContext.readiness,
        selectedCalendars: calendarGenerationContext.selectedCalendars,
        calendarEventProvider: calendarGenerationContext.accessToken
          ? googleCalendarEventProvider(calendarGenerationContext.accessToken)
          : undefined
      })
    );
    const message = {
      to: authState.summaryRecipient,
      from: dailySummarySenderAddress(),
      subject: 'Test Daily Summary',
      html: renderedSummary.html,
      text: renderedSummary.text
    };
    let accepted;

    try {
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
