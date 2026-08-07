import { describe, expect, test, vi } from 'vitest';
import type { SummaryConfiguration } from '$lib/summaryConfiguration';
import type { DailySummaryDeliveryProvider } from './dailySummaryDelivery';
import {
  createScheduledDailySummaryGenerator,
  ScheduledDailySummaryUserNotActiveError,
  type ScheduledDailySummaryGenerationDependencies
} from './scheduledDailySummaryGeneration';

const configuration: SummaryConfiguration = {
  summaryTime: '07:00',
  userTimeZone: 'Europe/Warsaw',
  summaryTheme: 'dark',
  summaryDeliveryEnabled: true,
  sections: { weather: true, commute: true, calendar: true, todo: true },
  sectionPauses: { weather: false, commute: false, calendar: false, todo: false }
};

const usefulTodoState = {
  todoCategories: [],
  todoTasks: [
    {
      id: 'todo-1',
      title: 'Useful Todo',
      categoryId: null,
      urgency: 'low' as const,
      position: 1,
      completed: false
    }
  ]
};

const activeUserLifecycleStore = { isActive: vi.fn().mockResolvedValue(true) };

const createProviderIsolationDependencies = (
  summaryConfiguration: SummaryConfiguration,
  overrides: Partial<ScheduledDailySummaryGenerationDependencies>
): ScheduledDailySummaryGenerationDependencies => ({
  userLifecycleStore: activeUserLifecycleStore,
  configurationStore: { load: vi.fn().mockResolvedValue(summaryConfiguration) },
  todoStore: { load: vi.fn().mockResolvedValue(usefulTodoState) },
  weatherLocationStore: { load: vi.fn().mockResolvedValue(null) },
  commuteSetupStore: { load: vi.fn().mockResolvedValue({ routes: [], days: [] }) },
  calendarConnectionStore: { load: vi.fn(), loadSelectedCalendars: vi.fn() },
  loadCalendarAccessToken: vi.fn(),
  calendarEventProvider: vi.fn(),
  weatherProvider: { fetchDailyForecast: vi.fn() },
  commuteEstimateProvider: vi.fn(),
  now: () => new Date('2026-07-14T06:00:00.000Z'),
  ...overrides
});

describe('scheduled Daily Summary generation', () => {
  test('rejects a deleting User before loading setup or providers', async () => {
    const configurationStore = { load: vi.fn() };
    const dependencies = createProviderIsolationDependencies(configuration, {
      userLifecycleStore: { isActive: vi.fn().mockResolvedValue(false) },
      configurationStore
    });
    const generator = createScheduledDailySummaryGenerator(dependencies);

    await expect(generator.generate('user-1')).rejects.toBeInstanceOf(
      ScheduledDailySummaryUserNotActiveError
    );
    expect(configurationStore.load).not.toHaveBeenCalled();
    expect(dependencies.todoStore.load).not.toHaveBeenCalled();
    expect(dependencies.weatherProvider.fetchDailyForecast).not.toHaveBeenCalled();
    expect(dependencies.calendarEventProvider).not.toHaveBeenCalled();
    expect(dependencies.commuteEstimateProvider).not.toHaveBeenCalled();
  });

  test('loads current User setup and live provider data into the shared renderer', async () => {
    const currentTodoTitle = { value: 'Prepare first update' };
    const currentWeatherHigh = { value: 26 };
    const currentCalendarTitle = { value: 'First planning' };
    const currentCommuteDuration = { value: 24.4 };
    const weatherProvider = {
      fetchDailyForecast: vi.fn().mockImplementation(async () => ({
        outcome: 'available',
        forecast: {
          dates: ['2026-07-14'],
          weatherCodes: [0],
          minimumTemperaturesCelsius: [17],
          maximumTemperaturesCelsius: [currentWeatherHigh.value],
          precipitationProbabilities: [10]
        }
      } as const))
    };
    const calendarEventProvider = {
      fetchEvents: vi.fn().mockImplementation(async () => ({
        outcome: 'available',
        events: [{
          kind: 'timed',
          id: 'planning',
          calendarId: 'work',
          calendarSummary: 'Work',
          summary: currentCalendarTitle.value,
          start: '2026-07-14T08:00:00.000Z',
          end: '2026-07-14T08:30:00.000Z'
        }]
      } as const))
    };
    const commuteEstimateProvider = {
      estimateCommute: vi.fn().mockImplementation(async () => ({
        outcome: 'available',
        estimate: { durationMinutes: currentCommuteDuration.value, staticDurationMinutes: 20 }
      } as const))
    };
    const deliveryProvider: DailySummaryDeliveryProvider = {
      send: vi.fn().mockResolvedValue({
        providerName: 'fake-delivery',
        providerMessageId: 'message-1',
        providerStatusMetadata: 'accepted'
      })
    };
    const generator = createScheduledDailySummaryGenerator({
      userLifecycleStore: activeUserLifecycleStore,
      configurationStore: { load: vi.fn().mockResolvedValue(configuration) },
      todoStore: {
        load: vi.fn().mockImplementation(async () => ({
          todoCategories: [],
          todoTasks: [{
            id: 'todo-1',
            title: currentTodoTitle.value,
            categoryId: null,
            urgency: 'high',
            position: 1,
            completed: false
          }]
        }))
      },
      weatherLocationStore: {
        load: vi.fn().mockResolvedValue({ label: 'Warsaw', latitude: 52.2297, longitude: 21.0122 })
      },
      commuteSetupStore: {
        load: vi.fn().mockResolvedValue({
          routes: [{
            id: 'office',
            name: 'Office',
            enabled: true,
            days: ['tuesday'],
            origin: { label: 'Home', latitude: 52.2, longitude: 21 },
            destination: { label: 'Office', latitude: 52.3, longitude: 21.1 }
          }],
          days: ['tuesday']
        })
      },
      calendarConnectionStore: {
        load: vi.fn().mockResolvedValue({ status: 'connected' }),
        loadSelectedCalendars: vi.fn().mockResolvedValue([
          { id: 'work', summary: 'Work', backgroundColor: '#0b8043', primary: true }
        ])
      },
      loadCalendarAccessToken: vi.fn().mockResolvedValue('calendar-token'),
      calendarEventProvider: vi.fn().mockReturnValue(calendarEventProvider),
      weatherProvider,
      commuteEstimateProvider: vi.fn().mockReturnValue(commuteEstimateProvider),
      now: () => new Date('2026-07-14T06:00:00.000Z')
    });

    const first = await generator.generate('user-1');
    currentTodoTitle.value = 'Prepare current update';
    currentWeatherHigh.value = 28;
    currentCalendarTitle.value = 'Current planning';
    currentCommuteDuration.value = 31.2;
    const second = await generator.generate('user-1');
    await deliveryProvider.send({
      to: 'user@example.com',
      from: 'daily@example.com',
      subject: 'Scheduled Daily Summary',
      ...second.rendered
    });

    expect(first.rendered.text).toContain('Prepare first update — High urgency');
    expect(first.rendered.text).toContain('high 26C');
    expect(first.rendered.text).toContain('Office: 24 minutes');
    expect(first.rendered.text).toContain('First planning');
    expect(second.rendered.text).toContain('Prepare current update — High urgency');
    expect(second.rendered.text).toContain('Clear. Low 17C, high 28C. Chance of precipitation 10%.');
    expect(second.rendered.text).toContain('Office: 31 minutes');
    expect(second.rendered.text).toContain('10:00 Current planning (Work)');
    expect(second.rendered.text.indexOf('Weather')).toBeLessThan(second.rendered.text.indexOf('Commute'));
    expect(second.rendered.text.indexOf('Commute')).toBeLessThan(second.rendered.text.indexOf('Calendar'));
    expect(second.rendered.text.indexOf('Calendar')).toBeLessThan(second.rendered.text.indexOf('Todo'));
    expect(second.rendered.html).toContain('max-width:680px');
    expect(second.rendered.html).not.toContain('background-color:#111827');
    expect(second.hasQualifyingContent).toBe(true);
    expect(second.sectionContent).toEqual({
      weather: 'qualifying',
      commute: 'qualifying',
      calendar: 'qualifying',
      todo: 'qualifying'
    });
    expect(weatherProvider.fetchDailyForecast).toHaveBeenCalledTimes(2);
    expect(calendarEventProvider.fetchEvents).toHaveBeenCalledTimes(2);
    expect(commuteEstimateProvider.estimateCommute).toHaveBeenCalledTimes(2);
    expect(deliveryProvider.send).toHaveBeenCalledWith(expect.objectContaining(second.rendered));
  });

  test('does not initialize or call providers for disabled Summary Sections', async () => {
    const loadCalendarAccessToken = vi.fn();
    const calendarEventProvider = vi.fn();
    const weatherProvider = { fetchDailyForecast: vi.fn() };
    const commuteEstimateProvider = vi.fn();
    const loadCalendarConnection = vi.fn().mockRejectedValue(new Error('broken connection data'));
    const loadSelectedCalendars = vi.fn().mockRejectedValue(new Error('broken calendar data'));
    const disabledConfiguration: SummaryConfiguration = {
      ...configuration,
      sections: { weather: false, commute: false, calendar: false, todo: false }
    };
    const generator = createScheduledDailySummaryGenerator({
      userLifecycleStore: activeUserLifecycleStore,
      configurationStore: { load: vi.fn().mockResolvedValue(disabledConfiguration) },
      todoStore: { load: vi.fn().mockResolvedValue({ todoCategories: [], todoTasks: [] }) },
      weatherLocationStore: { load: vi.fn().mockResolvedValue(null) },
      commuteSetupStore: { load: vi.fn().mockResolvedValue(null) },
      calendarConnectionStore: {
        load: loadCalendarConnection,
        loadSelectedCalendars
      },
      loadCalendarAccessToken,
      calendarEventProvider,
      weatherProvider,
      commuteEstimateProvider,
      now: () => new Date('2026-07-14T06:00:00.000Z')
    });

    const result = await generator.generate('user-1');

    expect(result.rendered.html).toContain('data-summary-section="weather"');
    expect(result.rendered.html).toContain('data-summary-section="commute"');
    expect(result.rendered.html).toContain('data-summary-section="calendar"');
    expect(result.rendered.html).toContain('data-summary-section="todo"');
    expect(result.rendered.text).toContain('Weather\nPaused\nWeather is paused.');
    expect(result.rendered.text).toContain('Todo\nPaused\nTodo is paused.');
    expect(result.hasQualifyingContent).toBe(false);
    expect(result.sectionContent).toEqual({
      weather: 'inapplicable',
      commute: 'inapplicable',
      calendar: 'inapplicable',
      todo: 'inapplicable'
    });
    expect(weatherProvider.fetchDailyForecast).not.toHaveBeenCalled();
    expect(commuteEstimateProvider).not.toHaveBeenCalled();
    expect(loadCalendarConnection).not.toHaveBeenCalled();
    expect(loadSelectedCalendars).not.toHaveBeenCalled();
    expect(loadCalendarAccessToken).not.toHaveBeenCalled();
    expect(calendarEventProvider).not.toHaveBeenCalled();
  });

  test('contains a Weather provider failure while preserving qualifying unrelated content', async () => {
    const weatherAndTodoConfiguration: SummaryConfiguration = {
      ...configuration,
      sections: { weather: true, commute: false, calendar: false, todo: true }
    };
    const generator = createScheduledDailySummaryGenerator(
      createProviderIsolationDependencies(weatherAndTodoConfiguration, {
        weatherLocationStore: {
          load: vi.fn().mockResolvedValue({
            label: 'Warsaw', latitude: 52.2297, longitude: 21.0122
          })
        },
        weatherProvider: {
          fetchDailyForecast: vi.fn().mockRejectedValue(new Error('private provider payload'))
        }
      })
    );

    const result = await generator.generate('user-1');

    expect(result.hasQualifyingContent).toBe(true);
    expect(result.sectionContent).toEqual({
      weather: 'unavailable',
      commute: 'inapplicable',
      calendar: 'inapplicable',
      todo: 'qualifying'
    });
    for (const output of [result.rendered.html, result.rendered.text]) {
      expect(output).toContain('Live weather is unavailable right now.');
      expect(output).toContain('Useful Todo');
      expect(output).not.toContain('private provider payload');
    }
  });

  test('contains a Commute setup failure while preserving qualifying unrelated content', async () => {
    const commuteAndTodoConfiguration: SummaryConfiguration = {
      ...configuration,
      sections: { weather: false, commute: true, calendar: false, todo: true }
    };
    const generator = createScheduledDailySummaryGenerator(
      createProviderIsolationDependencies(commuteAndTodoConfiguration, {
        commuteSetupStore: {
          load: vi.fn().mockRejectedValue(new Error('private Commute setup failure'))
        }
      })
    );

    const result = await generator.generate('user-1');

    expect(result.hasQualifyingContent).toBe(true);
    expect(result.sectionContent).toEqual({
      weather: 'inapplicable',
      commute: 'unavailable',
      calendar: 'inapplicable',
      todo: 'qualifying'
    });
    expect(result.rendered.text).toContain('Live Commute is unavailable right now.');
    expect(result.rendered.text).toContain('Useful Todo');
    expect(result.rendered.text).not.toContain('private Commute setup failure');
  });

  test.each([
    {
      failure: 'a Commute provider failure',
      estimateCommute: () => vi.fn().mockRejectedValue(new Error('private Commute provider failure'))
    },
    {
      failure: 'a protective Maps suspension',
      estimateCommute: () => vi.fn().mockResolvedValue({
        outcome: 'unavailable', reason: 'global-daily-cap'
      })
    }
  ])(
    'contains $failure without stopping Weather, Calendar, or Todo output',
    async ({ estimateCommute }) => {
      const generator = createScheduledDailySummaryGenerator(
        createProviderIsolationDependencies(configuration, {
          weatherLocationStore: {
            load: vi.fn().mockResolvedValue({
              label: 'Warsaw', latitude: 52.2297, longitude: 21.0122
            })
          },
          weatherProvider: {
            fetchDailyForecast: vi.fn().mockResolvedValue({
              outcome: 'available',
              forecast: {
                dates: ['2026-07-14'],
                weatherCodes: [0],
                minimumTemperaturesCelsius: [17],
                maximumTemperaturesCelsius: [26],
                precipitationProbabilities: [10]
              }
            })
          },
          commuteSetupStore: {
            load: vi.fn().mockResolvedValue({
              routes: [{
                id: 'office', name: 'Office', enabled: true,
                days: ['tuesday'],
                origin: { label: 'Home', latitude: 52.2, longitude: 21 },
                destination: { label: 'Office', latitude: 52.3, longitude: 21.1 }
              }],
              days: ['tuesday']
            })
          },
          calendarConnectionStore: {
            load: vi.fn().mockResolvedValue({ status: 'connected' }),
            loadSelectedCalendars: vi.fn().mockResolvedValue([
              { id: 'work', summary: 'Work', backgroundColor: null, primary: true }
            ])
          },
          loadCalendarAccessToken: vi.fn().mockResolvedValue('calendar-token'),
          calendarEventProvider: vi.fn().mockReturnValue({
            fetchEvents: vi.fn().mockResolvedValue({
              outcome: 'available',
              events: [{
                kind: 'timed', id: 'planning', calendarId: 'work', calendarSummary: 'Work',
                summary: 'Planning', start: '2026-07-14T08:00:00.000Z',
                end: '2026-07-14T08:30:00.000Z'
              }]
            })
          }),
          commuteEstimateProvider: vi.fn().mockReturnValue({
            estimateCommute: estimateCommute()
          })
        })
      );

      const result = await generator.generate('user-1');

      expect(result.hasQualifyingContent).toBe(true);
      expect(result.sectionContent.commute).toBe('unavailable');
      expect(result.sectionContent.weather).toBe('qualifying');
      expect(result.sectionContent.calendar).toBe('qualifying');
      expect(result.sectionContent.todo).toBe('qualifying');
      expect(result.rendered.text).toContain('Live Commute is unavailable right now.');
      expect(result.rendered.text).toContain('Clear. Low 17C, high 26C.');
      expect(result.rendered.text).toContain('10:00 Planning (Work)');
      expect(result.rendered.text).toContain('Useful Todo');
    }
  );

  test('contains a Calendar provider failure while preserving qualifying unrelated content', async () => {
    const calendarAndTodoConfiguration: SummaryConfiguration = {
      ...configuration,
      sections: { weather: false, commute: false, calendar: true, todo: true }
    };
    const generator = createScheduledDailySummaryGenerator(
      createProviderIsolationDependencies(calendarAndTodoConfiguration, {
        calendarConnectionStore: {
          load: vi.fn().mockResolvedValue({ status: 'connected' }),
          loadSelectedCalendars: vi.fn().mockResolvedValue([
            { id: 'work', summary: 'Work', backgroundColor: null, primary: true }
          ])
        },
        loadCalendarAccessToken: vi.fn().mockResolvedValue('calendar-token'),
        calendarEventProvider: vi.fn().mockReturnValue({
          fetchEvents: vi.fn().mockRejectedValue(new Error('private Calendar provider failure'))
        })
      })
    );

    const result = await generator.generate('user-1');

    expect(result.hasQualifyingContent).toBe(true);
    expect(result.sectionContent.calendar).toBe('unavailable');
    expect(result.sectionContent.todo).toBe('qualifying');
    expect(result.rendered.text).toContain('Live Calendar is unavailable right now.');
    expect(result.rendered.text).toContain('Useful Todo');
    expect(result.rendered.text).not.toContain('private Calendar provider failure');
  });

  test('contains a Todo state failure while preserving the other Summary Sections and delivery input', async () => {
    const weatherAndTodoConfiguration: SummaryConfiguration = {
      ...configuration,
      sections: { weather: true, commute: false, calendar: false, todo: true }
    };
    const generator = createScheduledDailySummaryGenerator(
      createProviderIsolationDependencies(weatherAndTodoConfiguration, {
        todoStore: {
          load: vi.fn().mockRejectedValue(new Error('private Todo state failure'))
        },
        weatherLocationStore: {
          load: vi.fn().mockResolvedValue({
            label: 'Warsaw', latitude: 52.2297, longitude: 21.0122
          })
        },
        weatherProvider: {
          fetchDailyForecast: vi.fn().mockResolvedValue({
            outcome: 'available',
            forecast: {
              dates: ['2026-07-14'],
              weatherCodes: [0],
              minimumTemperaturesCelsius: [17],
              maximumTemperaturesCelsius: [26],
              precipitationProbabilities: [10]
            }
          })
        }
      })
    );

    const result = await generator.generate('user-1');

    expect(result.input.sections.todo).toEqual({
      status: 'unavailable',
      label: 'Todo',
      reason: 'Todo data is temporarily unavailable.'
    });
    expect(result.input.todoSection).toBeNull();
    expect(result.rendered.text).toContain('Clear. Low 17C, high 26C.');
    expect(result.rendered.text).toContain(
      'Todo\nUnavailable\nTodo data is temporarily unavailable.'
    );
    expect(result.rendered.text).not.toContain('private Todo state failure');
    expect(result.hasQualifyingContent).toBe(true);
  });

  test('does not load Todo state when Todo is paused and keeps the paused state', async () => {
    const todoStore = { load: vi.fn().mockRejectedValue(new Error('should not load')) };
    const generator = createScheduledDailySummaryGenerator(
      createProviderIsolationDependencies({
        ...configuration,
        sections: { weather: false, commute: false, calendar: false, todo: true },
        sectionPauses: { ...configuration.sectionPauses, todo: true }
      }, { todoStore })
    );

    const result = await generator.generate('user-1');

    expect(todoStore.load).not.toHaveBeenCalled();
    expect(result.input.sections.todo).toEqual({
      status: 'paused',
      label: 'Todo',
      detail: 'Todo is paused.'
    });
    expect(result.rendered.text).not.toContain('should not load');
  });

  test('contains a Calendar connection failure while preserving qualifying unrelated content', async () => {
    const calendarAndTodoConfiguration: SummaryConfiguration = {
      ...configuration,
      sections: { weather: false, commute: false, calendar: true, todo: true }
    };
    const generator = createScheduledDailySummaryGenerator(
      createProviderIsolationDependencies(calendarAndTodoConfiguration, {
        calendarConnectionStore: {
          load: vi.fn().mockRejectedValue(new Error('private Calendar connection failure')),
          loadSelectedCalendars: vi.fn()
        }
      })
    );

    const result = await generator.generate('user-1');

    expect(result.hasQualifyingContent).toBe(true);
    expect(result.sectionContent.calendar).toBe('unavailable');
    expect(result.sectionContent.todo).toBe('qualifying');
    expect(result.rendered.text).toContain('Live Calendar is unavailable right now.');
    expect(result.rendered.text).toContain('Useful Todo');
    expect(result.rendered.text).not.toContain('private Calendar connection failure');
  });

  test('does not load Calendar credentials or events when no Selected Calendar exists', async () => {
    const loadCalendarAccessToken = vi.fn();
    const calendarEventProvider = vi.fn();
    const generator = createScheduledDailySummaryGenerator(
      createProviderIsolationDependencies(configuration, {
        calendarConnectionStore: {
          load: vi.fn().mockResolvedValue({ status: 'connected' }),
          loadSelectedCalendars: vi.fn().mockResolvedValue([])
        },
        loadCalendarAccessToken,
        calendarEventProvider
      })
    );

    const result = await generator.generate('user-1');

    expect(result.input.sections.calendar).toEqual({
      status: 'unconfigured',
      label: 'Calendar',
      detail: 'Select a Calendar to include Calendar Events.'
    });
    expect(loadCalendarAccessToken).not.toHaveBeenCalled();
    expect(calendarEventProvider).not.toHaveBeenCalled();
  });

  test('reports empty, inapplicable, and unavailable-only output as not qualifying', async () => {
    const mixedConfiguration: SummaryConfiguration = {
      ...configuration,
      sections: { weather: true, commute: true, calendar: true, todo: true }
    };
    const generator = createScheduledDailySummaryGenerator({
      userLifecycleStore: activeUserLifecycleStore,
      configurationStore: { load: vi.fn().mockResolvedValue(mixedConfiguration) },
      todoStore: { load: vi.fn().mockResolvedValue({ todoCategories: [], todoTasks: [] }) },
      weatherLocationStore: { load: vi.fn().mockResolvedValue(null) },
      commuteSetupStore: { load: vi.fn().mockResolvedValue({ routes: [], days: ['tuesday'] }) },
      calendarConnectionStore: {
        load: vi.fn().mockResolvedValue({ status: 'connected' }),
        loadSelectedCalendars: vi.fn().mockResolvedValue([
          { id: 'work', summary: 'Work', backgroundColor: null, primary: true }
        ])
      },
      loadCalendarAccessToken: vi.fn().mockResolvedValue('calendar-token'),
      calendarEventProvider: vi.fn().mockReturnValue({
        fetchEvents: vi.fn().mockResolvedValue({ outcome: 'available', events: [] })
      }),
      weatherProvider: { fetchDailyForecast: vi.fn() },
      commuteEstimateProvider: vi.fn(),
      now: () => new Date('2026-07-14T06:00:00.000Z')
    });

    const result = await generator.generate('user-1');

    expect(result.hasQualifyingContent).toBe(false);
    expect(result.sectionContent).toEqual({
      weather: 'inapplicable',
      commute: 'inapplicable',
      calendar: 'empty',
      todo: 'empty'
    });
    expect(result.rendered.text).toContain('Weather\nNot configured\nChoose a Weather Location');
    expect(result.rendered.text).toContain('Calendar\nNothing scheduled\nNo Calendar Events in the Week Ahead.');
    expect(result.rendered.text).toContain('Commute');
    expect(result.rendered.text).toContain('Todo\nNothing scheduled\nThere are no active Todo Tasks.');
  });
});
