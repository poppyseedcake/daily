import { auth } from '$lib/server/auth';
import { isAdministratorAuthState } from '$lib/server/adminAuthorization';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export type AdminPanelAccess = {
  mode: 'allowed';
};

export const load: PageServerLoad = async ({ request }) => {
  const session = await auth.api.getSession({
    headers: request.headers
  });
  const authState = authStateFromSession(session);

  if (authState.mode !== 'user') {
    throw error(403, 'Sign in with an authorized Google account to access the Admin Panel.');
  }

  if (!isAdministratorAuthState(authState)) {
    throw error(403, 'Your signed-in Google account is not authorized for the Admin Panel.');
  }

  return {
    access: {
      mode: 'allowed'
    } satisfies AdminPanelAccess
  };
};
