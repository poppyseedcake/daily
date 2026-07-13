import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { selectLocalPoint } from '$lib/server/localPointSelection';

const pointRequestSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180)
});

export const POST = async ({ request }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ outcome: 'invalid-point' }, { status: 400 });
  }
  const pointRequest = pointRequestSchema.safeParse(payload);
  if (!pointRequest.success) return json({ outcome: 'invalid-point' }, { status: 400 });

  return json({ outcome: 'available', point: selectLocalPoint(pointRequest.data) });
};
