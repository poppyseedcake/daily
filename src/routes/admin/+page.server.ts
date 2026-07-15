import { auth } from '$lib/server/auth';
import { isAdministratorAuthState } from '$lib/server/adminAuthorization';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { googleMapsOperations } from '$lib/server/googleMapsOperations';
import { deliveryHealthOperations } from '$lib/server/deliveryHealthOperations';
import { hasGoogleAuthAccount } from '$lib/server/adminGoogleSession';
import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

export type AdminPanelAccess = {
  mode: 'allowed';
};

const requireAdministrator = async (request: Request) => {
  const session = await auth.api.getSession({
    headers: request.headers
  });
  const authState = authStateFromSession(session);

  if (!session || authState.mode !== 'user') {
    throw error(403, 'Sign in with an authorized Google account to access the Admin Panel.');
  }

  if (!isAdministratorAuthState(authState)) {
    throw error(403, 'Your signed-in Google account is not authorized for the Admin Panel.');
  }

  if (!(await hasGoogleAuthAccount(session.user.id))) {
    throw error(403, 'Your current session is not backed by an authorized Google account.');
  }
};

const googleMapsKillSwitchSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

export const load: PageServerLoad = async ({ request }) => {
  await requireAdministrator(request);
  const [googleMaps, deliveryHealth] = await Promise.all([
    googleMapsOperations.currentOperations(),
    deliveryHealthOperations.current()
  ]);

  return {
    access: {
      mode: 'allowed'
    } satisfies AdminPanelAccess,
    googleMaps,
    deliveryHealth
  };
};

export const actions: Actions = {
  setGoogleMapsKillSwitch: async ({ request }) => {
    await requireAdministrator(request);
    const form = await request.formData();
    const enabled = googleMapsKillSwitchSchema.safeParse(form.get('enabled'));

    if (!enabled.success) {
      return fail(400, { success: false, message: 'Choose a valid Google Maps control state.' });
    }

    await googleMapsOperations.setAdminKillSwitch(enabled.data);
    return { success: true };
  }
};
