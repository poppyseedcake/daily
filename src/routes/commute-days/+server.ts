import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { userCommuteSetupStore } from '$lib/server/db/commuteSetupStore';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { saveUserCommuteDays } from '$lib/server/commuteSetupPersistence';

export const PUT = async ({ request }) => {
  const authState = authStateFromSession(await auth.api.getSession({ headers: request.headers }));
  if (authState.mode !== 'user') return json({ outcome: 'unauthorized' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ outcome: 'invalid-commute-days' }, { status: 400 });
  }

  const result = await saveUserCommuteDays(userCommuteSetupStore, authState.userId, payload);
  return json(result, { status: result.outcome === 'saved' ? 200 : result.outcome === 'invalid-commute-days' ? 400 : 500 });
};
