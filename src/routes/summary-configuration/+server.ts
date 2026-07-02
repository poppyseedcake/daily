import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { userSummaryConfigurationStore } from '$lib/server/db/summaryConfigurationStore';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { saveUserSummaryConfiguration } from '$lib/server/summaryConfigurationPersistence';

export const PUT = async ({ request }) => {
  const session = await auth.api.getSession({
    headers: request.headers
  });
  const authState = authStateFromSession(session);

  if (authState.mode !== 'user') {
    return json({ outcome: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json({ outcome: 'invalid-configuration' }, { status: 400 });
  }

  const result = await saveUserSummaryConfiguration(userSummaryConfigurationStore, authState.userId, payload);

  if (result.outcome === 'invalid-configuration') {
    return json(result, { status: 400 });
  }

  if (result.outcome === 'save-failed') {
    return json(result, { status: 500 });
  }

  return json(result);
};
