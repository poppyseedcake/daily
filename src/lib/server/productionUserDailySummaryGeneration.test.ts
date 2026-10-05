import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { db } from '$lib/server/db';
import { defaultSummaryConfiguration } from '$lib/summaryConfiguration';
import { calendarReadinessForAuthMode } from '$lib/calendarReadiness';

vi.mock('$env/dynamic/private', () => ({ env: { OPENAI_API_KEY: 'private-api-key' } }));
vi.mock('$lib/server/db', async () => {
  const { default: Database } = await import('better-sqlite3');
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const { readFileSync, readdirSync } = await import('node:fs');
  const schema = await import('./db/schema');
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const migration of readdirSync('drizzle').filter((file) => file.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(`drizzle/${migration}`, 'utf8'));
  }
  return { db: drizzle(sqlite, { schema }) };
});

const fetcher = vi.fn<typeof fetch>();
let createProductionUserDailySummaryGenerator:
  typeof import('./productionUserDailySummaryGeneration')['createProductionUserDailySummaryGenerator'];

const configuration = {
  ...defaultSummaryConfiguration,
  sectionPauses: { weather: false, commute: true, calendar: true, todo: true }
};
const generatedAt = new Date('2026-07-07T07:15:00Z');

beforeAll(async () => {
  // Production adapters capture fetch when their modules are loaded.
  vi.stubGlobal('fetch', fetcher);
  ({ createProductionUserDailySummaryGenerator } = await import('./productionUserDailySummaryGeneration'));
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(generatedAt);
  fetcher.mockReset();
  db.$client.prepare('insert into users (id, google_subject, email) values (?, ?, ?)')
    .run('private-user', 'private-google-subject', 'private@example.com');
  db.$client.prepare(`insert into summary_configurations
    (id, user_id, commute_section_paused, calendar_section_paused, todo_section_paused)
    values (?, ?, 1, 1, 1)`).run('configuration', 'private-user');
  db.$client.prepare(`insert into weather_locations
    (id, user_id, label, latitude, longitude) values (?, ?, ?, ?, ?)`)
    .run('weather', 'private-user', 'Private City', 52.2297, 21.0122);
});

afterEach(() => {
  db.$client.prepare('delete from users').run();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.unstubAllGlobals();
  db.$client.close();
});

const forecastPayload = (withHourlyContext: boolean) => ({
  current_units: { time: 'iso8601', temperature_2m: '°C' },
  current: { time: '2026-07-07T07:15', temperature_2m: 18 },
  daily_units: {
    time: 'iso8601', weather_code: 'wmo code', temperature_2m_min: '°C',
    temperature_2m_max: '°C', precipitation_probability_max: '%',
    wind_speed_10m_max: 'km/h', wind_gusts_10m_max: 'km/h'
  },
  daily: {
    time: ['2026-07-07'], weather_code: [2], temperature_2m_min: [12],
    temperature_2m_max: [22], precipitation_probability_max: [35],
    wind_speed_10m_max: [24], wind_gusts_10m_max: [39]
  },
  ...(withHourlyContext ? {
    hourly_units: {
      time: 'iso8601', temperature_2m: '°C', precipitation_probability: '%',
      precipitation: 'mm', snowfall: 'cm', weather_code: 'wmo code',
      wind_speed_10m: 'km/h', wind_gusts_10m: 'km/h'
    },
    hourly: {
      time: ['2026-07-07T07:00'], temperature_2m: [17], precipitation_probability: [5],
      precipitation: [0], snowfall: [0], weather_code: [2], wind_speed_10m: [11], wind_gusts_10m: [19]
    }
  } : {})
});

test.each([
  ['preview', false, 'missing-weather-context', 0],
  ['delivery', true, 'available', 1]
] as const)('production %s emits correlated Weather diagnostics through its configured sink', async (mode, withHourlyContext, reason, attempt) => {
  fetcher.mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'api.open-meteo.com') {
      return new Response(JSON.stringify(forecastPayload(withHourlyContext)));
    }
    if (url.href === 'https://api.openai.com/v1/responses') {
      return new Response(JSON.stringify({
        status: 'completed', output_text: JSON.stringify({ summary: 'Clouds clear by noon.' })
      }));
    }
    throw new Error(`Unexpected test HTTP request: ${url.hostname}`);
  });
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const generator = createProductionUserDailySummaryGenerator({
    async load() { throw new Error('Paused Calendar must not request events'); }
  });
  const result = await generator.generate(mode === 'preview'
    ? { userId: 'private-user', snapshot: {
        configuration, generatedAt,
        calendarEvents: {
          readiness: calendarReadinessForAuthMode('user'), selectedCalendars: [],
          eventResult: { outcome: 'not-requested' }
        }
      } }
    : { userId: 'private-user' });

  expect(result.input.sections.weather).toMatchObject({
    status: 'active', content: { currentTemperatureCelsius: 18, locationLabel: 'Private City' }
  });
  expect(result.rendered.html).toContain('18°');
  expect(result.rendered.text).toContain('Chance of precipitation 35%.');
  expect(log.mock.calls.map(([message]) => JSON.parse(String(message)))).toEqual([{
    eventCode: 'weather-summary', reason, attempt, durationMilliseconds: expect.any(Number),
    traceId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    ...(withHourlyContext ? { httpStatus: 200 } : {})
  }]);
  const diagnostics = JSON.stringify(log.mock.calls);
  for (const value of ['private-user', 'Private City', '52.2297', '21.0122', 'private-api-key', 'Clouds clear by noon.']) {
    expect(diagnostics).not.toContain(value);
  }
});
