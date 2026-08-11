import { describe, expect, test, vi } from 'vitest';
import {
  createDailySummaryGenerator,
  type DailySummaryGenerationContext,
  type DailySummaryGenerationOptions
} from './dailySummaryGeneration/internal';
import { visitorDailySummaryGenerator } from './dailySummaryGeneration';
import { renderDailySummary } from './dailySummaryRenderer';
import { createDefaultLocalSetup } from './localSetup';
import type { SummaryConfiguration } from './summaryConfiguration';
import type { TodoCategory, TodoTask } from './todo';
import type { CommuteRoute } from './commuteRoute';
import type { CalendarProviderEvent, LoadedCalendarEvents } from './calendar';
import { calendarReadinessForAuthMode } from './calendarReadiness';
import type { SavedSelectedCalendar } from './selectedCalendars';

const configuration: SummaryConfiguration = {
  summaryTime: '18:45',
  userTimeZone: 'America/New_York',
  summaryDeliveryEnabled: true,
  sectionPauses: {
    weather: false,
    commute: false,
    calendar: false,
    todo: false
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

const connectedCalendarEvents = (
  selectedCalendars: SavedSelectedCalendar[],
  eventResult: LoadedCalendarEvents['eventResult'] = { outcome: 'not-requested' }
): LoadedCalendarEvents => ({
  readiness: {
    status: 'connected',
    label: 'Calendar',
    statusLabel: 'Calendar connected',
    detail: 'Google Calendar is connected for this User.'
  },
  selectedCalendars,
  eventResult
});

const generateDailySummaryInput = async (
  setup: DailySummaryGenerationContext & DailySummaryGenerationOptions
) => {
  const { now, openDailyUrl, ...context } = setup;
  const generator = createDailySummaryGenerator<void>({
    source: { load: () => context }
  });

  return (await generator.generate(undefined, { now, openDailyUrl })).input;
};

type SectionContent<Section> = Section extends { content?: infer Content } ? Content : never;

const sectionContent = <Section extends object>(section: Section): SectionContent<Section> | null =>
  ('content' in section ? section.content : null) as SectionContent<Section> | null;

describe('Daily Summary generation', () => {
  test('generates a rendered Visitor Daily Summary from one Local Setup request', async () => {
    const result = await visitorDailySummaryGenerator.generate(createDefaultLocalSetup(), {
      now: new Date('2026-07-08T10:00:00.000Z'),
      openDailyUrl: 'https://daily.example/'
    });

    expect(result.input.generatedAt).toEqual(new Date('2026-07-08T10:00:00.000Z'));
    expect(result.rendered.text).toContain('Demo Calendar');
    expect(result.rendered.html).toContain('href="https://daily.example/"');
  });

  test('renders validated Weather facts and an optional Luna sentence without leaking location data', async () => {
    const summaryInput = {
      units: {
        temperature: 'celsius' as const,
        precipitationProbability: 'percent' as const,
        precipitation: 'millimetres' as const,
        snowfall: 'centimetres' as const,
        wind: 'kilometres_per_hour' as const
      },
      current: { temperature: 18 },
      day: {
        weatherCode: 2,
        minimumTemperature: 12,
        maximumTemperature: 22,
        maximumPrecipitationProbability: 35,
        maximumWindSpeed: 24,
        maximumWindGust: 39
      },
      remainingHours: [{
        localTime: '07:00',
        temperature: 17,
        precipitationProbability: 5,
        precipitation: 0,
        snowfall: 0,
        weatherCode: 2,
        windSpeed: 11,
        windGust: 19
      }]
    };
    const weatherProvider = {
      fetchDailyForecast: vi.fn().mockResolvedValue({
        outcome: 'available',
        forecast: {
          dates: ['2026-07-08'],
          weatherCodes: [2],
          minimumTemperaturesCelsius: [12],
          maximumTemperaturesCelsius: [22],
          precipitationProbabilities: [35],
          currentTemperatureCelsius: 18,
          observedAtLocal: '2026-07-08T07:15',
          maximumWindSpeedsKmh: [24],
          maximumWindGustsKmh: [39],
          summaryInput
        }
      }),
      weatherSummaryProvider: {
        summarize: vi.fn().mockResolvedValue({
          outcome: 'available',
          sentence: 'Clouds clear by noon.'
        })
      }
    };

    const input = await generateDailySummaryInput({
      configuration: { ...configuration, userTimeZone: 'UTC' },
      todoCategories: [],
      todoTasks: [],
      weatherLocation: {
        label: 'Private City',
        latitude: 52.2297,
        longitude: 21.0122
      },
      weatherProvider,
      weatherSummaryProvider: weatherProvider.weatherSummaryProvider,
      now: new Date('2026-07-08T07:15:00.000Z'),
      openDailyUrl: 'https://daily.example.com/'
    });
    const rendered = renderDailySummary(input);

    expect(weatherProvider.weatherSummaryProvider.summarize).toHaveBeenCalledWith(summaryInput);
    expect(rendered.html).toContain('>18C</p>');
    expect(rendered.html).toContain('Low 12C, high 22C');
    expect(rendered.html).toContain('Wind up to 24 km/h');
    expect(rendered.html).toContain('Clouds clear by noon.');
    expect(rendered.html).toContain('https://daily.example.com/weather-icons/partly-cloudy.png');
    expect(rendered.text).toContain('Clouds clear by noon.');
    expect(rendered.text).toContain('Chance of precipitation 35%.');
    expect(rendered.html).not.toContain('Private City');
    expect(rendered.text).not.toContain('Private City');
  });

  test('renders saved baseline estimates without provider requests on the local Commute Day', async () => {
    const routes: CommuteRoute[] = [
      { id: 'office', name: 'Office', days: ['wednesday'], enabled: true, previewDurationMinutes: 31, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'Office', latitude: 40.7, longitude: -74 } },
      { id: 'gym', name: 'Gym', days: ['wednesday'], enabled: false, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'Gym', latitude: 40.5, longitude: -73.8 } },
      { id: 'school', name: 'School run', days: ['wednesday'], enabled: true, previewDurationMinutes: 14, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'School', latitude: 40.6, longitude: -73.7 } }
    ];
    const commuteEstimateProvider = {
      estimateCommute: vi.fn().mockRejectedValue(new Error('preview must not call Routes API'))
    };

    const preview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      commuteRoutes: routes,
      commuteDays: ['wednesday'],
      commuteEstimateProvider,
      now: new Date('2026-07-09T02:30:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(commuteEstimateProvider.estimateCommute).not.toHaveBeenCalled();
    expect(rendered.text).toContain('Commute\nOffice: 31 minutes\nSchool run: 14 minutes');
    expect(rendered.html).toContain('Office: 31 minutes');
    expect(rendered.html).toContain('School run: 14 minutes');
    expect(rendered.text).not.toContain('Gym');
  });

  test('includes only enabled Commute Routes scheduled for the local weekday', async () => {
    const routes: CommuteRoute[] = [
      {
        id: 'route-wednesday',
        name: 'Office',
        origin: { label: 'Home', latitude: 52.1, longitude: 21.1 },
        destination: { label: 'Office', latitude: 52.2, longitude: 21.2 },
        days: ['wednesday'],
        enabled: true,
        previewDurationMinutes: 24
      },
      {
        id: 'route-friday',
        name: 'Gym',
        origin: { label: 'Home', latitude: 52.1, longitude: 21.1 },
        destination: { label: 'Gym', latitude: 52.3, longitude: 21.3 },
        days: ['friday'],
        enabled: true,
        previewDurationMinutes: 18
      }
    ];

    const input = await generateDailySummaryInput({
      configuration: { ...configuration, userTimeZone: 'UTC' },
      todoCategories: [],
      todoTasks: [],
      commuteRoutes: routes,
      commuteDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      now: new Date('2026-07-29T06:00:00.000Z')
    });

    expect(sectionContent(input.sections.commute)?.estimates).toEqual([
      expect.objectContaining({ routeName: 'Office' })
    ]);
  });

  test('keeps route-labeled Commute in fixed HTML and text order with the canonical appearance', async () => {
    const preview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      commuteRoutes: [{ id: 'office', name: 'Office', days: ['wednesday'], enabled: true, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'Office', latitude: 40.7, longitude: -74 } }],
      commuteDays: ['wednesday'],
      commuteEstimateMode: 'live',
      commuteEstimateProvider: { estimateCommute: vi.fn().mockResolvedValue({ outcome: 'available', estimate: { durationMinutes: 24, staticDurationMinutes: 20 } }) },
      weatherLocation: { label: 'New York', latitude: 40.7, longitude: -74 },
      weatherProvider: { fetchDailyForecast: vi.fn().mockResolvedValue({ outcome: 'available', forecast: { daily: { time: ['2026-07-08'], weather_code: [0], temperature_2m_min: [18], temperature_2m_max: [27], precipitation_probability_max: [5] } } }) },
      now: new Date('2026-07-09T02:30:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    for (const output of [rendered.html, rendered.text]) {
      expect(output.indexOf('Weather')).toBeLessThan(output.indexOf('Commute'));
      expect(output.indexOf('Commute')).toBeLessThan(output.indexOf('Calendar'));
      expect(output.indexOf('Calendar')).toBeLessThan(output.indexOf('Todo'));
      expect(output).toContain('Office: 24 minutes');
    }
  });

  test('keeps available route estimates when another route is unavailable', async () => {
    const commuteEstimateProvider = {
      estimateCommute: vi.fn()
        .mockResolvedValueOnce({ outcome: 'unavailable', reason: 'route-unavailable' } as const)
        .mockResolvedValueOnce({ outcome: 'available', estimate: { durationMinutes: 11, staticDurationMinutes: 10 } } as const)
    };
    const routes: CommuteRoute[] = [
      { id: 'office', name: 'Office', days: ['wednesday'], enabled: true, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'Office', latitude: 40.7, longitude: -74 } },
      { id: 'school', name: 'School run', days: ['wednesday'], enabled: true, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'School', latitude: 40.6, longitude: -73.7 } }
    ];

    const preview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      commuteRoutes: routes,
      commuteDays: ['wednesday'],
      commuteEstimateMode: 'live',
      commuteEstimateProvider,
      now: new Date('2026-07-09T02:30:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain('Commute\nOffice: Commute estimate unavailable.\nSchool run: 11 minutes — Moderate traffic');
    expect(rendered.html).toContain('Office: Commute estimate unavailable.');
    expect(rendered.html).toContain('School run: 11 minutes');
  });

  test('classifies lossless live durations and preserves saved route hierarchy and order', async () => {
    const commuteEstimateProvider = {
      estimateCommute: vi.fn()
        .mockResolvedValueOnce({
          outcome: 'available',
          estimate: { durationMinutes: 25.5, staticDurationMinutes: 20 }
        } as const)
        .mockResolvedValueOnce({
          outcome: 'available',
          estimate: { durationMinutes: 22, staticDurationMinutes: 20 }
        } as const)
    };
    const routes: CommuteRoute[] = [
      {
        id: 'office',
        name: 'Office',
        days: ['wednesday'],
        enabled: true,
        origin: { label: 'Mokotów', latitude: 52.1, longitude: 21.1 },
        destination: { label: 'Rondo Daszyńskiego', latitude: 52.2, longitude: 21.2 }
      },
      {
        id: 'school',
        name: 'School run',
        days: ['wednesday'],
        enabled: true,
        origin: { label: 'Mokotów', latitude: 52.1, longitude: 21.1 },
        destination: { label: 'Primary school', latitude: 52.3, longitude: 21.3 }
      }
    ];

    const input = await generateDailySummaryInput({
      configuration: { ...configuration, userTimeZone: 'UTC' },
      todoCategories: [],
      todoTasks,
      commuteRoutes: routes,
      commuteEstimateMode: 'live',
      commuteEstimateProvider,
      now: new Date('2026-07-08T06:00:00.000Z')
    });

    expect(commuteEstimateProvider.estimateCommute).toHaveBeenCalledTimes(2);
    expect(sectionContent(input.sections.commute)?.estimates).toEqual([
      {
        routeName: 'Office',
        originLabel: 'Mokotów',
        destinationLabel: 'Rondo Daszyńskiego',
        outcome: 'available',
        durationMinutes: 26,
        trafficLevel: 'heavy',
        trafficDescription: 'Heavy traffic'
      },
      {
        routeName: 'School run',
        originLabel: 'Mokotów',
        destinationLabel: 'Primary school',
        outcome: 'available',
        durationMinutes: 22,
        trafficLevel: 'moderate',
        trafficDescription: 'Moderate traffic'
      }
    ]);
  });

  test.each([
    [0, 0, 'light'],
    [12, 0, 'heavy'],
    [0, 20, 'light'],
    [20, 20, 'light'],
    [22, 20, 'moderate'],
    [25, 20, 'heavy'],
    [19.999, 20, 'light']
  ] as const)('applies the Commute Traffic Level rule to %s/%s minutes', async (
    durationMinutes,
    staticDurationMinutes,
    trafficLevel
  ) => {
    const input = await generateDailySummaryInput({
      configuration: { ...configuration, userTimeZone: 'UTC' },
      todoCategories: [],
      todoTasks: [],
      commuteRoutes: [{
        id: 'office',
        name: 'Office',
        days: ['wednesday'],
        enabled: true,
        origin: { label: 'Home', latitude: 52.1, longitude: 21.1 },
        destination: { label: 'Office', latitude: 52.2, longitude: 21.2 }
      }],
      commuteEstimateMode: 'live',
      commuteEstimateProvider: {
        estimateCommute: vi.fn().mockResolvedValue({
          outcome: 'available',
          estimate: { durationMinutes, staticDurationMinutes }
        })
      },
      now: new Date('2026-07-08T06:00:00.000Z')
    });

    expect(sectionContent(input.sections.commute)?.estimates[0]).toEqual(expect.objectContaining({
      outcome: 'available',
      durationMinutes: Math.round(durationMinutes),
      trafficLevel
    }));
  });

  test('keeps one route failure local when another live route succeeds', async () => {
    const input = await generateDailySummaryInput({
      configuration: { ...configuration, userTimeZone: 'UTC' },
      todoCategories: [],
      todoTasks: [],
      commuteRoutes: [
        {
          id: 'office',
          name: 'Office',
          days: ['wednesday'],
          enabled: true,
          origin: { label: 'Home', latitude: 52.1, longitude: 21.1 },
          destination: { label: 'Office', latitude: 52.2, longitude: 21.2 }
        },
        {
          id: 'school',
          name: 'School run',
          days: ['wednesday'],
          enabled: true,
          origin: { label: 'Home', latitude: 52.1, longitude: 21.1 },
          destination: { label: 'School', latitude: 52.3, longitude: 21.3 }
        }
      ],
      commuteEstimateMode: 'live',
      commuteEstimateProvider: {
        estimateCommute: vi.fn()
          .mockResolvedValueOnce({ outcome: 'unavailable', reason: 'provider-unavailable' } as const)
          .mockResolvedValueOnce({
            outcome: 'available',
            estimate: { durationMinutes: 11, staticDurationMinutes: 10 }
          } as const)
      },
      now: new Date('2026-07-08T06:00:00.000Z')
    });

    expect(input.sections.commute.status).toBe('active');
    expect(sectionContent(input.sections.commute)?.estimates).toEqual([
      { routeName: 'Office', originLabel: 'Home', destinationLabel: 'Office', outcome: 'unavailable' },
      expect.objectContaining({ routeName: 'School run', outcome: 'available', trafficLevel: 'moderate' })
    ]);
  });

  test('keeps a successful route when another route hits a systemic suspension', async () => {
    const input = await generateDailySummaryInput({
      configuration: { ...configuration, userTimeZone: 'UTC' },
      todoCategories: [],
      todoTasks: [],
      commuteRoutes: [
        {
          id: 'office',
          name: 'Office',
          days: ['wednesday'],
          enabled: true,
          origin: { label: 'Home', latitude: 52.1, longitude: 21.1 },
          destination: { label: 'Office', latitude: 52.2, longitude: 21.2 }
        },
        {
          id: 'school',
          name: 'School run',
          days: ['wednesday'],
          enabled: true,
          origin: { label: 'Home', latitude: 52.1, longitude: 21.1 },
          destination: { label: 'School', latitude: 52.3, longitude: 21.3 }
        }
      ],
      commuteEstimateMode: 'live',
      commuteEstimateProvider: {
        estimateCommute: vi.fn()
          .mockResolvedValueOnce({ outcome: 'unavailable', reason: 'global-daily-cap' } as const)
          .mockResolvedValueOnce({
            outcome: 'available',
            estimate: { durationMinutes: 11, staticDurationMinutes: 10 }
          } as const)
      },
      now: new Date('2026-07-08T06:00:00.000Z')
    });

    expect(input.sections.commute.status).toBe('active');
    expect(sectionContent(input.sections.commute)?.estimates).toEqual([
      { routeName: 'Office', originLabel: 'Home', destinationLabel: 'Office', outcome: 'unavailable' },
      expect.objectContaining({ routeName: 'School run', outcome: 'available', trafficLevel: 'moderate' })
    ]);
  });

  test('turns an all-route systemic failure into unavailable Commute', async () => {
    const input = await generateDailySummaryInput({
      configuration: { ...configuration, userTimeZone: 'UTC' },
      todoCategories: [],
      todoTasks: [],
      commuteRoutes: [{
        id: 'office',
        name: 'Office',
        days: ['wednesday'],
        enabled: true,
        origin: { label: 'Home', latitude: 52.1, longitude: 21.1 },
        destination: { label: 'Office', latitude: 52.2, longitude: 21.2 }
      }],
      commuteEstimateMode: 'live',
      commuteEstimateProvider: {
        estimateCommute: vi.fn().mockResolvedValue({
          outcome: 'unavailable',
          reason: 'global-daily-cap'
        } as const)
      },
      now: new Date('2026-07-08T06:00:00.000Z')
    });

    expect(input.sections.commute).toEqual({
      status: 'unavailable',
      reason: 'Live Commute is unavailable right now.'
    });
    expect(sectionContent(input.sections.commute)).toBeNull();
  });

  test.each([
    ['paused section', { sectionPauses: { ...configuration.sectionPauses, commute: true } }, ['wednesday']],
    ['non-Commute Day', {}, ['thursday']],
    ['empty weekday selection', {}, []]
  ] as const)('keeps the Commute state visible without estimate requests for %s', async (_case, configurationPatch, commuteDays) => {
    const commuteEstimateProvider = { estimateCommute: vi.fn() };
    const preview = await generateDailySummaryInput({
      configuration: { ...configuration, ...configurationPatch },
      todoCategories,
      todoTasks,
      commuteRoutes: [{ id: 'office', name: 'Office', days: [...commuteDays], enabled: true, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'Office', latitude: 40.7, longitude: -74 } }],
      commuteDays,
      commuteEstimateProvider,
      now: new Date('2026-07-09T02:30:00.000Z')
    });

    expect(commuteEstimateProvider.estimateCommute).not.toHaveBeenCalled();
    expect(renderDailySummary(preview).text).toContain('\nCommute\n');
    expect(renderDailySummary(preview).text).not.toContain('Office:');
  });

  test('keeps a protected estimate suspension local to the Commute Section', async () => {
    const preview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      commuteRoutes: [{ id: 'office', name: 'Office', days: ['wednesday'], enabled: true, origin: { label: 'Home', latitude: 40.1, longitude: -73.9 }, destination: { label: 'Office', latitude: 40.7, longitude: -74 } }],
      commuteDays: ['wednesday'],
      commuteEstimateMode: 'live',
      commuteEstimateProvider: { estimateCommute: vi.fn().mockResolvedValue({ outcome: 'unavailable', reason: 'global-daily-cap' }) },
      now: new Date('2026-07-09T02:30:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain('Commute\nUnavailable\nLive Commute is unavailable right now.');
    expect(rendered.text).toContain('Demo Calendar');
    expect(rendered.text).toContain('Todo\nUncategorized');
  });
  test('renders Visitor setup with Demo Calendar through the Daily Summary input shape', async () => {
    const visitorPreview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks
    });

    expect(renderDailySummary(visitorPreview).text).toContain('Weather\nNot configured\nChoose a Weather Location to include local weather.');
    expect(renderDailySummary(visitorPreview).text).toContain('Commute\nNot configured\nAdd a Commute Route');
    expect(renderDailySummary(visitorPreview).text).toContain('Demo Calendar');
    expect(renderDailySummary(visitorPreview).text).toContain('Buy coffee — Medium urgency');
    expect(renderDailySummary(visitorPreview).text).toContain('Work\nDraft update — High urgency');
  });

  test('renders signed-in User Calendar as unavailable until Calendar is connected', async () => {
    const preview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      calendarEvents: {
        readiness: calendarReadinessForAuthMode('user'),
        selectedCalendars: [],
        eventResult: { outcome: 'not-requested' }
      }
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain('Calendar\nNot configured\nConnect Google Calendar to include Calendar Events.');
    expect(rendered.html).toContain('Connect Google Calendar to include Calendar Events.');
    expect(rendered.text).not.toContain('Demo Calendar');
    expect(rendered.html).not.toContain('Demo Calendar');
  });

  test('does not render a connected Calendar placeholder as available event data', async () => {
    const preview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      calendarEvents: connectedCalendarEvents([
        { id: 'work', summary: 'Work', backgroundColor: '#1a73e8', primary: true }
      ])
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain(
      'Calendar\nUnavailable\nCalendar preview is unavailable until Calendar Events can be loaded.'
    );
    expect(rendered.text).not.toContain('Google Calendar is connected for this User.');
    expect(rendered.html).not.toContain('Google Calendar is connected for this User.');
  });

  test('renders live selected Calendar Events for a signed-in User preview in local Week Ahead order', async () => {
    const events: CalendarProviderEvent[] = [{
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
        }];

    const preview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      calendarEvents: connectedCalendarEvents(
        [
          { id: 'work', summary: 'Work', backgroundColor: '#1a73e8', primary: true },
          { id: 'personal', summary: 'Personal', backgroundColor: '#34a853', primary: false }
        ],
        { outcome: 'available', events }
      ),
      now: new Date('2026-07-08T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain('Calendar\nToday\n08:00 School drop-off (Personal)\n12:00 Team retro (Work)');
    expect(rendered.text).toContain('Week Ahead\nThu, Jul 9\nAll day Conference (Personal)\n11:00 Planning (Work)');
    expect(rendered.html).toContain('Today');
    expect(rendered.html).toContain('08:00');
    expect(rendered.html).toContain('School drop-off');
    expect(rendered.html).toContain('Personal');
    expect(rendered.html.indexOf('School drop-off')).toBeLessThan(rendered.html.indexOf('Team retro'));
    expect(rendered.text.indexOf('Weather')).toBeLessThan(rendered.text.indexOf('Calendar'));
    expect(rendered.text.indexOf('Calendar')).toBeLessThan(rendered.text.indexOf('Todo'));
    expect(JSON.stringify(sectionContent(preview.sections.calendar))).toContain('Team retro');
    expect(JSON.stringify(sectionContent(preview.sections.calendar))).not.toContain('Draft update');
    expect(JSON.stringify(sectionContent(preview.sections.todo))).toContain('Draft update');
    expect(JSON.stringify(sectionContent(preview.sections.todo))).not.toContain('Team retro');
  });

  test('keeps the seven-day Calendar structure when selected calendars have no eligible events', async () => {
    const preview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      calendarEvents: connectedCalendarEvents(
        [{ id: 'work', summary: 'Work', backgroundColor: '#1a73e8', primary: true }],
        { outcome: 'available', events: [] }
      ),
      now: new Date('2026-07-08T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(preview.sections.calendar).toMatchObject({
      status: 'empty',
      detail: 'No Calendar Events in the Week Ahead.'
    });
    const calendarSection = sectionContent(preview.sections.calendar);
    expect(calendarSection).not.toBeNull();
    expect([calendarSection?.today, ...(calendarSection?.weekAhead ?? [])]).toHaveLength(7);
    expect(rendered.text).toContain('Calendar\nNothing scheduled\nNo Calendar Events in the Week Ahead.');
    for (const label of ['Today', 'Thu, Jul 9', 'Fri, Jul 10', 'Sat, Jul 11', 'Sun, Jul 12', 'Mon, Jul 13', 'Tue, Jul 14']) {
      expect(rendered.text).toContain(label);
    }
  });

  test('renders an unconfigured Calendar state when no calendars are selected', async () => {
    const preview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      calendarEvents: connectedCalendarEvents([]),
      now: new Date('2026-07-08T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain('Calendar\nNot configured\nSelect a Calendar to include Calendar Events.');
    expect(rendered.html).toContain('Select a Calendar to include Calendar Events.');
    expect(rendered.text).not.toContain('unavailable');
  });

  test('renders Calendar provider failures as unavailable without failing other Summary Sections', async () => {
    const preview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      calendarEvents: connectedCalendarEvents(
        [{ id: 'work', summary: 'Work', backgroundColor: '#1a73e8', primary: true }],
        { outcome: 'unavailable', reason: 'Live Calendar is unavailable right now.' }
      ),
      now: new Date('2026-07-08T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain('Calendar\nUnavailable\nLive Calendar is unavailable right now.');
    expect(rendered.text).toContain('Commute');
    expect(rendered.text).toContain('Buy coffee — Medium urgency');
  });

  test('renders the provider reconnect reason when Calendar credentials were revoked', async () => {
    const preview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      calendarEvents: connectedCalendarEvents(
        [{ id: 'work', summary: 'Work', backgroundColor: '#1a73e8', primary: true }],
        { outcome: 'unavailable', reason: 'Reconnect Google Calendar to include Calendar Events.' }
      ),
      now: new Date('2026-07-08T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain(
      'Calendar\nUnavailable\nReconnect Google Calendar to include Calendar Events.'
    );
    expect(rendered.text).toContain('Commute');
    expect(rendered.text).toContain('Buy coffee — Medium urgency');
  });

  test('does not expose an arbitrary Calendar provider failure reason', async () => {
    const preview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      calendarEvents: connectedCalendarEvents(
        [{ id: 'work', summary: 'Work', backgroundColor: '#1a73e8', primary: true }],
        {
          outcome: 'unavailable',
          reason: 'Private raw provider response with event title'
        }
      ),
      now: new Date('2026-07-08T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain('Calendar\nUnavailable\nLive Calendar is unavailable right now.');
    expect(rendered.text).not.toContain('Private raw provider response with event title');
    expect(rendered.html).not.toContain('Private raw provider response with event title');
  });

  test('keeps signed-in User Calendar paused when the Summary Section is disabled', async () => {
    const preview = await generateDailySummaryInput({
      configuration: {
        ...configuration,
        sectionPauses: { ...configuration.sectionPauses, calendar: true }
      },
      todoCategories,
      todoTasks,
      calendarEvents: connectedCalendarEvents(
        [{ id: 'work', summary: 'Work', backgroundColor: '#1a73e8', primary: true }],
        { outcome: 'available', events: [] }
      )
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain('Calendar\nPaused\nCalendar is paused.');
    expect(rendered.html).toContain('>Calendar</h2>');
    expect(rendered.text).not.toContain('Connect Google Calendar');
    expect(rendered.html).not.toContain('Connect Google Calendar');
    expect(rendered.text).not.toContain('Demo Calendar');
    expect(rendered.html).not.toContain('Demo Calendar');
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

    const preview = await generateDailySummaryInput({
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
      timeZone: 'America/New_York',
      targetDate: '2026-07-07'
    });
    expect(rendered.text).toContain('Weather\nRainy. Low 12C, high 19C. Chance of precipitation 80%.');
    expect(rendered.html).toContain('Rainy. Low 12C, high 19C. Chance of precipitation 80%.');
    expect(rendered.text).not.toContain('Mock Weather');
  });

  test('keeps disabled Weather paused and avoids live Weather provider work', async () => {
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
    const weatherSummaryProvider = {
      summarize: vi.fn()
    };

    const preview = await generateDailySummaryInput({
      configuration: {
        ...configuration,
        sectionPauses: { ...configuration.sectionPauses, weather: true }
      },
      todoCategories,
      todoTasks,
      weatherLocation: {
        label: 'Warsaw, Masovian Voivodeship, Poland',
        latitude: 52.2297,
        longitude: 21.0122
      },
      weatherProvider: forecastProvider,
      weatherSummaryProvider,
      now: new Date('2026-07-07T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(forecastProvider.fetchDailyForecast).not.toHaveBeenCalled();
    expect(weatherSummaryProvider.summarize).not.toHaveBeenCalled();
    expect(rendered.text).toContain('Weather\nPaused\nWeather is paused.');
    expect(rendered.html).toContain('>Weather</h2>');
  });

  test('keeps Weather unconfigured and avoids live providers without a location', async () => {
    const forecastProvider = {
      fetchDailyForecast: vi.fn()
    };
    const weatherSummaryProvider = {
      summarize: vi.fn()
    };

    const preview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      weatherProvider: forecastProvider,
      weatherSummaryProvider,
      now: new Date('2026-07-07T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(forecastProvider.fetchDailyForecast).not.toHaveBeenCalled();
    expect(weatherSummaryProvider.summarize).not.toHaveBeenCalled();
    expect(rendered.text).toContain('Weather\nNot configured\nChoose a Weather Location to include local weather.');
  });

  test('renders unavailable Weather from provider failure while keeping other sections visible', async () => {
    const forecastProvider = {
      fetchDailyForecast: vi.fn().mockResolvedValue({
        outcome: 'unavailable',
        reason: 'Live weather is unavailable right now.'
      })
    };

    const preview = await generateDailySummaryInput({
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

    expect(rendered.text).toContain('Weather\nUnavailable\nLive weather is unavailable right now.');
    expect(rendered.text).toContain('Commute');
    expect(rendered.text).toContain('Demo Calendar');
    expect(rendered.text).toContain('Buy coffee — Medium urgency');
  });

  test('keeps provider placeholders out of the persisted User setup shape', async () => {
    const preview = await generateDailySummaryInput({
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

    expect(preview.sections.commute.status).toBe('unconfigured');
    expect(preview.sections.calendar.status).toBe('active');
    expect(persistedUserSetup).not.toHaveProperty('weather');
    expect(persistedUserSetup).not.toHaveProperty('commute');
    expect(persistedUserSetup).not.toHaveProperty('calendar');
    expect(persistedUserSetup).not.toHaveProperty('sections');
  });

  test('renders empty Todo content as an explicit state in preview', async () => {
    const preview = await generateDailySummaryInput({
      configuration: {
        ...configuration,
        sectionPauses: { weather: true, commute: true, calendar: true, todo: false }
      },
      todoCategories,
      todoTasks: []
    });

    const rendered = renderDailySummary(preview);

    expect(rendered.html).toContain('>Todo</h2>');
    expect(rendered.text).toContain('Todo\nNothing scheduled\nThere are no active Todo Tasks.');
  });

  test('renders Todo as unavailable when its state cannot be loaded', async () => {
    const preview = await generateDailySummaryInput({
      configuration,
      todoCategories,
      todoTasks,
      todoStateUnavailable: true
    });
    const rendered = renderDailySummary(preview);

    expect(sectionContent(preview.sections.todo)).toBeNull();
    expect(preview.sections.todo).toEqual({
      status: 'unavailable',
      reason: 'Todo data is temporarily unavailable.'
    });
    expect(rendered.text).toContain(
      'Todo\nUnavailable\nTodo data is temporarily unavailable.'
    );
    expect(rendered.text).not.toContain('Buy coffee');
  });

  test('keeps paused Todo ahead of an unavailable Todo state', async () => {
    const preview = await generateDailySummaryInput({
      configuration: {
        ...configuration,
        sectionPauses: { ...configuration.sectionPauses, todo: true }
      },
      todoCategories,
      todoTasks,
      todoStateUnavailable: true
    });
    const rendered = renderDailySummary(preview);

    expect(preview.sections.todo).toEqual({
      status: 'paused',
      detail: 'Todo is paused.'
    });
    expect(rendered.text).toContain('Todo\nPaused\nTodo is paused.');
    expect(rendered.text).not.toContain('Todo data is temporarily unavailable.');
  });
});
