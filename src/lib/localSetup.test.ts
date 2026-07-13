import { describe, expect, test } from 'vitest';
import { defaultSummaryConfiguration } from './summaryConfiguration';
import {
  addTodoCategory,
  addTodoTask,
  completeTodoTask,
  deleteTodoCategory,
  reorderTodoTasks,
  tasksForTodoCategory,
  updateTodoCategory
} from './todo';
import {
  createDefaultLocalSetup,
  createUserSetupImportDraftFromLocalSetup,
  loadLocalSetup,
  localSetupStorageKey,
  localSetupVersion,
  saveLocalSetup,
  type LocalSetupLoadOutcome,
  type LocalSetupInput,
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
      weatherLocation: {
        label: 'Warsaw, Poland',
        latitude: 52.2297,
        longitude: 21.0122
      },
      commuteRoutes: [
        {
          id: 'visitor-route-1',
          name: 'Morning commute',
          origin: { label: 'Home', latitude: 52.2297, longitude: 21.0122 },
          destination: { label: 'Office', latitude: 52.2318, longitude: 21.0067 },
          enabled: false
        }
      ],
      commuteDays: ['monday', 'wednesday', 'sunday'],
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
    [
      'schema-invalid',
      JSON.stringify({
        ...createDefaultLocalSetup(),
        commuteDays: ['monday', 'monday']
      })
    ],
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
    const setup: LocalSetupInput & {
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
      weatherLocation: null,
      commuteRoutes: [],
      commuteDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      todoCategories: setup.todoCategories,
      todoTasks: [{ ...setup.todoTasks[0], completed: false }],
      nextTodoId: setup.nextTodoId
    });
  });

  test('round-trips Summary Configuration and Todo Module output through browser storage', () => {
    const storage = memoryStorage();
    let nextNumericId = 1;
    const nextId = (prefix: string) => `${prefix}-${nextNumericId++}`;
    const homeCategories = addTodoCategory({
      categories: [],
      input: { name: 'Home' },
      nextId: () => nextId('category')
    });
    const categories = updateTodoCategory(
      addTodoCategory({
        categories: homeCategories,
        input: { name: 'Work' },
        nextId: () => nextId('category')
      }),
      { id: 'category-1', name: 'Apartment' }
    );
    const tasks = reorderTodoTasks(
      completeTodoTask(
        addTodoTask({
          tasks: addTodoTask({
            tasks: addTodoTask({
              tasks: addTodoTask({
                tasks: [],
                input: { title: 'Buy coffee', categoryId: null, urgency: 'medium' },
                nextId: () => nextId('todo')
              }),
              input: { title: 'Write launch note', categoryId: 'category-2', urgency: 'low' },
              nextId: () => nextId('todo')
            }),
            input: { title: 'Water plants', categoryId: 'category-1', urgency: 'low' },
            nextId: () => nextId('todo')
          }),
          input: { title: 'Review deploy checklist', categoryId: 'category-2', urgency: 'high' },
          nextId: () => nextId('todo')
        }),
        'todo-6'
      ),
      { categoryId: 'category-1', orderedTaskIds: ['todo-5', 'todo-3'] }
    );
    const todoStateAfterDeletion = deleteTodoCategory({
      categories,
      tasks,
      categoryId: 'category-2'
    });

    const setup: LocalSetupInput = {
      ...createDefaultLocalSetup(),
      summaryConfiguration: {
        ...defaultSummaryConfiguration,
        summaryTime: '18:45',
        sections: { weather: true, commute: true, calendar: true, todo: true }
      },
      todoCategories: todoStateAfterDeletion.categories,
      todoTasks: todoStateAfterDeletion.tasks,
      nextTodoId: nextNumericId
    };

    expect(saveLocalSetup(storage, setup).outcome).toBe('saved');

    const result = loadLocalSetup(storage);

    expect(result.outcome).toBe('loaded');
    expect(result.setup.summaryConfiguration).toEqual(setup.summaryConfiguration);
    expect(result.setup.todoCategories).toEqual([
      { id: 'category-1', name: 'Apartment', position: 1 }
    ]);
    expect(result.setup.todoTasks).toEqual([
      {
        id: 'todo-3',
        title: 'Buy coffee',
        categoryId: 'category-1',
        urgency: 'medium',
        position: 2,
        completed: false
      },
      {
        id: 'todo-5',
        title: 'Water plants',
        categoryId: 'category-1',
        urgency: 'low',
        position: 1,
        completed: false
      }
    ]);
    expect(tasksForTodoCategory(result.setup.todoTasks, 'category-1').map((task) => task.title)).toEqual([
      'Water plants',
      'Buy coffee'
    ]);
    expect(result.setup.nextTodoId).toBe(7);
  });

  test('round-trips Visitor Weather Location through browser storage', () => {
    const storage = memoryStorage();
    const setup: LocalSetupInput = {
      ...createDefaultLocalSetup(),
      weatherLocation: {
        label: 'Warsaw, Poland',
        latitude: 52.2297,
        longitude: 21.0122
      },
    };

    expect(saveLocalSetup(storage, setup).outcome).toBe('saved');

    const result = loadLocalSetup(storage);

    expect(result.outcome).toBe('loaded');
    expect(result.setup.weatherLocation).toEqual({
      label: 'Warsaw, Poland',
      latitude: 52.2297,
      longitude: 21.0122
    });
  });

  test('round-trips ordered Visitor Commute Routes and Commute Days independently of Weather Location', () => {
    const storage = memoryStorage();
    const setup: LocalSetupInput = {
      ...createDefaultLocalSetup(),
      weatherLocation: {
        label: 'Warsaw, Poland',
        latitude: 52.2297,
        longitude: 21.0122
      },
      commuteRoutes: [
        {
          id: 'route-1',
          enabled: true,
          name: 'Morning commute',
          origin: {
            label: 'Warsaw Central Station, Warsaw, Poland',
            latitude: 52.2285,
            longitude: 21.0037
          },
          destination: {
            label: 'Palace of Culture and Science, Warsaw, Poland',
            latitude: 52.2318,
            longitude: 21.0067
          }
        },
        {
          id: 'route-2',
          enabled: false,
          name: 'Evening commute',
          origin: { label: 'Office', latitude: 52.2318, longitude: 21.0067 },
          destination: { label: 'Home', latitude: 52.2285, longitude: 21.0037 }
        }
      ],
      commuteDays: ['monday', 'wednesday', 'sunday']
    };

    expect(saveLocalSetup(storage, setup).outcome).toBe('saved');
    expect(loadLocalSetup(storage).setup).toMatchObject({
      weatherLocation: setup.weatherLocation,
      commuteRoutes: setup.commuteRoutes,
      commuteDays: setup.commuteDays
    });
  });

  test('rejects invalid Visitor Commute Route data instead of persisting a partial route', () => {
    const storage = memoryStorage();
    const unsafeSetup = {
      ...createDefaultLocalSetup(),
      commuteRoutes: [{
        id: 'route-1',
        enabled: true,
        name: 'Morning commute',
        origin: { label: 'Origin', latitude: 52.2, longitude: 21 },
        destination: null
      }]
    } as unknown as LocalSetupInput;

    expect(saveLocalSetup(storage, unsafeSetup).outcome).toBe('write-failed');
    expect(storage.stored).toBeNull();
  });

  test('migrates a legacy single Commute Route to an enabled ordered route', () => {
    const setup = createDefaultLocalSetup();
    const storage = memoryStorage(
      JSON.stringify({
        ...setup,
        commuteRoute: {
          name: 'Morning commute',
          origin: { label: 'Home', latitude: 52.2, longitude: 21 },
          destination: { label: 'Office', latitude: 52.3, longitude: 21.1 }
        }
      })
    );

    expect(loadLocalSetup(storage).setup).toMatchObject({
      commuteRoutes: [{ id: 'route-1', name: 'Morning commute', enabled: true }],
      commuteDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
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

  test('creates a User setup import draft from a valid loaded Local Setup without demo provider data', () => {
    const localSetup: LocalSetupInput & {
      demoCalendar: { label: string };
      calendarConnection: { accessToken: string };
      selectedCalendars: Array<{ id: string; summary: string }>;
      calendarEvents: Array<{ title: string; attendees: string[] }>;
      mockWeather: { label: string };
      mockCommute: { label: string };
    } = {
      ...createDefaultLocalSetup(),
      summaryConfiguration: {
        ...defaultSummaryConfiguration,
        summaryTime: '18:45',
        sections: { weather: true, commute: false, calendar: true, todo: true }
      },
      weatherLocation: {
        label: 'Warsaw, Poland',
        latitude: 52.2297,
        longitude: 21.0122
      },
      commuteRoutes: [
        {
          id: 'visitor-route-1',
          name: 'Morning commute',
          origin: { label: 'Home', latitude: 52.2297, longitude: 21.0122 },
          destination: { label: 'Office', latitude: 52.2318, longitude: 21.0067 },
          enabled: false
        }
      ],
      commuteDays: ['monday', 'wednesday', 'sunday'],
      todoCategories: [
        { id: 'visitor-category-work', name: 'Work', position: 2 },
        { id: 'visitor-category-home', name: 'Home', position: 1 }
      ],
      todoTasks: [
        {
          id: 'visitor-task-work-2',
          title: 'Send agenda',
          categoryId: 'visitor-category-work',
          urgency: 'high',
          position: 2,
          completed: false
        },
        {
          id: 'visitor-task-uncategorized',
          title: 'Buy coffee',
          categoryId: null,
          urgency: 'medium',
          position: 1,
          completed: false
        },
        {
          id: 'visitor-task-home',
          title: 'Water plants',
          categoryId: 'visitor-category-home',
          urgency: 'low',
          position: 1,
          completed: false
        },
        {
          id: 'visitor-task-work-1',
          title: 'Draft update',
          categoryId: 'visitor-category-work',
          urgency: 'medium',
          position: 1,
          completed: false
        }
      ],
      nextTodoId: 5,
      demoCalendar: { label: 'Demo Calendar' },
      calendarConnection: { accessToken: 'private-calendar-access-token' },
      selectedCalendars: [{ id: 'demo-calendar', summary: 'Demo Calendar' }],
      calendarEvents: [
        { title: 'Private Calendar Event', attendees: ['friend@example.com'] }
      ],
      mockWeather: { label: 'Mock Weather' },
      mockCommute: { label: 'Mock Commute' }
    };

    const draft = createUserSetupImportDraftFromLocalSetup(
      { outcome: 'loaded', setup: localSetup },
      {
        userId: 'user-1',
        summaryConfigurationId: 'summary-1',
        weatherLocationId: 'weather-location-1',
        nextTodoCategoryId: (category) => `user-${category.id}`,
        nextTodoTaskId: (task) => `user-${task.id}`
      }
    );

    expect(draft).toEqual({
      summaryConfiguration: {
        id: 'summary-1',
        userId: 'user-1',
        summaryTime: '18:45',
        userTimeZone: 'UTC',
        summaryTheme: 'light',
        summaryDeliveryEnabled: true,
        weatherSectionEnabled: true,
        commuteSectionEnabled: false,
        calendarSectionEnabled: true,
        todoSectionEnabled: true
      },
      todoCategories: [
        { id: 'user-visitor-category-home', userId: 'user-1', name: 'Home', position: 1 },
        { id: 'user-visitor-category-work', userId: 'user-1', name: 'Work', position: 2 }
      ],
      todoTasks: [
        {
          id: 'user-visitor-task-work-1',
          userId: 'user-1',
          categoryId: 'user-visitor-category-work',
          title: 'Draft update',
          urgency: 'medium',
          position: 1,
          completed: false
        },
        {
          id: 'user-visitor-task-uncategorized',
          userId: 'user-1',
          categoryId: null,
          title: 'Buy coffee',
          urgency: 'medium',
          position: 1,
          completed: false
        },
        {
          id: 'user-visitor-task-home',
          userId: 'user-1',
          categoryId: 'user-visitor-category-home',
          title: 'Water plants',
          urgency: 'low',
          position: 1,
          completed: false
        },
        {
          id: 'user-visitor-task-work-2',
          userId: 'user-1',
          categoryId: 'user-visitor-category-work',
          title: 'Send agenda',
          urgency: 'high',
          position: 2,
          completed: false
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
          id: 'visitor-route-1',
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
    expect(JSON.stringify(draft)).not.toContain('Demo Calendar');
    expect(JSON.stringify(draft)).not.toContain('private-calendar-access-token');
    expect(JSON.stringify(draft)).not.toContain('Private Calendar Event');
    expect(draft).not.toHaveProperty('calendarConnection');
    expect(draft).not.toHaveProperty('selectedCalendars');
    expect(draft).not.toHaveProperty('calendarEvents');
    expect(JSON.stringify(draft)).not.toContain('Mock Weather');
    expect(JSON.stringify(draft)).not.toContain('Mock Commute');
  });

  test('does not create a User setup import draft when a task references an unsafe category', () => {
    expect(
      createUserSetupImportDraftFromLocalSetup(
        {
          outcome: 'loaded',
          setup: {
            ...createDefaultLocalSetup(),
            todoTasks: [
              {
                id: 'visitor-task-orphaned',
                title: 'Orphaned category assignment',
                categoryId: 'missing-category',
                urgency: 'high',
                position: 1,
                completed: false
              }
            ],
            nextTodoId: 2
          }
        },
        {
          userId: 'user-1',
          summaryConfigurationId: 'summary-1',
          weatherLocationId: 'weather-location-1',
          nextTodoCategoryId: (category) => category.id,
          nextTodoTaskId: (task) => task.id
        }
      )
    ).toBeNull();
  });

  const guardedLocalSetupLoadOutcomes = {
    empty: true,
    'invalid-json': true,
    'schema-invalid': true,
    'unsupported-version': true,
    'read-failed': true
  } satisfies Record<Exclude<LocalSetupLoadOutcome, 'loaded'>, true>;

  test.each(Object.keys(guardedLocalSetupLoadOutcomes) as Array<keyof typeof guardedLocalSetupLoadOutcomes>)(
    'does not create a User setup import draft for %s Local Setup outcome',
    (outcome) => {
      expect(
        createUserSetupImportDraftFromLocalSetup(
          { outcome, setup: createDefaultLocalSetup() },
          {
            userId: 'user-1',
            summaryConfigurationId: 'summary-1',
            weatherLocationId: 'weather-location-1',
            nextTodoCategoryId: (category) => category.id,
            nextTodoTaskId: (task) => task.id
          }
        )
      ).toBeNull();
    }
  );
});
