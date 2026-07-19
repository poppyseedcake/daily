import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { auth } from '$lib/server/auth';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { googleMapsOperations } from '$lib/server/googleMapsOperations';

const pointRequestSchema = z.object({
  placeId: z.string().trim().min(1).max(240).refine((value) => !/[<>]/.test(value)),
  sessionToken: z.string().regex(/^[A-Za-z0-9_-]{1,36}$/)
});

export const POST = async ({ request, getClientAddress }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ outcome: 'invalid-point' }, { status: 400 });
  }
  const pointRequest = pointRequestSchema.safeParse(payload);
  if (!pointRequest.success) return json({ outcome: 'invalid-point' }, { status: 400 });

  const authState = authStateFromSession(await auth.api.getSession({ headers: request.headers }));
  try {
    const gateway = googleMapsOperations.requestGateway(
      authState,
      authState.mode === 'visitor'
        ? { clientAddress: getClientAddress(), userAgent: request.headers.get('user-agent') ?? '' }
        : undefined
    );
    return json(await gateway.resolveAddress(pointRequest.data));
  } catch {
    return json({ outcome: 'unavailable', reason: 'usage-gate-unavailable' });
  }
};
