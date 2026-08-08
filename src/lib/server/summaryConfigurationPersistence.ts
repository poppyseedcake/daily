import type { Temporal } from '@js-temporal/polyfill';
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
    referenceInstant: Temporal.Instant
  ) => Promise<boolean>;
};

export type UserSummaryConfigurationSaveOutcome = 'saved' | 'invalid-configuration' | 'save-failed';

export type FlatSummaryConfiguration = {
  summaryTime: string;
  userTimeZone: string;
  summaryDeliveryEnabled: boolean;
  weatherSectionPaused: boolean;
  commuteSectionPaused: boolean;
  calendarSectionPaused: boolean;
  todoSectionPaused: boolean;
};

export const summaryConfigurationFromFlat = (
  configuration: FlatSummaryConfiguration
): SummaryConfiguration =>
  summaryConfigurationSchema.parse({
    summaryTime: configuration.summaryTime,
    userTimeZone: configuration.userTimeZone,
    summaryDeliveryEnabled: configuration.summaryDeliveryEnabled,
    sectionPauses: {
      weather: configuration.weatherSectionPaused,
      commute: configuration.commuteSectionPaused,
      calendar: configuration.calendarSectionPaused,
      todo: configuration.todoSectionPaused
    }
  });

export const loadUserSummaryConfiguration = async (
  store: Pick<UserSummaryConfigurationStore, 'load'>,
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
    if (!(await store.save(userId, result.data, referenceInstant))) {
      return { outcome: 'save-failed' };
    }
  } catch {
    return { outcome: 'save-failed' };
  }

  return { outcome: 'saved' };
};
