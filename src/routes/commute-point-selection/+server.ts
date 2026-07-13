import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { createGoogleMapsUsageGate, readGoogleMapsUsageCaps } from '$lib/server/db/googleMapsUsageGate';
import { createGoogleMapsPersonAttribution } from '$lib/server/googleMapsPersonAttribution';
import { deterministicGoogleMapsProvider } from '$lib/server/googleMapsPointSelection';
import { createGoogleMapsRequestGateway } from '$lib/server/googleMapsRequestGateway';
import { googleMapsCapAlertDelivery } from '$lib/server/googleMapsCapAlertDelivery';
import { authStateFromSession } from '$lib/server/pageAuthState';

const pointRequestSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180)
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

  try {
    const authState = authStateFromSession(await auth.api.getSession({ headers: request.headers }));
    const gateway = createGoogleMapsRequestGateway({
      provider: deterministicGoogleMapsProvider,
      attribution: createGoogleMapsPersonAttribution({
        authState,
        secret: env.GOOGLE_MAPS_ATTRIBUTION_SECRET ?? '',
        visitorRequest:
          authState.mode === 'visitor'
            ? { clientAddress: getClientAddress(), userAgent: request.headers.get('user-agent') ?? '' }
            : undefined
      }),
      usageGate: createGoogleMapsUsageGate({
        database: db,
        capAlertDelivery: googleMapsCapAlertDelivery,
        ...readGoogleMapsUsageCaps({
          GOOGLE_MAPS_GLOBAL_DAILY_CAP: env.GOOGLE_MAPS_GLOBAL_DAILY_CAP,
          GOOGLE_MAPS_GLOBAL_MONTHLY_CAP: env.GOOGLE_MAPS_GLOBAL_MONTHLY_CAP,
          GOOGLE_MAPS_PER_PERSON_DAILY_LIMIT: env.GOOGLE_MAPS_PER_PERSON_DAILY_LIMIT
        })
      })
    });
    const result = await gateway.selectPoint(pointRequest.data);
    return json(result, { status: result.outcome === 'available' ? 200 : 503 });
  } catch {
    return json({ outcome: 'unavailable', reason: 'usage-gate-unavailable' }, { status: 503 });
  }
};
