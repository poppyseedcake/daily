import { describe, expect, test, vi } from 'vitest';
import { buildDailySummaryInput } from './dailySummaryPreview';
import { renderDailySummary } from './dailySummaryRenderer';
import type { SummaryConfiguration } from './summaryConfiguration';
import type { TodoCategory, TodoTask } from './todo';
import type { CommuteRoute } from './commuteRoute';

const configuration: SummaryConfiguration = {
  summaryTime: '18:45',
  userTimeZone: 'America/New_York',
  summaryTheme: 'light',
  summaryDeliveryEnabled: true,
  sections: {
    weather: true,
    commute: true,
    calendar: true,
    todo: true
  }
};

const todoCategories: TodoCategory[] = [{ id: 'category-work', name: 'Work', position: 1 }];
const todoTasks: TodoTask[] = [
  {
    id: 'todo-buy-coffee',
    title: 'Buy coffee',
    categoryId: null,
    urgency: 'medium',
    position: 1,
    completed: false
  },
  {
    id: 'todo-draft-update',
    title: 'Draft update',
    categoryId: 'category-work',
    urgency: 'high',
    position: 1,
    completed: false
  }
];

describe('Daily Summary preview input', () => {
  test('fetches and renders one live estimate for every enabled route on the local Commute Day', async () => {
    const routes: CommuteRoute[] = [
      { id: 'office', name: 'Office', enabled: true, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'Office', latitude: 40.7, longitude: -74 } },
      { id: 'gym', name: 'Gym', enabled: false, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'Gym', latitude: 40.5, longitude: -73.8 } },
      { id: 'school', name: 'School run', enabled: true, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'School', latitude: 40.6, longitude: -73.7 } }
    ];
    const commuteEstimateProvider = {
      estimateCommute: vi.fn()
        .mockResolvedValueOnce({ outcome: 'available', estimate: { durationMinutes: 24 } } as const)
        .mockResolvedValueOnce({ outcome: 'available', estimate: { durationMinutes: 11 } } as const)
    };

    const preview = await buildDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      commuteRoutes: routes,
      commuteDays: ['wednesday'],
      commuteEstimateProvider,
      now: new Date('2026-07-09T02:30:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(commuteEstimateProvider.estimateCommute).toHaveBeenCalledTimes(2);
    expect(rendered.text).toContain('Commute\nOffice: 24 minutes\nSchool run: 11 minutes');
    expect(rendered.html).toContain('Office: 24 minutes');
    expect(rendered.html).toContain('School run: 11 minutes');
    expect(rendered.text).not.toContain('Gym');
  });

  test.each(['light', 'dark'] as const)('keeps route-labeled Commute in fixed HTML and text order for the %s theme', async (summaryTheme) => {
    const preview = await buildDailySummaryInput({
      configuration: { ...configuration, summaryTheme },
      todoCategories,
      todoTasks,
      commuteRoutes: [{ id: 'office', name: 'Office', enabled: true, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'Office', latitude: 40.7, longitude: -74 } }],
      commuteDays: ['wednesday'],
      commuteEstimateProvider: { estimateCommute: vi.fn().mockResolvedValue({ outcome: 'available', estimate: { durationMinutes: 24 } }) },
      weatherLocation: { label: 'New York', latitude: 40.7, longitude: -74 },
      weatherProvider: { fetchDailyForecast: vi.fn().mockResolvedValue({ outcome: 'available', forecast: { daily: { time: ['2026-07-08'], weather_code: [0], temperature_2m_min: [18], temperature_2m_max: [27], precipitation_probability_max: [5] } } }) },
      now: new Date('2026-07-09T02:30:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    for (const output of [rendered.html, rendered.text]) {
      expect(output.indexOf('Weather')).toBeLessThan(output.indexOf('Commute'));
      expect(output.indexOf('Commute')).toBeLessThan(output.indexOf('Demo Calendar'));
      expect(output.indexOf('Demo Calendar')).toBeLessThan(output.indexOf('Todo Tasks'));
      expect(output).toContain('Office: 24 minutes');
    }
  });

  test('keeps available route estimates when another route is unavailable', async () => {
    const commuteEstimateProvider = {
      estimateCommute: vi.fn()
        .mockResolvedValueOnce({ outcome: 'unavailable', reason: 'route-unavailable' } as const)
        .mockResolvedValueOnce({ outcome: 'available', estimate: { durationMinutes: 11 } } as const)
    };
    const routes: CommuteRoute[] = [
      { id: 'office', name: 'Office', enabled: true, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'Office', latitude: 40.7, longitude: -74 } },
      { id: 'school', name: 'School run', enabled: true, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'School', latitude: 40.6, longitude: -73.7 } }
    ];

    const preview = await buildDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      commuteRoutes: routes,
      commuteDays: ['wednesday'],
      commuteEstimateProvider,
      now: new Date('2026-07-09T02:30:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain('Commute\nOffice: unavailable\nSchool run: 11 minutes');
    expect(rendered.html).toContain('Office: unavailable');
    expect(rendered.html).toContain('School run: 11 minutes');
  });

  test.each([
    ['disabled section', { sections: { ...configuration.sections, commute: false } }, ['wednesday']],
    ['non-Commute Day', {}, ['thursday']],
    ['empty weekday selection', {}, []]
  ] as const)('omits Commute without estimate requests for %s', async (_case, configurationPatch, commuteDays) => {
    const commuteEstimateProvider = { estimateCommute: vi.fn() };
    const preview = await buildDailySummaryInput({
      configuration: { ...configuration, ...configurationPatch },
      todoCategories,
      todoTasks,
      commuteRoutes: [{ id: 'office', name: 'Office', enabled: true, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'Office', latitude: 40.7, longitude: -74 } }],
      commuteDays,
      commuteEstimateProvider,
      now: new Date('2026-07-09T02:30:00.000Z')
    });

    expect(commuteEstimateProvider.estimateCommute).not.toHaveBeenCalled();
    expect(renderDailySummary(preview).text).not.toContain('Commute');
  });

  test('keeps a protected estimate suspension local to the Commute Section', async () => {
    const preview = await buildDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      commuteRoutes: [{ id: 'office', name: 'Office', enabled: true, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'Office', latitude: 40.7, longitude: -74 } }],
      commuteDays: ['wednesday'],
      commuteEstimateProvider: { estimateCommute: vi.fn().mockResolvedValue({ outcome: 'unavailable', reason: 'global-daily-cap' }) },
      now: new Date('2026-07-09T02:30:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain('Commute\nLive Commute is unavailable right now.');
    expect(rendered.text).toContain('Demo Calendar');
    expect(rendered.text).toContain('Todo Tasks');
  });
  test('renders Visitor setup with Demo Calendar through the Daily Summary input shape', async () => {
    const visitorPreview = await buildDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks
    });

    expect(renderDailySummary(visitorPreview).text).toContain('Choose a Weather Location to preview live weather.');
    expect(renderDailySummary(visitorPreview).text).not.toContain('Commute');
    expect(renderDailySummary(visitorPreview).text).toContain('Demo Calendar');
    expect(renderDailySummary(visitorPreview).text).toContain('Buy coffee !');
    expect(renderDailySummary(visitorPreview).text).toContain('Work\nDraft update !');
  });

  test('renders signed-in User Calendar as unavailable until Calendar is connected', async () => {
    const calendarEventProvider = {
      fetchEvents: vi.fn().mockResolvedValue({ outcome: 'available', events: [] } as const)
    };
    const preview = await buildDailySummaryInput({
      authMode: 'user',
      configuration,
      todoCategories,
      todoTasks,
      selectedCalendars: [
        { id: 'work', summary: 'Work', backgroundColor: '#1a73e8', primary: true }
      ],
      calendarEventProvider
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain('Calendar\nConnect Google Calendar to include Calendar Events.');
    expect(rendered.html).toContain('Connect Google Calendar to include Calendar Events.');
    expect(rendered.text).not.toContain('Demo Calendar');
    expect(rendered.html).not.toContain('Demo Calendar');
    expect(calendarEventProvider.fetchEvents).not.toHaveBeenCalled();
  });

  test('does not render a connected Calendar placeholder as available event data', async () => {
    const preview = await buildDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      calendarReadiness: {
        status: 'connected',
        label: 'Calendar',
        statusLabel: 'Calendar connected',
        detail: 'Google Calendar is connected for this User.'
      },
      selectedCalendars: [
        { id: 'work', summary: 'Work', backgroundColor: '#1a73e8', primary: true }
      ]
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain(
      'Calendar\nCalendar preview is unavailable until Calendar Events can be loaded.'
    );
    expect(rendered.text).not.toContain('Google Calendar is connected for this User.');
    expect(rendered.html).not.toContain('Google Calendar is connected for this User.');
  });

  test('renders live selected Calendar Events for a signed-in User preview in local Week Ahead order', async () => {
    const calendarEventProvider = {
      fetchEvents: vi.fn().mockResolvedValue({
        outcome: 'available',
        events: [{
          kind: 'timed',
          id: 'later-today',
          calendarId: 'work',
          calendarSummary: 'Work',
          summary: 'Team retro',
          start: '2026-07-08T16:00:00.000Z',
          end: '2026-07-08T16:30:00.000Z'
        },
        {
          kind: 'timed',
          id: 'early-today',
          calendarId: 'personal',
          calendarSummary: 'Personal',
          summary: 'School drop-off',
          start: '2026-07-08T12:00:00.000Z',
          end: '2026-07-08T12:30:00.000Z'
        },
        {
          kind: 'timed',
          id: 'tomorrow',
          calendarId: 'work',
          calendarSummary: 'Work',
          summary: 'Planning',
          start: '2026-07-09T15:00:00.000Z',
          end: '2026-07-09T16:00:00.000Z'
        },
        {
          kind: 'all-day',
          id: 'all-day-tomorrow',
          calendarId: 'personal',
          calendarSummary: 'Personal',
          summary: 'Conference',
          startDate: '2026-07-09',
          endDate: '2026-07-10'
        }]
      } as const)
    };

    const preview = await buildDailySummaryInput({
      authMode: 'user',
      configuration,
      todoCategories,
      todoTasks,
      calendarReadiness: {
        status: 'connected',
        label: 'Calendar',
        statusLabel: 'Calendar connected',
        detail: 'Google Calendar is connected for this User.'
      },
      selectedCalendars: [
        { id: 'work', summary: 'Work', backgroundColor: '#1a73e8', primary: true },
        { id: 'personal', summary: 'Personal', backgroundColor: '#34a853', primary: false }
      ],
      calendarEventProvider,
      now: new Date('2026-07-08T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(calendarEventProvider.fetchEvents).toHaveBeenCalledWith({
      calendarIds: ['work', 'personal'],
      timeMin: '2026-07-08T04:00:00Z',
      timeMax: '2026-07-15T04:00:00Z',
      timeZone: 'America/New_York'
    });
    expect(rendered.text).toContain('Calendar\nToday\n08:00 School drop-off (Personal)\n12:00 Team retro (Work)');
    expect(rendered.text).toContain('Week Ahead\nThu, Jul 9\nAll day Conference (Personal)\n11:00 Planning (Work)');
    expect(rendered.html).toContain('Today');
    expect(rendered.html).toContain('08:00');
    expect(rendered.html).toContain('School drop-off');
    expect(rendered.html).toContain('Personal');
    expect(rendered.html.indexOf('School drop-off')).toBeLessThan(rendered.html.indexOf('Team retro'));
    expect(rendered.text.indexOf('Weather')).toBeLessThan(rendered.text.indexOf('Calendar'));
    expect(rendered.text.indexOf('Calendar')).toBeLessThan(rendered.text.indexOf('Todo Tasks'));
    expect(JSON.stringify(preview.calendarSection)).toContain('Team retro');
    expect(JSON.stringify(preview.calendarSection)).not.toContain('Draft update');
    expect(JSON.stringify(preview.todoSection)).toContain('Draft update');
    expect(JSON.stringify(preview.todoSection)).not.toContain('Team retro');
  });

  test('renders an empty Calendar state without fetching events when no calendars are selected', async () => {
    const calendarEventProvider = {
      fetchEvents: vi.fn().mockResolvedValue({ outcome: 'available', events: [] } as const)
    };

    const preview = await buildDailySummaryInput({
      authMode: 'user',
      configuration,
      todoCategories,
      todoTasks,
      calendarReadiness: {
        status: 'connected',
        label: 'Calendar',
        statusLabel: 'Calendar connected',
        detail: 'Google Calendar is connected for this User.'
      },
      selectedCalendars: [],
      calendarEventProvider,
      now: new Date('2026-07-08T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(calendarEventProvider.fetchEvents).not.toHaveBeenCalled();
    expect(rendered.text).toContain('Calendar\nNo calendars are selected.');
    expect(rendered.html).toContain('No calendars are selected.');
    expect(rendered.text).not.toContain('unavailable');
  });

  test('renders Calendar provider failures as unavailable without failing other Summary Sections', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calendarEventProvider = {
      fetchEvents: vi.fn().mockRejectedValue(new Error('Private planning title'))
    };

    const preview = await buildDailySummaryInput({
      authMode: 'user',
      configuration,
      todoCategories,
      todoTasks,
      calendarReadiness: {
        status: 'connected',
        label: 'Calendar',
        statusLabel: 'Calendar connected',
        detail: 'Google Calendar is connected for this User.'
      },
      selectedCalendars: [
        { id: 'work', summary: 'Work', backgroundColor: '#1a73e8', primary: true }
      ],
      calendarEventProvider,
      now: new Date('2026-07-08T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain('Calendar\nLive Calendar is unavailable right now.');
    expect(rendered.text).not.toContain('Commute');
    expect(rendered.text).toContain('Buy coffee !');
    expect(rendered.text).not.toContain('Private planning title');
    expect(warn).toHaveBeenCalledWith(
      'Calendar Event provider failed during Daily Summary generation.'
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Private planning title');
    warn.mockRestore();
  });

  test('renders the provider reconnect reason when Calendar credentials were revoked', async () => {
    const calendarEventProvider = {
      fetchEvents: vi.fn().mockResolvedValue({
        outcome: 'unavailable',
        reason: 'Reconnect Google Calendar to include Calendar Events.'
      } as const)
    };

    const preview = await buildDailySummaryInput({
      authMode: 'user',
      configuration,
      todoCategories,
      todoTasks,
      calendarReadiness: {
        status: 'connected',
        label: 'Calendar',
        statusLabel: 'Calendar connected',
        detail: 'Google Calendar is connected for this User.'
      },
      selectedCalendars: [
        { id: 'work', summary: 'Work', backgroundColor: '#1a73e8', primary: true }
      ],
      calendarEventProvider,
      now: new Date('2026-07-08T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain(
      'Calendar\nReconnect Google Calendar to include Calendar Events.'
    );
    expect(rendered.text).not.toContain('Commute');
    expect(rendered.text).toContain('Buy coffee !');
  });

  test('omits signed-in User Calendar output when the Calendar Summary Section is disabled', async () => {
    const calendarEventProvider = {
      fetchEvents: vi.fn().mockResolvedValue({ outcome: 'available', events: [] } as const)
    };
    const preview = await buildDailySummaryInput({
      authMode: 'user',
      configuration: {
        ...configuration,
        sections: {
          ...configuration.sections,
          calendar: false
        }
      },
      todoCategories,
      todoTasks,
      calendarReadiness: {
        status: 'connected',
        label: 'Calendar',
        statusLabel: 'Calendar connected',
        detail: 'Google Calendar is connected for this User.'
      },
      selectedCalendars: [
        { id: 'work', summary: 'Work', backgroundColor: '#1a73e8', primary: true }
      ],
      calendarEventProvider
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).not.toContain('Calendar');
    expect(rendered.html).not.toContain('Calendar');
    expect(rendered.text).not.toContain('Connect Google Calendar');
    expect(rendered.html).not.toContain('Connect Google Calendar');
    expect(rendered.text).not.toContain('Demo Calendar');
    expect(rendered.html).not.toContain('Demo Calendar');
    expect(calendarEventProvider.fetchEvents).not.toHaveBeenCalled();
  });

  test('renders live Weather from Weather Location coordinates in HTML and plain text', async () => {
    const forecastProvider = {
      fetchDailyForecast: vi.fn().mockResolvedValue({
        outcome: 'available',
        forecast: {
          dates: ['2026-07-07'],
          weatherCodes: [61],
          minimumTemperaturesCelsius: [12],
          maximumTemperaturesCelsius: [19],
          precipitationProbabilities: [80]
        }
      })
    };

    const preview = await buildDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      weatherLocation: {
        label: 'Warsaw, Masovian Voivodeship, Poland',
        latitude: 52.2297,
        longitude: 21.0122
      },
      weatherProvider: forecastProvider,
      now: new Date('2026-07-07T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(forecastProvider.fetchDailyForecast).toHaveBeenCalledWith({
      latitude: 52.2297,
      longitude: 21.0122,
      timeZone: 'America/New_York'
    });
    expect(rendered.text).toContain('Weather\nRainy. Low 12C, high 19C. Chance of precipitation 80%.');
    expect(rendered.html).toContain('Rainy. Low 12C, high 19C. Chance of precipitation 80%.');
    expect(rendered.text).not.toContain('Mock Weather');
  });

  test('omits disabled Weather and avoids live Weather provider work', async () => {
    const forecastProvider = {
      fetchDailyForecast: vi.fn().mockResolvedValue({
        outcome: 'available',
        forecast: {
          dates: ['2026-07-07'],
          weatherCodes: [61],
          minimumTemperaturesCelsius: [12],
          maximumTemperaturesCelsius: [19],
          precipitationProbabilities: [80]
        }
      })
    };

    const preview = await buildDailySummaryInput({
      configuration: {
        ...configuration,
        sections: {
          ...configuration.sections,
          weather: false
        }
      },
      todoCategories,
      todoTasks,
      weatherLocation: {
        label: 'Warsaw, Masovian Voivodeship, Poland',
        latitude: 52.2297,
        longitude: 21.0122
      },
      weatherProvider: forecastProvider,
      now: new Date('2026-07-07T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(forecastProvider.fetchDailyForecast).not.toHaveBeenCalled();
    expect(rendered.text).not.toContain('Weather');
    expect(rendered.html).not.toContain('Weather');
  });

  test('renders unavailable Weather from provider failure while keeping other sections visible', async () => {
    const forecastProvider = {
      fetchDailyForecast: vi.fn().mockResolvedValue({
        outcome: 'unavailable',
        reason: 'Live weather is unavailable right now.'
      })
    };

    const preview = await buildDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      weatherLocation: {
        label: 'Warsaw, Masovian Voivodeship, Poland',
        latitude: 52.2297,
        longitude: 21.0122
      },
      weatherProvider: forecastProvider,
      now: new Date('2026-07-07T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain('Weather\nLive weather is unavailable right now.');
    expect(rendered.text).not.toContain('Commute');
    expect(rendered.text).toContain('Demo Calendar');
    expect(rendered.text).toContain('Buy coffee !');
  });

  test('keeps provider placeholders out of the persisted User setup shape', async () => {
    const preview = await buildDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks
    });

    const persistedUserSetup = {
      summaryConfiguration: configuration,
      todoCategories,
      todoTasks,
      nextTodoId: 3
    };

    expect(preview.sections.commute).toMatchObject({ label: 'Commute' });
    expect(preview.sections.calendar).toMatchObject({ label: 'Demo Calendar' });
    expect(persistedUserSetup).not.toHaveProperty('weather');
    expect(persistedUserSetup).not.toHaveProperty('commute');
    expect(persistedUserSetup).not.toHaveProperty('calendar');
    expect(persistedUserSetup).not.toHaveProperty('sections');
  });

  test('omits empty Todo content instead of rendering it as unavailable in preview', async () => {
    const preview = await buildDailySummaryInput({
      configuration: {
        ...configuration,
        sections: {
          weather: false,
          commute: false,
          calendar: false,
          todo: true
        }
      },
      todoCategories,
      todoTasks: []
    });

    const rendered = renderDailySummary(preview);

    expect(rendered.html).not.toContain('Todo');
    expect(rendered.text).not.toContain('Todo');
    expect(rendered.text).not.toContain('No active Todo Tasks.');
  });
});
