import { z } from 'zod';

const savedLocationLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((label) => !/[<>]/.test(label), 'Saved location label contains unsafe characters.');

const savedLocationSchema = z.object({
  label: savedLocationLabelSchema,
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180)
});

const savedLocationListSchema = (duplicateMessage: string) =>
  z
  .array(savedLocationSchema)
  .max(20)
  .refine(
    (locations) =>
      new Set(locations.map((location) => `${location.latitude}:${location.longitude}`)).size ===
      locations.length,
    duplicateMessage
  );

export const savedWeatherCitySchema = savedLocationSchema;
export const savedWeatherCitiesSchema = savedLocationListSchema('Saved Weather Cities must not repeat.');
export type SavedWeatherCity = z.infer<typeof savedWeatherCitySchema>;

export const savedCommuteAddressSchema = savedLocationSchema;
export const savedCommuteAddressesSchema = savedLocationListSchema(
  'Saved Commute Addresses must not repeat.'
);
export type SavedCommuteAddress = z.infer<typeof savedCommuteAddressSchema>;

export const sameSavedLocationCoordinates = (
  first: SavedWeatherCity | SavedCommuteAddress,
  second: SavedWeatherCity | SavedCommuteAddress
) =>
  first.latitude === second.latitude && first.longitude === second.longitude;
