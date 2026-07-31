import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { userSavedCommuteAddressStore } from '$lib/server/db/savedLocationStore';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { saveUserSavedCommuteAddresses } from '$lib/server/savedLocationPersistence';

export const PUT = async ({ request }) => {
  const authState = authStateFromSession(await auth.api.getSession({ headers: request.headers }));

  if (authState.mode !== 'user') {
    return json({ outcome: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ outcome: 'invalid-saved-commute-addresses' }, { status: 400 });
  }

  const result = await saveUserSavedCommuteAddresses(
    userSavedCommuteAddressStore,
    authState.userId,
    payload && typeof payload === 'object' && 'addresses' in payload
      ? (payload as { addresses: unknown }).addresses
      : payload
  );

  return json(result, {
    status:
      result.outcome === 'saved'
        ? 200
        : result.outcome === 'invalid-saved-commute-addresses'
          ? 400
          : 500
  });
};
