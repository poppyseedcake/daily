import { describe, expect, test, vi } from 'vitest';
import type { SummaryConfiguration } from '$lib/summaryConfiguration';
import type { DailySummaryDeliveryProvider } from './dailySummaryDelivery';
import { createScheduledDailySummaryGenerator } from './scheduledDailySummaryGeneration';

const configuration: SummaryConfiguration = {
  summaryTime: '07:00',
  userTimeZone: 'Europe/Warsaw',
  summaryTheme: 'dark',
  summaryDeliveryEnabled: true,
  sections: { weather: true, commute: true, calendar: true, todo: true }
};

describe('scheduled Daily Summary generation', () => {
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
        estimate: { durationMinutes: currentCommuteDuration.value }
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

    expect(first.rendered.text).toContain('Prepare first update !');
    expect(first.rendered.text).toContain('high 26C');
    expect(first.rendered.text).toContain('Office: 24 minutes');
    expect(first.rendered.text).toContain('First planning');
    expect(second.rendered.text).toContain('Prepare current update !');
    expect(second.rendered.text).toContain('Clear. Low 17C, high 28C. Chance of precipitation 10%.');
    expect(second.rendered.text).toContain('Office: 31 minutes');
    expect(second.rendered.text).toContain('10:00 Current planning (Work)');
    expect(second.rendered.text.indexOf('Weather')).toBeLessThan(second.rendered.text.indexOf('Commute'));
    expect(second.rendered.text.indexOf('Commute')).toBeLessThan(second.rendered.text.indexOf('Calendar'));
    expect(second.rendered.text.indexOf('Calendar')).toBeLessThan(second.rendered.text.indexOf('Todo Tasks'));
    expect(second.rendered.html).toContain('background-color:#111827');
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

    expect(result.rendered).toEqual({
      html: '<article style="background-color:#111827;color:#f9fafb;font-family:Arial,sans-serif;padding:24px"></article>',
      text: ''
    });
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

  test('contains provider failures while preserving qualifying unrelated content', async () => {
    const generator = createScheduledDailySummaryGenerator({
      configurationStore: { load: vi.fn().mockResolvedValue(configuration) },
      todoStore: {
        load: vi.fn().mockResolvedValue({
          todoCategories: [],
          todoTasks: [{
            id: 'todo-1', title: 'Useful Todo', categoryId: null, urgency: 'low', position: 1,
            completed: false
          }]
        })
      },
      weatherLocationStore: {
        load: vi.fn().mockResolvedValue({ label: 'Warsaw', latitude: 52.2297, longitude: 21.0122 })
      },
      commuteSetupStore: {
        load: vi.fn().mockResolvedValue({
          routes: [{
            id: 'office', name: 'Office', enabled: true,
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
          outcome: 'unavailable', reason: 'Live Calendar is unavailable right now.'
        })
      }),
      weatherProvider: {
        fetchDailyForecast: vi.fn().mockRejectedValue(new Error('private provider payload'))
      },
      commuteEstimateProvider: vi.fn().mockImplementation(() => {
        throw new Error('private Maps setup failure');
      }),
      now: () => new Date('2026-07-14T06:00:00.000Z')
    });

    const result = await generator.generate('user-1');

    expect(result.hasQualifyingContent).toBe(true);
    expect(result.sectionContent).toEqual({
      weather: 'unavailable',
      commute: 'unavailable',
      calendar: 'unavailable',
      todo: 'qualifying'
    });
    for (const output of [result.rendered.html, result.rendered.text]) {
      expect(output).toContain('Live weather is unavailable right now.');
      expect(output).toContain('Live Commute is unavailable right now.');
      expect(output).toContain('Live Calendar is unavailable right now.');
      expect(output).toContain('Useful Todo');
      expect(output).not.toContain('private provider payload');
    }
  });

  test('reports empty, inapplicable, and unavailable-only output as not qualifying', async () => {
    const mixedConfiguration: SummaryConfiguration = {
      ...configuration,
      sections: { weather: true, commute: true, calendar: true, todo: true }
    };
    const generator = createScheduledDailySummaryGenerator({
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
      weather: 'unavailable',
      commute: 'inapplicable',
      calendar: 'empty',
      todo: 'empty'
    });
    expect(result.rendered.text).toContain('Weather\nChoose a Weather Location');
    expect(result.rendered.text).toContain('Calendar\nNo Calendar Events in the next week.');
    expect(result.rendered.text).not.toContain('Commute');
    expect(result.rendered.text).not.toContain('Todo Tasks');
  });
});
