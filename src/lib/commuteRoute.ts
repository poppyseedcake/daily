import { z } from 'zod';

const readableLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !/[<>]/.test(value), 'Commute label contains unsafe characters.');

export const commutePointSchema = z.object({
  label: readableLabelSchema,
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180)
});
export const commuteRouteNameSchema = readableLabelSchema.max(80);
export const commuteRouteSchema = z.object({
  name: commuteRouteNameSchema,
  origin: commutePointSchema,
  destination: commutePointSchema
});
export type CommutePoint = z.infer<typeof commutePointSchema>;
export type CommuteRoute = z.infer<typeof commuteRouteSchema>;
