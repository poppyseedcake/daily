import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { createUserCommuteRoute } from '$lib/server/commuteSetupPersistence';
import { userCommuteSetupStore } from '$lib/server/db/commuteSetupStore';
import { authStateFromSession } from '$lib/server/pageAuthState';

export const POST = async ({ request }) => {
  const authState = authStateFromSession(await auth.api.getSession({ headers: request.headers }));
  if (authState.mode !== 'user') return json({ outcome: 'unauthorized' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ outcome: 'invalid-route' }, { status: 400 });
  }

  const result = await createUserCommuteRoute(userCommuteSetupStore, authState.userId, payload);
  return json(result, {
    status: result.outcome === 'created' ? 201 : result.outcome === 'route-limit-reached' ? 409 : result.outcome === 'invalid-route' ? 400 : 500
  });
};
