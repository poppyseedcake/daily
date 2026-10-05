import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { defaultSummaryConfiguration } from '$lib/summaryConfiguration';
import { loadUserSetup } from './userSetupLoading';

const savedTodo = {
  todoCategories: [],
  todoTasks: [{ id: 'todo-7', title: 'Saved task', categoryId: null, urgency: 'high' as const, position: 1, completed: false }]
};

const stores = () => ({
  summaryConfiguration: { load: async () => defaultSummaryConfiguration },
  todoState: { load: async () => savedTodo },
  weatherLocation: { load: async () => null },
  commuteSetup: { load: async () => null },
  savedWeatherCities: { load: async () => [] },
  savedCommuteAddresses: { load: async () => [] }
});

describe('User setup loading', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  test('a failed Todo read stays uneditable until saved state can be read again', async () => {
    let unavailable = true;
    const persistence = stores();
    persistence.todoState.load = async () => {
      if (unavailable) throw new Error('private storage failure');
      return savedTodo;
    };

    const failed = await loadUserSetup(persistence, 'user-1');
    expect(failed.userSetupEditing.todoState).toBe(false);
    expect(failed.userSetupEditing.summaryConfiguration).toBe(true);
    expect(failed.todoState.todoTasks).toEqual([]);

    unavailable = false;
    const recovered = await loadUserSetup(persistence, 'user-1');
    expect(recovered.userSetupEditing.todoState).toBe(true);
    expect(recovered.todoState.todoTasks).toEqual(savedTodo.todoTasks);
    expect(recovered.todoState.nextTodoId).toBe(8);
  });

  test('successful empty reads remain editable for a new User', async () => {
    const loaded = await loadUserSetup({
      ...stores(),
      summaryConfiguration: { load: async () => null },
      todoState: { load: async () => null }
    }, 'new-user');

    expect(loaded).toMatchObject({
      hasSavedSummaryConfiguration: false,
      summaryConfiguration: defaultSummaryConfiguration,
      todoState: { todoCategories: [], todoTasks: [], nextTodoId: 1 },
      weatherLocation: null,
      commuteSetup: { routes: [], days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
      savedWeatherCities: [],
      savedCommuteAddresses: [],
      userSetupEditing: {
        summaryConfiguration: true, todoState: true, weatherLocation: true,
        commuteSetup: true, savedWeatherCities: true, savedCommuteAddresses: true
      }
    });
  });

  test.each([
    ['summaryConfiguration', 'summary-configuration-unavailable'],
    ['todoState', 'todo-state-unavailable'],
    ['weatherLocation', 'weather-location-unavailable'],
    ['commuteSetup', 'commute-setup-unavailable'],
    ['savedWeatherCities', 'saved-weather-cities-unavailable'],
    ['savedCommuteAddresses', 'saved-commute-addresses-unavailable']
  ] as const)('a failed %s read blocks only that part and excludes private failure content', async (part, classification) => {
    const loaded = await loadUserSetup({
      ...stores(),
      [part]: { load: async () => { throw new Error('Private saved content'); } }
    }, 'user-1');

    expect(loaded.userSetupEditing).toEqual({
      summaryConfiguration: true, todoState: true, weatherLocation: true,
      commuteSetup: true, savedWeatherCities: true, savedCommuteAddresses: true,
      [part]: false
    });
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), { userId: 'user-1', classification });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('Private saved content');
    if (part === 'summaryConfiguration') {
      expect(loaded.summaryConfiguration).toBeNull();
      expect(loaded).not.toHaveProperty('hasSavedSummaryConfiguration');
    }
  });
});
