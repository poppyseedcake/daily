import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth';
import { authStateFromSession } from '$lib/server/pageAuthState';
import type { PageServerLoad } from './$types';

export type AdminPanelAccess =
  | {
      mode: 'visitor-denied';
      message: string;
    }
  | {
      mode: 'user-denied';
      message: string;
    }
  | {
      mode: 'allowed';
    };

const administratorEmailAllowlist = () =>
  new Set(
    (env.ADMINISTRATOR_EMAIL_ALLOWLIST ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );

export const load: PageServerLoad = async ({ request }) => {
  const session = await auth.api.getSession({
    headers: request.headers
  });
  const authState = authStateFromSession(session);

  if (authState.mode !== 'user') {
    return {
      access: {
        mode: 'visitor-denied',
        message: 'Sign in with an authorized Google account to access the Admin Panel.'
      } satisfies AdminPanelAccess
    };
  }

  if (!administratorEmailAllowlist().has(authState.summaryRecipient.toLowerCase())) {
    return {
      access: {
        mode: 'user-denied',
        message: 'Your signed-in Google account is not authorized for the Admin Panel.'
      } satisfies AdminPanelAccess
    };
  }

  return {
    access: {
      mode: 'allowed'
    } satisfies AdminPanelAccess
  };
};
