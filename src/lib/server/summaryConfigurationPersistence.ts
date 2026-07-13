import type { Temporal } from '@js-temporal/polyfill';
import { calculateNextSummaryAt } from '$lib/nextSummarySchedule';
import {
  defaultSummaryConfiguration,
  summaryConfigurationSchema,
  type SummaryConfiguration
} from '$lib/summaryConfiguration';

export type UserSummaryConfigurationStore = {
  load: (userId: string) => Promise<SummaryConfiguration | null>;
  save: (
    userId: string,
    configuration: SummaryConfiguration,
    nextSummaryAt: string | null
  ) => Promise<void>;
};

export type UserSummaryConfigurationSaveOutcome = 'saved' | 'invalid-configuration' | 'save-failed';

export type FlatSummaryConfiguration = {
  summaryTime: string;
  userTimeZone: string;
  summaryTheme: string;
  summaryDeliveryEnabled: boolean;
  weatherSectionEnabled: boolean;
  commuteSectionEnabled: boolean;
  calendarSectionEnabled: boolean;
  todoSectionEnabled: boolean;
};

export const summaryConfigurationFromFlat = (
  configuration: FlatSummaryConfiguration
): SummaryConfiguration =>
  summaryConfigurationSchema.parse({
    summaryTime: configuration.summaryTime,
    userTimeZone: configuration.userTimeZone,
    summaryTheme: configuration.summaryTheme,
    summaryDeliveryEnabled: configuration.summaryDeliveryEnabled,
    sections: {
      weather: configuration.weatherSectionEnabled,
      commute: configuration.commuteSectionEnabled,
      calendar: configuration.calendarSectionEnabled,
      todo: configuration.todoSectionEnabled
    }
  });

export const loadUserSummaryConfiguration = async (
  store: UserSummaryConfigurationStore,
  userId: string
): Promise<SummaryConfiguration> => {
  const savedConfiguration = await store.load(userId);

  return savedConfiguration ?? defaultSummaryConfiguration;
};

export const saveUserSummaryConfiguration = async (
  store: UserSummaryConfigurationStore,
  userId: string,
  configuration: unknown,
  referenceInstant: Temporal.Instant
): Promise<{ outcome: UserSummaryConfigurationSaveOutcome }> => {
  const result = summaryConfigurationSchema.safeParse(configuration);

  if (!result.success) {
    return { outcome: 'invalid-configuration' };
  }

  try {
    const nextSummaryAt = calculateNextSummaryAt(result.data, referenceInstant)?.toString() ?? null;
    await store.save(userId, result.data, nextSummaryAt);
  } catch {
    return { outcome: 'save-failed' };
  }

  return { outcome: 'saved' };
};
