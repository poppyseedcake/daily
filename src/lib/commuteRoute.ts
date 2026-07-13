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
export const commuteRouteDraftSchema = z.object({
  name: commuteRouteNameSchema,
  origin: commutePointSchema,
  destination: commutePointSchema
});
export const commuteRouteSchema = commuteRouteDraftSchema.extend({
  id: z.string().trim().min(1).max(80),
  enabled: z.boolean()
});
export const commuteRoutesSchema = z.array(commuteRouteSchema).max(5);

export const commuteDayValues = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
] as const;
export const commuteDaysSchema = z
  .array(z.enum(commuteDayValues))
  .max(commuteDayValues.length)
  .refine((days) => new Set(days).size === days.length, 'Commute Days must not repeat.');
export const defaultCommuteDays = commuteDayValues.slice(0, 5);

export type CommutePoint = z.infer<typeof commutePointSchema>;
export type CommuteRoute = z.infer<typeof commuteRouteSchema>;
export type CommuteDay = z.infer<typeof commuteDaysSchema>[number];
