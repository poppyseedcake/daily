import { auth } from '$lib/server/auth';
import { isAdministratorAuthState } from '$lib/server/adminAuthorization';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { userSummaryConfigurationStore } from '$lib/server/db/summaryConfigurationStore';
import { deliveryRecordStore } from '$lib/server/db/deliveryRecordStore';
import { userTodoStore } from '$lib/server/db/todoStore';
import { loadUserSummaryConfiguration } from '$lib/server/summaryConfigurationPersistence';
import { loadUserTodoState } from '$lib/server/todoPersistence';
import { createDefaultTodoState } from '$lib/todo';

export const load = async ({ request }) => {
  const session = await auth.api.getSession({
    headers: request.headers
  });
  const authState = authStateFromSession(session);
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

  return {
    authState,
    isAdministrator: isAdministratorAuthState(authState),
    summaryConfiguration,
    todoState,
    deliveryRecords
  };
};
