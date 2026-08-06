import { z } from 'zod';

const finiteNumber = z.number().refine(Number.isFinite);

const localTime = z.string()
  .regex(/^\d{2}:\d{2}$/)
  .refine((value) => {
    const [hour, minute] = value.split(':').map(Number);
    return hour < 24 && minute < 60;
  });

const normalizedWeatherHourSchema = z.object({
  localTime,
  temperature: finiteNumber,
  precipitationProbability: finiteNumber,
  precipitation: finiteNumber,
  snowfall: finiteNumber,
  weatherCode: finiteNumber,
  windSpeed: finiteNumber,
  windGust: finiteNumber
}).strict();

export const normalizedWeatherSummaryInputSchema = z.object({
  units: z.object({
    temperature: z.literal('celsius'),
    precipitationProbability: z.literal('percent'),
    precipitation: z.literal('millimetres'),
    snowfall: z.literal('centimetres'),
    wind: z.literal('kilometres_per_hour')
  }).strict(),
  current: z.object({
    temperature: finiteNumber
  }).strict(),
  day: z.object({
    weatherCode: finiteNumber,
    minimumTemperature: finiteNumber,
    maximumTemperature: finiteNumber,
    maximumPrecipitationProbability: finiteNumber,
    maximumWindSpeed: finiteNumber,
    maximumWindGust: finiteNumber
  }).strict(),
  remainingHours: z.array(normalizedWeatherHourSchema).min(1)
}).strict();

export type NormalizedWeatherSummaryInput = z.infer<typeof normalizedWeatherSummaryInputSchema>;
