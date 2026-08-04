import { z } from 'zod';

export const dailySummaryAppearance = 'daily-grid' as const;
export const dailySummaryAppearanceSchema = z.literal(dailySummaryAppearance);
export type DailySummaryAppearance = z.infer<typeof dailySummaryAppearanceSchema>;

export const summarySectionPresentationStates = [
  'active',
  'paused',
  'unconfigured',
  'empty',
  'unavailable'
] as const;

export const summarySectionPresentationStateSchema = z.enum(
  summarySectionPresentationStates
);
export type SummarySectionPresentationState = z.infer<
  typeof summarySectionPresentationStateSchema
>;
export type UnpausedSummarySectionPresentationState = Exclude<
  SummarySectionPresentationState,
  'paused'
>;

export const summarySectionPresentationStateSchemas = {
  weather: z.enum(['active', 'paused', 'unconfigured', 'unavailable']),
  commute: z.enum(['active', 'paused', 'unconfigured', 'empty', 'unavailable']),
  calendar: z.enum(['active', 'paused', 'unconfigured', 'empty', 'unavailable']),
  todo: z.enum(['active', 'paused', 'empty', 'unavailable'])
} as const;

export const summarySectionPresentationSchema = z.object(
  summarySectionPresentationStateSchemas
);
export type SummarySectionPresentation = z.infer<
  typeof summarySectionPresentationSchema
>;
export type SummarySectionPresentationSection = keyof SummarySectionPresentation;

export const resolveSummarySectionPresentationState = (
  section: SummarySectionPresentationSection,
  paused: boolean,
  unpausedState: UnpausedSummarySectionPresentationState
): SummarySectionPresentationState => {
  if (paused) return 'paused';

  const candidate = unpausedState as SummarySectionPresentationState;

  if (candidate === 'paused') {
    throw new Error('Paused Summary Section state requires an explicit pause choice.');
  }

  const result = summarySectionPresentationStateSchemas[section].safeParse(candidate);

  if (!result.success) {
    throw new Error(`Invalid ${section} Summary Section presentation state.`);
  }

  return result.data;
};
