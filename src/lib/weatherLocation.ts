import { z } from 'zod';

const safeReadableLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((label) => !/[<>]/.test(label), 'Weather Location label contains unsafe characters.');

export const weatherLocationSchema = z.object({
  label: safeReadableLabelSchema,
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180)
});

export type WeatherLocation = z.infer<typeof weatherLocationSchema>;
