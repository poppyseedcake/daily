import { auth } from '$lib/server/auth';
import { isAdministratorAuthState } from '$lib/server/adminAuthorization';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { googleMapsOperations } from '$lib/server/googleMapsOperations';
import { deliveryHealthOperations } from '$lib/server/deliveryHealthOperations';
import { technicalLogOperations } from '$lib/server/technicalLogOperations';
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

const optionalQueryValue = (value: unknown) => (value === '' || value === null ? undefined : value);
const technicalLogFiltersSchema = z
  .object({
    from: z.preprocess(optionalQueryValue, z.iso.datetime().optional()),
    to: z.preprocess(optionalQueryValue, z.iso.datetime().optional()),
    severity: z.preprocess(optionalQueryValue, z.enum(['info', 'warning', 'error']).optional()),
    subsystem: z.preprocess(
      optionalQueryValue,
      z.enum(['scheduled-delivery', 'admin-controls']).optional()
    ),
    eventCode: z.preprocess(
      optionalQueryValue,
      z
        .enum([
          'scheduled-daily-summary-worker-completed',
          'scheduled-daily-summary-worker-failed',
          'admin-google-maps-kill-switch-changed'
        ])
        .optional()
    ),
    cursor: z.preprocess(optionalQueryValue, z.string().min(1).max(1_000).optional())
  })
  .superRefine((filters, context) => {
    if (filters.from && filters.to && filters.from > filters.to) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'The end of the UTC range must not precede its start.'
      });
    }
  });

export const load: PageServerLoad = async ({ request }) => {
  await requireAdministrator(request);
  const requestUrl = new URL(request.url);
  const filters = technicalLogFiltersSchema.safeParse({
    from: requestUrl.searchParams.get('from'),
    to: requestUrl.searchParams.get('to'),
    severity: requestUrl.searchParams.get('severity'),
    subsystem: requestUrl.searchParams.get('subsystem'),
    eventCode: requestUrl.searchParams.get('eventCode'),
    cursor: requestUrl.searchParams.get('cursor')
  });

  if (!filters.success) {
    throw error(400, 'Choose valid Technical Log filters. Times must use UTC ISO 8601.');
  }

  const { cursor, ...visibleFilters } = filters.data;
  const [googleMaps, deliveryHealth, technicalLogs] = await Promise.all([
    googleMapsOperations.currentOperations(),
    deliveryHealthOperations.current(),
    technicalLogOperations.list({
      pageSize: 25,
      ...(filters.data.from ? { fromUtc: filters.data.from } : {}),
      ...(filters.data.to ? { toUtc: filters.data.to } : {}),
      ...(filters.data.severity ? { severity: filters.data.severity } : {}),
      ...(filters.data.subsystem ? { subsystem: filters.data.subsystem } : {}),
      ...(filters.data.eventCode ? { eventCode: filters.data.eventCode } : {}),
      ...(cursor ? { cursor } : {})
    })
  ]);

  return {
    access: {
      mode: 'allowed'
    } satisfies AdminPanelAccess,
    googleMaps,
    deliveryHealth,
    technicalLogs,
    technicalLogFilters: visibleFilters
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
