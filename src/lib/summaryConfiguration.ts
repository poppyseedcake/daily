import { z } from 'zod';

export const summaryTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const userTimeZoneSchema = z.enum(['Europe/Warsaw', 'America/New_York', 'UTC']);

export const summarySectionSchema = z.object({
  weather: z.boolean(),
  commute: z.boolean(),
  calendar: z.boolean(),
  todo: z.boolean()
});

export const summaryConfigurationSchema = z.object({
  summaryTime: summaryTimeSchema,
  userTimeZone: userTimeZoneSchema,
  summaryTheme: z.enum(['light', 'dark']),
  summaryDeliveryEnabled: z.boolean(),
  sections: summarySectionSchema
});

export type SummaryConfiguration = z.infer<typeof summaryConfigurationSchema>;
export type SummaryTheme = SummaryConfiguration['summaryTheme'];
export type SummarySection = keyof SummaryConfiguration['sections'];
export type UserTimeZone = SummaryConfiguration['userTimeZone'];

export const defaultSummaryConfiguration = summaryConfigurationSchema.parse({
  summaryTime: '07:00',
  userTimeZone: 'UTC',
  summaryTheme: 'light',
  summaryDeliveryEnabled: true,
  sections: {
    weather: true,
    commute: true,
    calendar: true,
    todo: true
  }
});
