import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { userCommuteSetupStore } from '$lib/server/db/commuteSetupStore';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { updateUserCommuteRoute } from '$lib/server/commuteSetupPersistence';

const authenticatedUser = async (request: Request) =>
  authStateFromSession(await auth.api.getSession({ headers: request.headers }));

export const PUT = async ({ request, params }) => {
  const authState = await authenticatedUser(request);
  if (authState.mode !== 'user') return json({ outcome: 'unauthorized' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ outcome: 'invalid-route' }, { status: 400 });
  }

  const result = await updateUserCommuteRoute(
    userCommuteSetupStore,
    authState.userId,
    params.routeId,
    payload
  );
  return json(result, {
    status: result.outcome === 'updated' ? 200 : result.outcome === 'not-found' ? 404 : result.outcome === 'invalid-route' ? 400 : 500
  });
};

export const DELETE = async ({ request, params }) => {
  const authState = await authenticatedUser(request);
  if (authState.mode !== 'user') return json({ outcome: 'unauthorized' }, { status: 401 });

  const deleted = await userCommuteSetupStore.deleteRoute(authState.userId, params.routeId);
  return deleted ? json({ outcome: 'deleted' }) : json({ outcome: 'not-found' }, { status: 404 });
};
