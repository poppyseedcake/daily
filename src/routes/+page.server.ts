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
import { userCalendarConnectionStore } from '$lib/server/db/calendarConnectionStore';
import {
  dailySummaryDeliveryProvider,
  dailySummarySenderAddress
} from '$lib/server/dailySummaryDelivery';
import { calendarReadinessForAuthMode } from '$lib/calendarReadiness';
import { buildCalendarAgenda } from '$lib/calendar';
import {
  googleCalendarEventProvider,
  googleCalendarListProvider,
  isGoogleCalendarAuthorizationFailure,
  loadGoogleCalendarAccessToken
} from '$lib/server/googleCalendarList';
import { createUserCalendarEvents } from '$lib/server/userCalendarEvents';
import { loadUserSummaryConfiguration } from '$lib/server/summaryConfigurationPersistence';
import { loadUserTodoStateSafely } from '$lib/server/todoPersistence';
import { loadUserWeatherLocation } from '$lib/server/weatherLocationPersistence';
import { loadUserCommuteSetup } from '$lib/server/commuteSetupPersistence';
import {
  defaultSummaryConfiguration,
  summaryConfigurationSchema
} from '$lib/summaryConfiguration';
import { createDefaultTodoState } from '$lib/todo';
import { toDeliveryHistoryRecord } from '$lib/deliveryRecords';
import { userLifecycleStore } from '$lib/server/db/userLifecycleStore';
import { accountDeletionStore } from '$lib/server/db/accountDeletionStore';
import { accountDeletionConfirmation } from '$lib/accountDeletion';
import { deleteDailyAccount } from '$lib/server/accountDeletion';
import { createProductionUserDailySummaryGenerator } from '$lib/server/productionUserDailySummaryGeneration';
import { UserDailySummaryNotActiveError } from '$lib/dailySummaryGeneration/server';
import { createTestDailySummaryDelivery } from '$lib/server/testDailySummaryDelivery';
import { defaultCommuteDays } from '$lib/commuteRoute';
import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import {
  isLegalConfirmationComplete,
  legalConfirmationCookieName
} from '$lib/legalConfirmation';
import { userLegalConfirmationStore } from '$lib/server/db/userLegalConfirmationStore';
import { parseLegalConfirmationCookie } from '$lib/server/legalConfirmation';

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

const userCalendarEvents = createUserCalendarEvents({
  connectionStore: userCalendarConnectionStore,
  loadAccessToken: loadGoogleCalendarAccessToken,
  eventProvider: googleCalendarEventProvider,
  calendarListProvider: googleCalendarListProvider,
  isAuthorizationFailure: isGoogleCalendarAuthorizationFailure
});

const dailySummaryGenerator = createProductionUserDailySummaryGenerator(userCalendarEvents);

const testDailySummaryDelivery = createTestDailySummaryDelivery({
  deliveryProvider: dailySummaryDeliveryProvider,
  senderAddress: dailySummarySenderAddress,
  recordAttempt: (userId, record) => deliveryRecordStore.recordAttempt(userId, record)
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

export const load = async ({ request, cookies }) => {
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

  if (authState.mode === 'user') {
    const storedLegalConfirmation = await userLegalConfirmationStore.load(authState.userId);
    const pendingLegalConfirmation = parseLegalConfirmationCookie(request.headers);

    if (!isLegalConfirmationComplete(storedLegalConfirmation)) {
      if (pendingLegalConfirmation) {
        await userLegalConfirmationStore.save(authState.userId, pendingLegalConfirmation);
        cookies.delete(legalConfirmationCookieName, { path: '/' });
      } else {
        const currentUrl = new URL(request.url);
        const returnTo = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
        throw redirect(
          303,
          `/account/confirm?returnTo=${encodeURIComponent(returnTo.startsWith('/') ? returnTo : '/')}`
        );
      }
    }
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
  const calendarNow = new Date();
  const loadedPageCalendar =
    authState.mode === 'user'
      ? await userCalendarEvents.load({
          userId: authState.userId,
          userTimeZone:
            summaryConfiguration?.userTimeZone ?? defaultSummaryConfiguration.userTimeZone,
          now: calendarNow,
          refreshSelectedCalendarConfiguration: true
        })
      : null;
  const calendarReadiness =
    loadedPageCalendar?.calendarEvents.readiness ??
    calendarReadinessForAuthMode(authState.mode);
  const selectedCalendarConfiguration =
    loadedPageCalendar?.selectedCalendarConfiguration ?? null;
  const validConfiguration = summaryConfigurationSchema.safeParse(summaryConfiguration);
  const calendarSection = loadedPageCalendar && validConfiguration.success
    ? buildCalendarAgenda({
        calendarEvents: loadedPageCalendar.calendarEvents,
        userTimeZone: validConfiguration.data.userTimeZone,
        now: calendarNow
      })
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
    calendarSection
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

    const inactiveUserFailureBeforeDelivery = await rejectTestDeliveryForInactiveUser(authState.userId);
    if (inactiveUserFailureBeforeDelivery) {
      return inactiveUserFailureBeforeDelivery;
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
      generatedSummary = await dailySummaryGenerator.generate(
        { userId: authState.userId, configuration: validConfiguration.data },
        { openDailyUrl }
      );
    } catch (error) {
      if (error instanceof UserDailySummaryNotActiveError) {
        return deletingUserTestDeliveryFailure;
      }

      throw error;
    }
    const inactiveUserFailure = await rejectTestDeliveryForInactiveUser(authState.userId);
    if (inactiveUserFailure) {
      return inactiveUserFailure;
    }

    return testDailySummaryDelivery.send({
      userId: authState.userId,
      summaryRecipient: authState.summaryRecipient,
      requestedAt,
      generated: generatedSummary
    });
  }
};
