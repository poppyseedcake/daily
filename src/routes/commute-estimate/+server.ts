import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { commutePointSchema } from '$lib/commuteRoute';
import { googleMapsOperations } from '$lib/server/googleMapsOperations';
import { z } from 'zod';

const requestSchema = z.object({ origin: commutePointSchema, destination: commutePointSchema });

export const POST = async ({ request, getClientAddress }) => {
  const payload = requestSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return json({ outcome: 'invalid-route' }, { status: 400 });

  const authState = authStateFromSession(await auth.api.getSession({ headers: request.headers }));
  try {
    const gateway = googleMapsOperations.requestGateway(
      authState,
      authState.mode === 'visitor'
        ? { clientAddress: getClientAddress(), userAgent: request.headers.get('user-agent') ?? '' }
        : undefined
    );
    return json(await gateway.estimateCommute(payload.data));
  } catch {
    return json({ outcome: 'unavailable', reason: 'usage-gate-unavailable' });
  }
};
