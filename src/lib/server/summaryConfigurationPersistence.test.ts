import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, test } from 'vitest';
import { calculateNextSummaryAt } from '$lib/nextSummarySchedule';
import {
  defaultSummaryConfiguration,
  type SummaryConfiguration
} from '$lib/summaryConfiguration';
import {
  loadUserSummaryConfiguration,
  saveUserSummaryConfiguration,
  summaryConfigurationFromFlat,
  type UserSummaryConfigurationStore
} from './summaryConfigurationPersistence';

const createStore = (): UserSummaryConfigurationStore & {
  saved: Map<string, SummaryConfiguration>;
  schedules: Map<string, string | null>;
} => {
  const saved = new Map<string, SummaryConfiguration>();
  const schedules = new Map<string, string | null>();

  return {
    saved,
    schedules,
    async load(userId) {
      return saved.get(userId) ?? null;
    },
    async save(userId, configuration, referenceInstant) {
      const current = saved.get(userId);
      const schedulingChanged =
        current === undefined ||
        current.summaryTime !== configuration.summaryTime ||
        current.userTimeZone !== configuration.userTimeZone ||
        current.summaryDeliveryEnabled !== configuration.summaryDeliveryEnabled;
      saved.set(userId, configuration);
      if (schedulingChanged) {
        schedules.set(
          userId,
          calculateNextSummaryAt(configuration, referenceInstant)?.toString() ?? null
        );
      }
      return true;
    }
  };
};

describe('User Summary Configuration persistence', () => {
  test('loads defaults for a new signed-in User without saved setup', async () => {
    const store = createStore();

    const configuration = await loadUserSummaryConfiguration(store, 'user-1');

    expect(configuration).toEqual(defaultSummaryConfiguration);
  });

  test('saves valid Summary Configuration changes scoped to the current User', async () => {
    const store = createStore();
    const configuration: SummaryConfiguration = {
      summaryTime: '18:45',
      userTimeZone: 'America/New_York',
      summaryDeliveryEnabled: false,
      sectionPauses: {
        weather: true,
        commute: false,
        calendar: true,
        todo: false
      }
    };

    const result = await saveUserSummaryConfiguration(
      store,
      'user-1',
      configuration,
      Temporal.Instant.from('2026-06-22T16:00:00Z')
    );

    expect(result).toEqual({ outcome: 'saved' });
    await expect(loadUserSummaryConfiguration(store, 'user-1')).resolves.toEqual(configuration);
    await expect(loadUserSummaryConfiguration(store, 'user-2')).resolves.toEqual(
      defaultSummaryConfiguration
    );
    expect(store.schedules.get('user-1')).toBeNull();
  });

  test('loads canonical pause settings from flat persistence', () => {
    expect(
      summaryConfigurationFromFlat({
        summaryTime: '07:00',
        userTimeZone: 'UTC',
        summaryDeliveryEnabled: true,
        weatherSectionPaused: false,
        commuteSectionPaused: false,
        calendarSectionPaused: false,
        todoSectionPaused: false
      })
    ).toEqual(defaultSummaryConfiguration);
  });

  test('round-trips explicit pause settings through the flat persistence boundary', () => {
    const configuration = {
      ...defaultSummaryConfiguration,
      sectionPauses: {
        weather: true,
        commute: false,
        calendar: true,
        todo: false
      }
    };

    expect(
      summaryConfigurationFromFlat({
        summaryTime: configuration.summaryTime,
        userTimeZone: configuration.userTimeZone,
        summaryDeliveryEnabled: configuration.summaryDeliveryEnabled,
        weatherSectionPaused: configuration.sectionPauses.weather,
        commuteSectionPaused: configuration.sectionPauses.commute,
        calendarSectionPaused: configuration.sectionPauses.calendar,
        todoSectionPaused: configuration.sectionPauses.todo
      })
    ).toEqual(configuration);
  });

  test('rejects invalid Summary Configuration changes before writing', async () => {
    const store = createStore();

    const result = await saveUserSummaryConfiguration(
      store,
      'user-1',
      {
        ...defaultSummaryConfiguration,
        summaryTime: '99:99'
      },
      Temporal.Instant.from('2026-06-22T00:00:00Z')
    );

    expect(result).toEqual({ outcome: 'invalid-configuration' });
    await expect(loadUserSummaryConfiguration(store, 'user-1')).resolves.toEqual(
      defaultSummaryConfiguration
    );
  });

  test('saves configuration and its freshly calculated schedule together', async () => {
    const store = createStore();

    await saveUserSummaryConfiguration(
      store,
      'user-1',
      { ...defaultSummaryConfiguration, summaryTime: '07:00', userTimeZone: 'Europe/Warsaw' },
      Temporal.Instant.from('2026-06-22T05:00:00Z')
    );

    expect(store.schedules.get('user-1')).toBe('2026-06-23T05:00:00Z');
  });

  test('keeps the next occurrence unchanged when only a section pause changes', async () => {
    const store = createStore();
    store.saved.set('user-1', defaultSummaryConfiguration);
    store.schedules.set('user-1', '2026-06-23T05:00:00Z');

    await saveUserSummaryConfiguration(
      store,
      'user-1',
      {
        ...defaultSummaryConfiguration,
        sectionPauses: { ...defaultSummaryConfiguration.sectionPauses, weather: true }
      },
      Temporal.Instant.from('2026-06-22T06:00:00Z')
    );

    expect(store.schedules.get('user-1')).toBe('2026-06-23T05:00:00Z');
  });
});
