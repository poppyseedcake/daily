import { describe, expect, test } from 'vitest';
import {
  defaultSummaryConfiguration,
  type SummaryConfiguration
} from '$lib/summaryConfiguration';
import {
  loadUserSummaryConfiguration,
  saveUserSummaryConfiguration,
  type UserSummaryConfigurationStore
} from './summaryConfigurationPersistence';

const createStore = (): UserSummaryConfigurationStore & {
  saved: Map<string, SummaryConfiguration>;
} => {
  const saved = new Map<string, SummaryConfiguration>();

  return {
    saved,
    async load(userId) {
      return saved.get(userId) ?? null;
    },
    async save(userId, configuration) {
      saved.set(userId, configuration);
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
      summaryTheme: 'dark',
      summaryDeliveryEnabled: false,
      sections: {
        weather: false,
        commute: true,
        calendar: true,
        todo: false
      }
    };

    const result = await saveUserSummaryConfiguration(store, 'user-1', configuration);

    expect(result).toEqual({ outcome: 'saved' });
    await expect(loadUserSummaryConfiguration(store, 'user-1')).resolves.toEqual(configuration);
    await expect(loadUserSummaryConfiguration(store, 'user-2')).resolves.toEqual(
      defaultSummaryConfiguration
    );
  });

  test('rejects invalid Summary Configuration changes before writing', async () => {
    const store = createStore();

    const result = await saveUserSummaryConfiguration(store, 'user-1', {
      ...defaultSummaryConfiguration,
      summaryTime: '99:99'
    });

    expect(result).toEqual({ outcome: 'invalid-configuration' });
    await expect(loadUserSummaryConfiguration(store, 'user-1')).resolves.toEqual(
      defaultSummaryConfiguration
    );
  });
});
