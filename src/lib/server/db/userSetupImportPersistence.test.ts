import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, test } from 'vitest';
import type { UserSetupImportDraft } from '$lib/localSetup';
import {
  persistUserSetupImportDraftForNewUser as persistUserSetupImportDraftForNewUserWithClock,
  type UserSetupImportPersistenceStore
} from './userSetupImportPersistence';

const referenceInstant = Temporal.Instant.from('2026-06-22T00:00:00Z');
const persistUserSetupImportDraftForNewUser = (
  store: UserSetupImportPersistenceStore,
  userId: string,
  draft: UserSetupImportDraft
) => persistUserSetupImportDraftForNewUserWithClock(store, userId, draft, referenceInstant);

const validDraft = (): UserSetupImportDraft => ({
  summaryConfiguration: {
    id: 'summary-1',
    userId: 'user-1',
    summaryTime: '18:45',
    userTimeZone: 'Europe/Warsaw',
    summaryTheme: 'dark',
    summaryDeliveryEnabled: true,
    weatherSectionEnabled: false,
    commuteSectionEnabled: true,
    calendarSectionEnabled: true,
    todoSectionEnabled: true
  },
  todoCategories: [
    { id: 'category-home', userId: 'user-1', name: 'Home', position: 1 },
    { id: 'category-work', userId: 'user-1', name: 'Work', position: 2 }
  ],
  todoTasks: [
    {
      id: 'todo-1',
      userId: 'user-1',
      categoryId: 'category-home',
      title: 'Water plants',
      urgency: 'low',
      position: 1,
      completed: false
    },
    {
      id: 'todo-2',
      userId: 'user-1',
      categoryId: null,
      title: 'Draft update',
      urgency: 'high',
      position: 1,
      completed: true
    }
  ],
  weatherLocation: {
    id: 'weather-location-1',
    userId: 'user-1',
    label: 'Warsaw, Poland',
    latitude: 52.2297,
    longitude: 21.0122
  },
  commuteRoutes: [
    {
      id: 'commute-route-1',
      userId: 'user-1',
      name: 'Morning commute',
      originLabel: 'Home',
      originLatitude: 52.2297,
      originLongitude: 21.0122,
      destinationLabel: 'Office',
      destinationLatitude: 52.2318,
      destinationLongitude: 21.0067,
      enabled: false,
      position: 1
    }
  ],
  commuteDays: ['monday', 'wednesday', 'sunday']
});

const createStore = ({
  existingSetup = false,
  existingCommuteSetup = false,
  failAfter
}: {
  existingSetup?: boolean;
  existingCommuteSetup?: boolean;
  failAfter?: 'summaryConfiguration' | 'todoCategories' | 'todoTasks' | 'commuteRoutes';
} = {}): UserSetupImportPersistenceStore & {
  saved: {
    summaryConfigurations: UserSetupImportDraft['summaryConfiguration'][];
    todoCategories: UserSetupImportDraft['todoCategories'];
    todoTasks: UserSetupImportDraft['todoTasks'];
    weatherLocations: NonNullable<UserSetupImportDraft['weatherLocation']>[];
    commuteRoutes: UserSetupImportDraft['commuteRoutes'];
    commuteDays: UserSetupImportDraft['commuteDays'];
  };
} => {
  const saved = {
    summaryConfigurations: [] as UserSetupImportDraft['summaryConfiguration'][],
    todoCategories: [] as UserSetupImportDraft['todoCategories'],
    todoTasks: [] as UserSetupImportDraft['todoTasks'],
    weatherLocations: [] as NonNullable<UserSetupImportDraft['weatherLocation']>[],
    commuteRoutes: [] as UserSetupImportDraft['commuteRoutes'],
    commuteDays: [] as UserSetupImportDraft['commuteDays']
  };

  return {
    saved,
    async hasExistingUserSetup() {
      return existingSetup;
    },
    async transaction(work) {
      const staged = {
        summaryConfigurations: [...saved.summaryConfigurations],
        todoCategories: [...saved.todoCategories],
        todoTasks: [...saved.todoTasks],
        weatherLocations: [...saved.weatherLocations],
        commuteRoutes: [...saved.commuteRoutes],
        commuteDays: [...saved.commuteDays]
      };

      const failIfNeeded = (step: typeof failAfter) => {
        if (failAfter === step) {
          throw new Error(`failed after ${step}`);
        }
      };

      const result = work({
        hasExistingUserSetup() {
          return existingSetup;
        },
        hasExistingCommuteSetup() {
          return existingCommuteSetup;
        },
        saveSummaryConfiguration(summaryConfiguration) {
          staged.summaryConfigurations.push(summaryConfiguration);
          failIfNeeded('summaryConfiguration');
        },
        saveTodoCategories(todoCategories) {
          staged.todoCategories.push(...todoCategories);
          failIfNeeded('todoCategories');
        },
        saveTodoTasks(todoTasks) {
          staged.todoTasks.push(...todoTasks);
          failIfNeeded('todoTasks');
        },
        saveWeatherLocation(weatherLocation) {
          if (weatherLocation) {
            staged.weatherLocations.push(weatherLocation);
          }
        },
        saveCommuteRoutes(routes) {
          staged.commuteRoutes.push(...routes);
          failIfNeeded('commuteRoutes');
        },
        saveCommuteDays(_userId, days) {
          staged.commuteDays.push(...days);
        }
      });

      saved.summaryConfigurations = staged.summaryConfigurations;
      saved.todoCategories = staged.todoCategories;
      saved.todoTasks = staged.todoTasks;
      saved.weatherLocations = staged.weatherLocations;
      saved.commuteRoutes = staged.commuteRoutes;
      saved.commuteDays = staged.commuteDays;

      return result;
    }
  };
};

describe('User Setup import persistence', () => {
  test('saves a validated Local Setup import draft for a User with no existing saved setup', async () => {
    const store = createStore();
    const draft = validDraft();

    const result = await persistUserSetupImportDraftForNewUser(store, 'user-1', draft);

    expect(result.outcome).toBe('imported');
    expect(store.saved.summaryConfigurations).toEqual([draft.summaryConfiguration]);
    expect(store.saved.todoCategories).toEqual(draft.todoCategories);
    expect(store.saved.todoTasks).toEqual(draft.todoTasks);
    expect(store.saved.weatherLocations).toEqual([draft.weatherLocation]);
    expect(store.saved.commuteRoutes).toEqual(draft.commuteRoutes);
    expect(store.saved.commuteDays).toEqual(draft.commuteDays);
  });

  test('accepts every Summary Configuration supported user time zone', async () => {
    const store = createStore();
    const draft = validDraft();
    draft.summaryConfiguration.userTimeZone = 'America/New_York';

    const result = await persistUserSetupImportDraftForNewUser(store, 'user-1', draft);

    expect(result.outcome).toBe('imported');
    expect(store.saved.summaryConfigurations).toEqual([draft.summaryConfiguration]);
  });

  test('accepts a Local Setup import draft with flat persisted commute route fields', async () => {
    const store = createStore();
    const draft = validDraft();
    draft.commuteRoutes = [
      {
        id: 'commute-route-1',
        userId: 'user-1',
        name: 'Morning commute',
        originLabel: 'Home',
        originLatitude: 52.2297,
        originLongitude: 21.0122,
        destinationLabel: 'Office',
        destinationLatitude: 52.2318,
        destinationLongitude: 21.0067,
        enabled: true,
        position: 1
      }
    ];

    const result = await persistUserSetupImportDraftForNewUser(store, 'user-1', draft);

    expect(result.outcome).toBe('imported');
    expect(store.saved.commuteRoutes).toEqual(draft.commuteRoutes);
  });

  test('does not overwrite a returning User with existing saved setup', async () => {
    const store = createStore({ existingSetup: true });

    const result = await persistUserSetupImportDraftForNewUser(store, 'user-1', validDraft());

    expect(result.outcome).toBe('skipped-existing-setup');
    expect(store.saved.summaryConfigurations).toEqual([]);
    expect(store.saved.todoCategories).toEqual([]);
    expect(store.saved.todoTasks).toEqual([]);
    expect(store.saved.weatherLocations).toEqual([]);
  });

  test('rejects invalid Summary Configuration clock ranges before writing', async () => {
    const store = createStore();
    const draft = validDraft();
    draft.summaryConfiguration.summaryTime = '99:99';

    const result = await persistUserSetupImportDraftForNewUser(store, 'user-1', draft);

    expect(result.outcome).toBe('invalid-draft');
    expect(store.saved.summaryConfigurations).toEqual([]);
    expect(store.saved.todoCategories).toEqual([]);
    expect(store.saved.todoTasks).toEqual([]);
  });

  test('rejects an invalid Local Setup import draft before writing', async () => {
    const store = createStore();
    const draft = validDraft();
    draft.todoTasks[0] = {
      ...draft.todoTasks[0],
      userId: 'other-user',
      categoryId: 'missing-category'
    };

    const result = await persistUserSetupImportDraftForNewUser(store, 'user-1', draft);

    expect(result.outcome).toBe('invalid-draft');
    expect(store.saved.summaryConfigurations).toEqual([]);
    expect(store.saved.todoCategories).toEqual([]);
    expect(store.saved.todoTasks).toEqual([]);
  });

  test('rejects malformed Commute data and the sixth route before writing any User setup', async () => {
    const malformedStore = createStore();
    const malformedDraft = validDraft();
    malformedDraft.commuteRoutes[0]!.originLatitude = 91;

    await expect(
      persistUserSetupImportDraftForNewUser(malformedStore, 'user-1', malformedDraft)
    ).resolves.toEqual({ outcome: 'invalid-draft' });
    expect(malformedStore.saved.summaryConfigurations).toEqual([]);
    expect(malformedStore.saved.commuteRoutes).toEqual([]);
    expect(malformedStore.saved.commuteDays).toEqual([]);

    const overLimitStore = createStore();
    const overLimitDraft = validDraft();
    overLimitDraft.commuteRoutes = Array.from({ length: 6 }, (_, index) => ({
      ...overLimitDraft.commuteRoutes[0]!,
      id: `commute-route-${index + 1}`,
      position: index + 1
    }));

    await expect(
      persistUserSetupImportDraftForNewUser(overLimitStore, 'user-1', overLimitDraft)
    ).resolves.toEqual({ outcome: 'invalid-draft' });
    expect(overLimitStore.saved.summaryConfigurations).toEqual([]);
    expect(overLimitStore.saved.commuteRoutes).toEqual([]);
  });

  test('does not leave partial User setup when an import write fails', async () => {
    const store = createStore({ failAfter: 'commuteRoutes' });

    const result = await persistUserSetupImportDraftForNewUser(store, 'user-1', validDraft());

    expect(result.outcome).toBe('import-failed');
    expect(store.saved.summaryConfigurations).toEqual([]);
    expect(store.saved.todoCategories).toEqual([]);
    expect(store.saved.todoTasks).toEqual([]);
    expect(store.saved.weatherLocations).toEqual([]);
    expect(store.saved.commuteRoutes).toEqual([]);
    expect(store.saved.commuteDays).toEqual([]);
  });
});
