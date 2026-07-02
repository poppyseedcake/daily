import { auth } from '$lib/server/auth';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { userSummaryConfigurationStore } from '$lib/server/db/summaryConfigurationStore';
import { loadUserSummaryConfiguration } from '$lib/server/summaryConfigurationPersistence';

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

  return {
    authState,
    summaryConfiguration
  };
};
