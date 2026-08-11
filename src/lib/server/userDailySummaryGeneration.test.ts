import { describe, expect, test, vi } from 'vitest';
import type { LoadedCalendarEvents } from '$lib/calendar';
import {
  calendarReadinessForAuthMode,
  calendarReadinessForUserConnection
} from '$lib/calendarReadiness';
import type { SummaryConfiguration } from '$lib/summaryConfiguration';
import type { DailySummaryDeliveryProvider } from './dailySummaryDelivery';
import {
  createUserDailySummaryGenerator,
  UserDailySummaryNotActiveError,
  type UserDailySummaryGenerationDependencies
} from '$lib/dailySummaryGeneration/server';

const configuration: SummaryConfiguration = {
  summaryTime: '07:00',
  userTimeZone: 'Europe/Warsaw',
  summaryDeliveryEnabled: true,
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

const loadedCalendarEvents = (
  eventResult: LoadedCalendarEvents['eventResult'] = { outcome: 'not-requested' }
): LoadedCalendarEvents => ({
  readiness: calendarReadinessForUserConnection({ status: 'connected' }),
  selectedCalendars: [
    { id: 'work', summary: 'Work', backgroundColor: '#0b8043', primary: true }
  ],
  eventResult
});

const calendarEventsDependency = (
  calendarEvents: LoadedCalendarEvents = {
    readiness: calendarReadinessForAuthMode('user'),
    selectedCalendars: [],
    eventResult: { outcome: 'not-requested' }
  }
) => ({
  load: vi.fn().mockResolvedValue({
    calendarEvents,
    selectedCalendarConfiguration: null
  })
});

const createProviderIsolationDependencies = (
  summaryConfiguration: SummaryConfiguration,
  overrides: Partial<UserDailySummaryGenerationDependencies>
): UserDailySummaryGenerationDependencies => ({
  userLifecycleStore: activeUserLifecycleStore,
  configurationStore: { load: vi.fn().mockResolvedValue(summaryConfiguration) },
  todoStore: { load: vi.fn().mockResolvedValue(usefulTodoState) },
  weatherLocationStore: { load: vi.fn().mockResolvedValue(null) },
  commuteSetupStore: { load: vi.fn().mockResolvedValue({ routes: [], days: [] }) },
  calendarEvents: calendarEventsDependency(),
  weatherProvider: { fetchDailyForecast: vi.fn() },
  commuteEstimateProvider: vi.fn(),
  now: () => new Date('2026-07-14T06:00:00.000Z'),
  ...overrides
});

describe('User Daily Summary generation', () => {
  test('rejects a deleting User before loading setup or providers', async () => {
    const configurationStore = { load: vi.fn() };
    const dependencies = createProviderIsolationDependencies(configuration, {
      userLifecycleStore: { isActive: vi.fn().mockResolvedValue(false) },
      configurationStore
    });
    const generator = createUserDailySummaryGenerator(dependencies);

    await expect(generator.generate({ userId: 'user-1' })).rejects.toBeInstanceOf(
      UserDailySummaryNotActiveError
    );
    expect(configurationStore.load).not.toHaveBeenCalled();
    expect(dependencies.todoStore.load).not.toHaveBeenCalled();
    expect(dependencies.weatherProvider.fetchDailyForecast).not.toHaveBeenCalled();
    expect(dependencies.calendarEvents.load).not.toHaveBeenCalled();
    expect(dependencies.commuteEstimateProvider).not.toHaveBeenCalled();
  });

  test('accepts a request-scoped public URL for the shared production path', async () => {
    const generator = createUserDailySummaryGenerator(
      createProviderIsolationDependencies(configuration, {})
    );

    const result = await generator.generate(
      { userId: 'user-1' },
      {
        openDailyUrl: 'https://preview.example.test/summary?tracking=private'
      }
    );

    expect(result.input.generatedAt).toEqual(new Date('2026-07-14T06:00:00.000Z'));
    expect(result.rendered.html).toContain('href="https://preview.example.test/"');
    expect(result.rendered.html).not.toContain('tracking=private');
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
    const loadCalendarEvents = vi.fn().mockImplementation(async () => ({
      calendarEvents: loadedCalendarEvents({
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
      }),
      selectedCalendarConfiguration: null
    }));
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
    const generator = createUserDailySummaryGenerator({
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
      calendarEvents: { load: loadCalendarEvents },
      weatherProvider,
      commuteEstimateProvider: vi.fn().mockReturnValue(commuteEstimateProvider),
      now: () => new Date('2026-07-14T06:00:00.000Z')
    });

    const first = await generator.generate({ userId: 'user-1' });
    currentTodoTitle.value = 'Prepare current update';
    currentWeatherHigh.value = 28;
    currentCalendarTitle.value = 'Current planning';
    currentCommuteDuration.value = 31.2;
    const second = await generator.generate({ userId: 'user-1' });
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
    expect(weatherProvider.fetchDailyForecast).toHaveBeenCalledTimes(2);
    expect(loadCalendarEvents).toHaveBeenCalledTimes(2);
    expect(commuteEstimateProvider.estimateCommute).toHaveBeenCalledTimes(2);
    expect(deliveryProvider.send).toHaveBeenCalledWith(expect.objectContaining(second.rendered));
  });

  test('does not initialize or call providers for paused Summary Sections', async () => {
    const loadCalendarEvents = vi.fn().mockRejectedValue(new Error('broken Calendar data'));
    const loadWeatherLocation = vi.fn().mockRejectedValue(new Error('broken weather data'));
    const weatherProvider = { fetchDailyForecast: vi.fn() };
    const commuteEstimateProvider = vi.fn();
    const disabledConfiguration: SummaryConfiguration = {
      ...configuration,
      sectionPauses: { weather: true, commute: true, calendar: true, todo: true }
    };
    const generator = createUserDailySummaryGenerator({
      userLifecycleStore: activeUserLifecycleStore,
      configurationStore: { load: vi.fn().mockResolvedValue(disabledConfiguration) },
      todoStore: { load: vi.fn().mockResolvedValue({ todoCategories: [], todoTasks: [] }) },
      weatherLocationStore: { load: loadWeatherLocation },
      commuteSetupStore: { load: vi.fn().mockResolvedValue(null) },
      calendarEvents: { load: loadCalendarEvents },
      weatherProvider,
      commuteEstimateProvider,
      now: () => new Date('2026-07-14T06:00:00.000Z')
    });

    const result = await generator.generate({ userId: 'user-1' });

    expect(result.rendered.html).toContain('data-summary-section="weather"');
    expect(result.rendered.html).toContain('data-summary-section="commute"');
    expect(result.rendered.html).toContain('data-summary-section="calendar"');
    expect(result.rendered.html).toContain('data-summary-section="todo"');
    expect(result.rendered.text).toContain('Weather\nPaused\nWeather is paused.');
    expect(result.rendered.text).toContain('Todo\nPaused\nTodo is paused.');
    expect(weatherProvider.fetchDailyForecast).not.toHaveBeenCalled();
    expect(loadWeatherLocation).not.toHaveBeenCalled();
    expect(commuteEstimateProvider).not.toHaveBeenCalled();
    expect(loadCalendarEvents).not.toHaveBeenCalled();
  });

  test('keeps a preloaded Calendar snapshot bound to a paused Summary generation', async () => {
    const configurationStore = { load: vi.fn() };
    const calendarEvents = calendarEventsDependency();
    const pausedConfiguration: SummaryConfiguration = {
      ...configuration,
      sectionPauses: { weather: true, commute: true, calendar: true, todo: true }
    };
    const preloadedCalendarEvents = loadedCalendarEvents({
      outcome: 'available',
      events: [{
        kind: 'timed',
        id: 'planning',
        calendarId: 'work',
        calendarSummary: 'Work',
        summary: 'Planning',
        start: '2026-07-14T08:00:00.000Z',
        end: '2026-07-14T08:30:00.000Z'
      }]
    });
    const generator = createUserDailySummaryGenerator(
      createProviderIsolationDependencies(pausedConfiguration, {
        configurationStore,
        calendarEvents
      })
    );

    const result = await generator.generate({
      userId: 'user-1',
      snapshot: {
        configuration: pausedConfiguration,
        calendarEvents: preloadedCalendarEvents,
        generatedAt: new Date('2026-07-14T06:00:00.000Z')
      }
    });

    expect(result.input.sections.calendar.status).toBe('paused');
    expect(configurationStore.load).not.toHaveBeenCalled();
    expect(calendarEvents.load).not.toHaveBeenCalled();
  });

  test('contains a Weather location failure while preserving unrelated content', async () => {
    const weatherAndTodoConfiguration: SummaryConfiguration = {
      ...configuration,
      sectionPauses: { weather: false, commute: true, calendar: true, todo: false }
    };
    const weatherProvider = { fetchDailyForecast: vi.fn() };
    const generator = createUserDailySummaryGenerator(
      createProviderIsolationDependencies(weatherAndTodoConfiguration, {
        weatherLocationStore: {
          load: vi.fn().mockRejectedValue(new Error('private Weather location failure'))
        },
        weatherProvider
      })
    );

    const result = await generator.generate({ userId: 'user-1' });

    expect(result.rendered.text).toContain('Live weather is unavailable right now.');
    expect(result.rendered.text).toContain('Useful Todo');
    expect(result.rendered.text).not.toContain('private Weather location failure');
    expect(weatherProvider.fetchDailyForecast).not.toHaveBeenCalled();
  });

  test('contains a Commute setup failure while preserving unrelated content', async () => {
    const commuteAndTodoConfiguration: SummaryConfiguration = {
      ...configuration,
      sectionPauses: { weather: true, commute: false, calendar: true, todo: false }
    };
    const generator = createUserDailySummaryGenerator(
      createProviderIsolationDependencies(commuteAndTodoConfiguration, {
        commuteSetupStore: {
          load: vi.fn().mockRejectedValue(new Error('private Commute setup failure'))
        }
      })
    );

    const result = await generator.generate({ userId: 'user-1' });

    expect(result.rendered.text).toContain('Live Commute is unavailable right now.');
    expect(result.rendered.text).toContain('Useful Todo');
    expect(result.rendered.text).not.toContain('private Commute setup failure');
  });

  test('contains a Todo state failure while preserving the other Summary Sections and delivery input', async () => {
    const weatherAndTodoConfiguration: SummaryConfiguration = {
      ...configuration,
      sectionPauses: { weather: false, commute: true, calendar: true, todo: false }
    };
    const generator = createUserDailySummaryGenerator(
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

    const result = await generator.generate({ userId: 'user-1' });

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
  });

  test('does not load Todo state when Todo is paused and keeps the paused state', async () => {
    const todoStore = { load: vi.fn().mockRejectedValue(new Error('should not load')) };
    const generator = createUserDailySummaryGenerator(
      createProviderIsolationDependencies({
        ...configuration,
        sectionPauses: { weather: true, commute: true, calendar: true, todo: true }
      }, { todoStore })
    );

    const result = await generator.generate({ userId: 'user-1' });

    expect(todoStore.load).not.toHaveBeenCalled();
    expect(result.input.sections.todo).toEqual({
      status: 'paused',
      label: 'Todo',
      detail: 'Todo is paused.'
    });
    expect(result.rendered.text).not.toContain('should not load');
  });

});
