import { auth } from '$lib/server/auth';
import { isAdministratorAuthState } from '$lib/server/adminAuthorization';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { googleMapsOperations } from '$lib/server/googleMapsOperations';
import { deliveryHealthOperations } from '$lib/server/deliveryHealthOperations';
import { technicalLogOperations } from '$lib/server/technicalLogOperations';
import {
  technicalEventCodes,
  technicalEventSeverities,
  technicalEventSubsystems
} from '$lib/server/technicalEventRecorder';
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
    severity: z.preprocess(optionalQueryValue, z.enum(technicalEventSeverities).optional()),
    subsystem: z.preprocess(optionalQueryValue, z.enum(technicalEventSubsystems).optional()),
    eventCode: z.preprocess(optionalQueryValue, z.enum(technicalEventCodes).optional()),
    cursor: z.preprocess(optionalQueryValue, z.string().min(1).max(1_000).optional())
  })
  .superRefine((filters, context) => {
    if (filters.from && filters.to && Date.parse(filters.from) > Date.parse(filters.to)) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'The end of the UTC range must not precede its start.'
      });
    }
  });

export const load: PageServerLoad = async ({ request, url }) => {
  await requireAdministrator(request);
  const filters = technicalLogFiltersSchema.safeParse({
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    severity: url.searchParams.get('severity'),
    subsystem: url.searchParams.get('subsystem'),
    eventCode: url.searchParams.get('eventCode'),
    cursor: url.searchParams.get('cursor')
  });

  if (!filters.success) {
    throw error(400, 'Choose valid Technical Log filters. Times must use UTC ISO 8601.');
  }

  const normalizedFilters = {
    ...filters.data,
    ...(filters.data.from ? { from: new Date(filters.data.from).toISOString() } : {}),
    ...(filters.data.to ? { to: new Date(filters.data.to).toISOString() } : {})
  };
  const { cursor, ...visibleFilters } = normalizedFilters;
  const [googleMaps, deliveryHealth, technicalLogs] = await Promise.all([
    googleMapsOperations.currentOperations(),
    deliveryHealthOperations.current(),
    technicalLogOperations.list({
      pageSize: 25,
      ...(normalizedFilters.from ? { fromUtc: normalizedFilters.from } : {}),
      ...(normalizedFilters.to ? { toUtc: normalizedFilters.to } : {}),
      ...(normalizedFilters.severity ? { severity: normalizedFilters.severity } : {}),
      ...(normalizedFilters.subsystem ? { subsystem: normalizedFilters.subsystem } : {}),
      ...(normalizedFilters.eventCode ? { eventCode: normalizedFilters.eventCode } : {}),
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
    technicalLogFilters: visibleFilters,
    technicalLogFilterOptions: {
      severities: technicalEventSeverities,
      subsystems: technicalEventSubsystems,
      eventCodes: technicalEventCodes
    }
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
