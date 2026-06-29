import { describe, expect, test } from 'vitest';
import { defaultSummaryConfiguration } from './summaryConfiguration';
import {
  createDefaultLocalSetup,
  loadLocalSetup,
  localSetupStorageKey,
  localSetupVersion,
  saveLocalSetup,
  type LocalSetup,
  type LocalSetupStorageAdapter
} from './localSetup';

const memoryStorage = (initialValue: string | null = null): LocalSetupStorageAdapter & { stored: string | null } => ({
  stored: initialValue,
  getItem(key) {
    expect(key).toBe(localSetupStorageKey);
    return this.stored;
  },
  setItem(key, value) {
    expect(key).toBe(localSetupStorageKey);
    this.stored = value;
  }
});

describe('Visitor Local Setup module', () => {
  test('loads a valid default Local Setup from empty storage', () => {
    const result = loadLocalSetup(memoryStorage());

    expect(localSetupVersion).toBe(1);
    expect(localSetupStorageKey).toBe('daily.visitorLocalSetup.v1');
    expect(result.outcome).toBe('empty');
    expect(result.setup).toEqual(createDefaultLocalSetup());
    expect(result.setup.summaryConfiguration).toEqual(defaultSummaryConfiguration);
    expect(result.setup.todoCategories).toEqual([]);
    expect(result.setup.todoTasks).toEqual([]);
    expect(result.setup.nextTodoId).toBe(1);
  });

  test('loads existing current-key Local Setup values that predate the explicit version field', () => {
    const storedSetup = {
      summaryConfiguration: {
        ...defaultSummaryConfiguration,
        summaryTime: '18:45',
        sections: { weather: true, commute: false, calendar: true, todo: true }
      },
      todoCategories: [{ id: 'category-1', name: 'Home', position: 1 }],
      demoCalendar: { label: 'Demo Calendar' },
      mockWeather: { label: 'Mock Weather' },
      mockCommute: { label: 'Mock Commute' },
      todoTasks: [
        {
          id: 'todo-1',
          title: 'Buy oats',
          categoryId: 'category-1',
          urgency: 'medium',
          position: 1
        }
      ],
      nextTodoId: 2
    };

    const result = loadLocalSetup(memoryStorage(JSON.stringify(storedSetup)));

    expect(result.outcome).toBe('loaded');
    expect(result.setup).toMatchObject({
      version: localSetupVersion,
      summaryConfiguration: storedSetup.summaryConfiguration,
      todoCategories: storedSetup.todoCategories,
      nextTodoId: storedSetup.nextTodoId
    });
    expect(result.setup).not.toHaveProperty('demoCalendar');
    expect(result.setup).not.toHaveProperty('mockWeather');
    expect(result.setup).not.toHaveProperty('mockCommute');
    expect(result.setup.todoTasks[0]?.completed).toBe(false);
  });

  test.each([
    ['invalid-json', '{'],
    ['schema-invalid', JSON.stringify({ version: localSetupVersion, summaryConfiguration: null })],
    ['schema-invalid', JSON.stringify({ ...createDefaultLocalSetup(), version: '2' })],
    [
      'unsupported-version',
      JSON.stringify({
        ...createDefaultLocalSetup(),
        version: localSetupVersion + 1
      })
    ]
  ] as const)('returns a valid fallback setup for %s storage', (outcome, storedValue) => {
    const result = loadLocalSetup(memoryStorage(storedValue));

    expect(result.outcome).toBe(outcome);
    expect(result.setup).toEqual(createDefaultLocalSetup());
  });

  test('returns a valid fallback setup when storage cannot be read', () => {
    const result = loadLocalSetup({
      getItem() {
        throw new Error('storage unavailable');
      },
      setItem() {
        throw new Error('unused');
      }
    });

    expect(result.outcome).toBe('read-failed');
    expect(result.setup).toEqual(createDefaultLocalSetup());
  });

  test('saves Local Setup without Demo Calendar or mock provider output', () => {
    const storage = memoryStorage();
    const setup: LocalSetup & {
      demoCalendar: { label: string };
      mockWeather: { label: string };
      mockCommute: { label: string };
    } = {
      ...createDefaultLocalSetup(),
      summaryConfiguration: {
        ...defaultSummaryConfiguration,
        sections: { weather: true, commute: true, calendar: true, todo: false }
      },
      todoTasks: [
        {
          id: 'todo-1',
          title: 'Persist actual Todo data',
          categoryId: null,
          urgency: 'high',
          position: 1
        }
      ],
      nextTodoId: 2,
      demoCalendar: { label: 'Demo Calendar' },
      mockWeather: { label: 'Mock Weather' },
      mockCommute: { label: 'Mock Commute' }
    };

    const result = saveLocalSetup(storage, setup);

    expect(result.outcome).toBe('saved');
    const storedSetup = JSON.parse(storage.stored ?? '');
    expect(storedSetup).not.toHaveProperty('demoCalendar');
    expect(storedSetup).not.toHaveProperty('mockWeather');
    expect(storedSetup).not.toHaveProperty('mockCommute');
    expect(storage.stored).not.toContain('Demo Calendar');
    expect(storage.stored).not.toContain('Mock Weather');
    expect(storage.stored).not.toContain('Mock Commute');
    expect(storedSetup).toEqual({
      version: setup.version,
      summaryConfiguration: setup.summaryConfiguration,
      todoCategories: setup.todoCategories,
      todoTasks: [{ ...setup.todoTasks[0], completed: false }],
      nextTodoId: setup.nextTodoId
    });
  });

  test('returns a failed outcome when storage cannot be written', () => {
    const result = saveLocalSetup(
      {
        getItem() {
          return null;
        },
        setItem() {
          throw new Error('quota exceeded');
        }
      },
      createDefaultLocalSetup()
    );

    expect(result.outcome).toBe('write-failed');
  });
});
