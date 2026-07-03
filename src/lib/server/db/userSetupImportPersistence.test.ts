import { describe, expect, test } from 'vitest';
import type { UserSetupImportDraft } from '$lib/localSetup';
import {
  persistUserSetupImportDraftForNewUser,
  type UserSetupImportPersistenceStore
} from './userSetupImportPersistence';

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
  ]
});

const createStore = ({
  existingSetup = false,
  failAfter
}: {
  existingSetup?: boolean;
  failAfter?: 'summaryConfiguration' | 'todoCategories' | 'todoTasks';
} = {}): UserSetupImportPersistenceStore & {
  saved: {
    summaryConfigurations: UserSetupImportDraft['summaryConfiguration'][];
    todoCategories: UserSetupImportDraft['todoCategories'];
    todoTasks: UserSetupImportDraft['todoTasks'];
  };
} => {
  const saved = {
    summaryConfigurations: [] as UserSetupImportDraft['summaryConfiguration'][],
    todoCategories: [] as UserSetupImportDraft['todoCategories'],
    todoTasks: [] as UserSetupImportDraft['todoTasks']
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
        todoTasks: [...saved.todoTasks]
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
        }
      });

      saved.summaryConfigurations = staged.summaryConfigurations;
      saved.todoCategories = staged.todoCategories;
      saved.todoTasks = staged.todoTasks;

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
  });

  test('accepts every Summary Configuration supported user time zone', async () => {
    const store = createStore();
    const draft = validDraft();
    draft.summaryConfiguration.userTimeZone = 'America/New_York';

    const result = await persistUserSetupImportDraftForNewUser(store, 'user-1', draft);

    expect(result.outcome).toBe('imported');
    expect(store.saved.summaryConfigurations).toEqual([draft.summaryConfiguration]);
  });

  test('does not overwrite a returning User with existing saved setup', async () => {
    const store = createStore({ existingSetup: true });

    const result = await persistUserSetupImportDraftForNewUser(store, 'user-1', validDraft());

    expect(result.outcome).toBe('skipped-existing-setup');
    expect(store.saved.summaryConfigurations).toEqual([]);
    expect(store.saved.todoCategories).toEqual([]);
    expect(store.saved.todoTasks).toEqual([]);
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

  test('does not leave partial User setup when an import write fails', async () => {
    const store = createStore({ failAfter: 'todoCategories' });

    const result = await persistUserSetupImportDraftForNewUser(store, 'user-1', validDraft());

    expect(result.outcome).toBe('import-failed');
    expect(store.saved.summaryConfigurations).toEqual([]);
    expect(store.saved.todoCategories).toEqual([]);
    expect(store.saved.todoTasks).toEqual([]);
  });
});
