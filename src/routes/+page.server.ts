import { auth } from '$lib/server/auth';
import { authStateFromSession } from '$lib/server/pageAuthState';

export const load = async ({ request }) => {
  const session = await auth.api.getSession({
    headers: request.headers
  });

  return {
    authState: authStateFromSession(session)
  };
};
