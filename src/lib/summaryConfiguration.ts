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

export const summarySectionPauseSettingsSchema = z.object({
  weather: z.boolean().default(false),
  commute: z.boolean().default(false),
  calendar: z.boolean().default(false),
  todo: z.boolean().default(false)
}).strict();

export type SummarySectionPauseSettings = z.infer<typeof summarySectionPauseSettingsSchema>;

export const defaultSummarySectionPauseSettings = summarySectionPauseSettingsSchema.parse({});

export const summaryConfigurationSchema = z.object({
  summaryTime: summaryTimeSchema,
  userTimeZone: userTimeZoneSchema,
  summaryDeliveryEnabled: z.boolean(),
  sectionPauses: summarySectionPauseSettingsSchema.default(defaultSummarySectionPauseSettings)
}).strict();

export type SummaryConfiguration = z.infer<typeof summaryConfigurationSchema>;
export type SummarySection = keyof SummaryConfiguration['sectionPauses'];
export type UserTimeZone = SummaryConfiguration['userTimeZone'];

export const defaultSummaryConfiguration = summaryConfigurationSchema.parse({
  summaryTime: '07:00',
  userTimeZone: 'UTC',
  summaryDeliveryEnabled: true,
  sectionPauses: defaultSummarySectionPauseSettings
});

export const canPreviewDailySummary = (_configuration: SummaryConfiguration) => true;
