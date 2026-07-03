import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export type AdminPanelAccess = {
  mode: 'allowed';
};

const administratorEmailAllowlist = (() => {
  let cache: Set<string> | null = null;

  return () => {
    cache ??= new Set(
      (env.ADMINISTRATOR_EMAIL_ALLOWLIST ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    );

    return cache;
  };
})();

export const load: PageServerLoad = async ({ request }) => {
  const session = await auth.api.getSession({
    headers: request.headers
  });
  const authState = authStateFromSession(session);

  if (authState.mode !== 'user') {
    throw error(403, 'Sign in with an authorized Google account to access the Admin Panel.');
  }

  if (!administratorEmailAllowlist().has(authState.summaryRecipient.toLowerCase())) {
    throw error(403, 'Your signed-in Google account is not authorized for the Admin Panel.');
  }

  return {
    access: {
      mode: 'allowed'
    } satisfies AdminPanelAccess
  };
};
