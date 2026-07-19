import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { auth } from '$lib/server/auth';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { googleMapsOperations } from '$lib/server/googleMapsOperations';

const querySchema = z.object({
  query: z.string().trim().min(3).max(120).refine((value) => !/[<>]/.test(value)),
  sessionToken: z.string().regex(/^[A-Za-z0-9_-]{1,36}$/)
});

export const GET = async ({ request, getClientAddress }) => {
  const url = new URL(request.url);
  const input = querySchema.safeParse({
    query: url.searchParams.get('q') ?? '',
    sessionToken: url.searchParams.get('sessionToken') ?? ''
  });
  if (!input.success) return json({ outcome: 'invalid-query' }, { status: 400 });

  const authState = authStateFromSession(await auth.api.getSession({ headers: request.headers }));
  try {
    const gateway = googleMapsOperations.requestGateway(
      authState,
      authState.mode === 'visitor'
        ? { clientAddress: getClientAddress(), userAgent: request.headers.get('user-agent') ?? '' }
        : undefined
    );
    return json(await gateway.searchAddresses(input.data));
  } catch {
    return json({ outcome: 'unavailable', reason: 'usage-gate-unavailable' });
  }
};
