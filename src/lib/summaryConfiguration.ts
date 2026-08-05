import { z } from 'zod';

export {
  dailySummaryAppearance,
  dailySummaryAppearanceSchema,
  resolveSummarySectionPresentationState,
  summarySectionPresentationSchema,
  summarySectionPresentationStateSchema,
  summarySectionPresentationStateSchemas,
  summarySectionPresentationStates
} from './summarySectionPresentation';
export type {
  DailySummaryAppearance,
  SummarySectionPresentation,
  SummarySectionPresentationSection,
  SummarySectionPresentationState,
  SummarySectionPresentationStateFor,
  UnpausedSummarySectionPresentationState,
  UnpausedSummarySectionPresentationStateFor
} from './summarySectionPresentation';

export const summaryTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const userTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((timeZone) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format();
      return true;
    } catch {
      return false;
    }
  }, 'User Time Zone must be a valid IANA time zone.');

export const summarySectionSchema = z.object({
  weather: z.boolean(),
  commute: z.boolean(),
  calendar: z.boolean(),
  todo: z.boolean()
});

export const summarySectionPauseSettingsSchema = z.object({
  weather: z.boolean().default(false),
  commute: z.boolean().default(false),
  calendar: z.boolean().default(false),
  todo: z.boolean().default(false)
});

export type SummarySectionPauseSettings = z.infer<typeof summarySectionPauseSettingsSchema>;

export const defaultSummarySectionPauseSettings = summarySectionPauseSettingsSchema.parse({});

export const summaryConfigurationSchema = z.object({
  summaryTime: summaryTimeSchema,
  userTimeZone: userTimeZoneSchema,
  summaryTheme: z.enum(['light', 'dark']),
  summaryDeliveryEnabled: z.boolean(),
  sections: summarySectionSchema,
  sectionPauses: summarySectionPauseSettingsSchema.default(defaultSummarySectionPauseSettings)
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
  },
  sectionPauses: defaultSummarySectionPauseSettings
});

export const canPreviewDailySummary = (configuration: SummaryConfiguration) =>
  configuration.summaryDeliveryEnabled;
