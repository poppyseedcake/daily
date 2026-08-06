import { z } from 'zod';

export const commuteTrafficLevels = ['light', 'moderate', 'heavy'] as const;
export type CommuteTrafficLevel = (typeof commuteTrafficLevels)[number];

export const commuteTrafficDescriptions: Record<CommuteTrafficLevel, string> = {
  light: 'Light traffic',
  moderate: 'Moderate traffic',
  heavy: 'Heavy traffic'
};

const commuteDurationPairSchema = z.object({
  durationMinutes: z.number().finite().nonnegative(),
  staticDurationMinutes: z.number().finite().nonnegative()
});

export const classifyCommuteTraffic = (value: unknown): CommuteTrafficLevel => {
  const { durationMinutes, staticDurationMinutes } = commuteDurationPairSchema.parse(value);

  if (staticDurationMinutes === 0) {
    return durationMinutes === 0 ? 'light' : 'heavy';
  }

  const relativeDelay = Math.max(durationMinutes - staticDurationMinutes, 0) / staticDurationMinutes;

  if (relativeDelay < 0.1) return 'light';
  if (relativeDelay < 0.25) return 'moderate';
  return 'heavy';
};

export const commuteTrafficDescription = (level: CommuteTrafficLevel) =>
  commuteTrafficDescriptions[level];
