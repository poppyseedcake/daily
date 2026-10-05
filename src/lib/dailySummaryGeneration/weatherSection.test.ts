import { afterEach, expect, test, vi } from 'vitest';
import { createWeatherSectionGenerator } from './weatherSection';
import type { DailyWeatherForecast, NormalizedWeatherSummaryInput, WeatherSummaryProvider } from '../weatherForecast';
import { defaultSummaryConfiguration } from '../summaryConfiguration';
import { createOpenAiWeatherSummaryProvider } from '../server/weatherSummaryProvider';
import type { WeatherSummaryDiagnostic } from '../weatherSummaryContract';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const forecast = (): DailyWeatherForecast => ({
  dates: ['2026-07-07'],
  weatherCodes: [2],
  minimumTemperaturesCelsius: [12],
  maximumTemperaturesCelsius: [22],
  precipitationProbabilities: [35],
  currentTemperatureCelsius: 18,
  observedAtLocal: '2026-07-07T07:15',
  maximumWindSpeedsKmh: [24]
});

const request = () => ({
  configuration: { ...defaultSummaryConfiguration, userTimeZone: 'UTC' },
  location: { label: 'Private City', latitude: 52.2297, longitude: 21.0122 },
  now: new Date('2026-07-07T07:15:00.000Z'),
  assetOrigin: 'https://daily.example.com/'
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const summaryInput: NormalizedWeatherSummaryInput = {
  units: { temperature: 'celsius', precipitationProbability: 'percent', precipitation: 'millimetres', snowfall: 'centimetres', wind: 'kilometres_per_hour' },
  current: { temperature: 18 },
  day: { weatherCode: 2, minimumTemperature: 12, maximumTemperature: 22, maximumPrecipitationProbability: 35, maximumWindSpeed: 24, maximumWindGust: 39 },
  remainingHours: [{ localTime: '07:00', temperature: 17, precipitationProbability: 5, precipitation: 0, snowfall: 0, weatherCode: 2, windSpeed: 11, windGust: 19 }]
};

test.each([750, 1250])('keeps facts and reports elapsed time after %i ms with no hourly context', async (duration) => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const diagnostics: Array<WeatherSummaryDiagnostic & { traceId: string }> = [];
  const generator = createWeatherSectionGenerator({
    forecastProvider: {
      async fetchDailyForecast() {
        await new Promise((resolve) => setTimeout(resolve, duration));
        return { outcome: 'available', forecast: forecast() };
      }
    },
    onDiagnostic: (event) => diagnostics.push(event)
  });

  const pending = generator.generate(request());
  await vi.advanceTimersByTimeAsync(duration);
  const result = await pending;

  expect(result).toMatchObject({
    status: 'active',
    detail: 'Current 18C. Partly cloudy. Low 12C, high 22C. Chance of precipitation 35%. Wind up to 24 km/h.',
    content: { currentTemperatureCelsius: 18, locationLabel: 'Private City' }
  });
  expect(diagnostics).toEqual([{
    reason: 'missing-weather-context', durationMilliseconds: duration, attempt: 0,
    traceId: expect.stringMatching(/^[0-9a-f-]{36}$/)
  }]);
  expect(JSON.stringify(diagnostics)).not.toContain('Private City');
});

test('keeps forecast facts when diagnostic trace creation fails', async () => {
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('Trace unavailable'); });
  const generator = createWeatherSectionGenerator({
    forecastProvider: { async fetchDailyForecast() { return { outcome: 'available', forecast: forecast() }; } },
    onDiagnostic() { throw new Error('Must not report without a trace'); }
  });
  await expect(generator.generate(request())).resolves.toMatchObject({
    status: 'active', content: { currentTemperatureCelsius: 18 }
  });
});

test('adds an accepted sentence to the same forecast facts and detail', async () => {
  const generator = createWeatherSectionGenerator({
    forecastProvider: { async fetchDailyForecast() { return { outcome: 'available', forecast: { ...forecast(), summaryInput } }; } },
    summaryProvider: { async summarize() { return { outcome: 'available', sentence: 'Clouds clear by noon.' }; } }
  });

  expect(await generator.generate(request())).toMatchObject({
    status: 'active',
    detail: 'Current 18C. Partly cloudy. Low 12C, high 22C. Chance of precipitation 35%. Wind up to 24 km/h. Clouds clear by noon.',
    content: { summary: 'Clouds clear by noon.', currentTemperatureCelsius: 18, maximumTemperatureCelsius: 22 }
  });
});

test('correlates AI generations with diagnostics without adding identity or location to weather input', async () => {
  const diagnostics: Array<WeatherSummaryDiagnostic & { traceId: string }> = [];
  const summarize = vi.fn<WeatherSummaryProvider['summarize']>(async (_input, options) => {
    options?.onDiagnostic?.({ reason: 'available', durationMilliseconds: 1, attempt: 1 });
    return { outcome: 'available', sentence: 'Clouds clear by noon.' };
  });
  const generator = createWeatherSectionGenerator({
    forecastProvider: { async fetchDailyForecast() { return { outcome: 'available', forecast: { ...forecast(), summaryInput } }; } },
    summaryProvider: { summarize },
    onDiagnostic: (event) => diagnostics.push(event)
  });
  const observability = { distinctId: 'verified-user', sessionId: 'daily-summary-session' };

  for (let index = 0; index < 2; index++) {
    await expect(generator.generate({ ...request(), observability })).resolves.toMatchObject({
      status: 'active', content: { summary: 'Clouds clear by noon.' }
    });
    const [input, options] = summarize.mock.calls[index];
    expect(input).toEqual(summaryInput);
    expect(options?.observability).toEqual({ ...observability, traceId: diagnostics[index].traceId });
  }
  expect(diagnostics[0].traceId).not.toBe(diagnostics[1].traceId);
});

test('retains facts after sentence rejection and gives each generation its own private diagnostic trace', async () => {
  const diagnostics: Array<WeatherSummaryDiagnostic & { traceId: string }> = [];
  const generator = createWeatherSectionGenerator({
    forecastProvider: { async fetchDailyForecast() { return { outcome: 'available', forecast: { ...forecast(), summaryInput } }; } },
    summaryProvider: createOpenAiWeatherSummaryProvider({
      apiKey: 'private-api-key',
      fetcher: vi.fn().mockImplementation(async () => new Response(JSON.stringify({
        status: 'completed', output_text: JSON.stringify({ summary: 'Private provider sentence. Another sentence.' })
      })))
    }),
    onDiagnostic: (event) => diagnostics.push(event)
  });

  for (let index = 0; index < 2; index++) {
    expect(await generator.generate(request())).toMatchObject({
      status: 'active',
      detail: 'Current 18C. Partly cloudy. Low 12C, high 22C. Chance of precipitation 35%. Wind up to 24 km/h.',
      content: { currentTemperatureCelsius: 18 }
    });
  }
  expect(diagnostics).toEqual([0, 1].map(() => ({
    reason: 'sentence-rejected', durationMilliseconds: expect.any(Number), attempt: 1,
    httpStatus: 200, traceId: expect.stringMatching(/^[0-9a-f-]{36}$/)
  })));
  expect(diagnostics[0].traceId).not.toBe(diagnostics[1].traceId);
  const serialized = JSON.stringify(diagnostics);
  for (const privateValue of ['Private City', '52.2297', '21.0122', 'private-api-key', 'Private provider sentence']) {
    expect(serialized).not.toContain(privateValue);
  }
});

test('correlates sentence retry diagnostics within one generation', async () => {
  const diagnostics: Array<WeatherSummaryDiagnostic & { traceId: string }> = [];
  const sentences = ['Today will be partly cloudy with temperatures around eighteen degrees and no rain.', 'Cloudy conditions today.'];
  const generator = createWeatherSectionGenerator({
    forecastProvider: { async fetchDailyForecast() { return { outcome: 'available', forecast: { ...forecast(), summaryInput } }; } },
    summaryProvider: createOpenAiWeatherSummaryProvider({
      apiKey: 'test-key', maxCharacters: 40,
      fetcher: vi.fn().mockImplementation(async () => new Response(JSON.stringify({
        status: 'completed', output_text: JSON.stringify({ summary: sentences.shift() })
      })))
    }),
    onDiagnostic: (event) => diagnostics.push(event)
  });
  expect(await generator.generate(request())).toMatchObject({ status: 'active', content: { summary: 'Cloudy conditions today.' } });
  expect(diagnostics).toEqual([
    { reason: 'sentence-too-long', durationMilliseconds: expect.any(Number), attempt: 1, httpStatus: 200, traceId: expect.any(String) },
    { reason: 'available', durationMilliseconds: expect.any(Number), attempt: 2, httpStatus: 200, traceId: expect.any(String) }
  ]);
  expect(diagnostics[0].traceId).toBe(diagnostics[1].traceId);
});

test.each([
  ['unavailable', { outcome: 'unavailable' as const }],
  ['failed', new Error('Private sentence failure')]
])('retains the forecast after an %s sentence', async (_name, result) => {
  const generator = createWeatherSectionGenerator({
    forecastProvider: { async fetchDailyForecast() { return { outcome: 'available', forecast: { ...forecast(), summaryInput } }; } },
    summaryProvider: { async summarize() { if (result instanceof Error) throw result; return result; } }
  });
  expect(await generator.generate(request())).toMatchObject({
    status: 'active', content: { currentTemperatureCelsius: 18 },
    detail: 'Current 18C. Partly cloudy. Low 12C, high 22C. Chance of precipitation 35%. Wind up to 24 km/h.'
  });
});

test.each(['missing context', 'accepted sentence'])('ignores diagnostic failure for %s', async (scenario) => {
  const generator = createWeatherSectionGenerator({
    forecastProvider: { async fetchDailyForecast() { return { outcome: 'available', forecast: { ...forecast(), ...(scenario === 'accepted sentence' ? { summaryInput } : {}) } }; } },
    summaryProvider: createOpenAiWeatherSummaryProvider({
      apiKey: 'test-key',
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output_text: JSON.stringify({ summary: 'Clouds clear by noon.' }) })))
    }),
    onDiagnostic() { throw new Error('Private diagnostic failure'); }
  });
  const result = await generator.generate(request());
  expect(result).toMatchObject({ status: 'active', content: { currentTemperatureCelsius: 18 } });
  if (scenario === 'accepted sentence') expect(result).toMatchObject({ content: { summary: 'Clouds clear by noon.' } });
});

test.each([
  ['paused', { configuration: { ...defaultSummaryConfiguration, sectionPauses: { ...defaultSummaryConfiguration.sectionPauses, weather: true } } }, { status: 'paused', detail: 'Weather is paused.' }],
  ['unconfigured', { location: null }, { status: 'unconfigured', detail: 'Choose a Weather Location to include local weather.' }],
  ['unreadable location', { locationUnavailable: true }, { status: 'unavailable', reason: 'Live weather is unavailable right now.' }]
])('performs no provider work for %s', async (_name, override, expected) => {
  const fetchDailyForecast = vi.fn().mockRejectedValue(new Error('Must not call forecast provider'));
  const summarize = vi.fn().mockRejectedValue(new Error('Must not call sentence provider'));
  const generator = createWeatherSectionGenerator({ forecastProvider: { fetchDailyForecast }, summaryProvider: { summarize } });
  expect(await generator.generate({ ...request(), ...override })).toEqual(expected);
  expect(fetchDailyForecast).not.toHaveBeenCalled();
  expect(summarize).not.toHaveBeenCalled();
});

test.each([
  ['a returned failure', { outcome: 'unavailable' as const, reason: 'Live weather is unavailable right now.' }],
  ['a thrown failure', new Error('Private forecast failure')],
  ['invalid required facts', { outcome: 'available' as const, forecast: { ...forecast(), currentTemperatureCelsius: null, summaryInput } }]
])('contains %s and skips sentence work', async (_name, result) => {
  const summarize = vi.fn().mockRejectedValue(new Error('Must not call sentence provider'));
  const generator = createWeatherSectionGenerator({
    forecastProvider: { async fetchDailyForecast() { if (result instanceof Error) throw result; return result; } },
    summaryProvider: { summarize }
  });
  expect(await generator.generate(request())).toEqual({ status: 'unavailable', reason: 'Live weather is unavailable right now.' });
  expect(summarize).not.toHaveBeenCalled();
});

test('requests and maps the local generation day across midnight', async () => {
  const fetchDailyForecast = vi.fn().mockResolvedValue({ outcome: 'available', forecast: {
    ...forecast(), dates: ['2026-07-07', '2026-07-08'], weatherCodes: [0, 61],
    minimumTemperaturesCelsius: [11, 14], maximumTemperaturesCelsius: [21, 24],
    precipitationProbabilities: [5, 90], maximumWindSpeedsKmh: [10, 40]
  } });
  const generator = createWeatherSectionGenerator({ forecastProvider: { fetchDailyForecast } });
  const result = await generator.generate({
    ...request(), configuration: { ...defaultSummaryConfiguration, userTimeZone: 'America/New_York' },
    now: new Date('2026-07-08T02:30:00Z')
  });
  expect(fetchDailyForecast).toHaveBeenCalledWith({ latitude: 52.2297, longitude: 21.0122, timeZone: 'America/New_York', targetDate: '2026-07-07' });
  expect(result).toMatchObject({ status: 'active', content: { conditionText: 'Clear', minimumTemperatureCelsius: 11, maximumTemperatureCelsius: 21, maximumPrecipitationProbabilityPercent: 5, maximumWindSpeedKmh: 10 } });
});

test('maps unknown daily weather to a neutral HTTPS icon', async () => {
  const generator = createWeatherSectionGenerator({ forecastProvider: {
    async fetchDailyForecast() { return { outcome: 'available', forecast: { ...forecast(), weatherCodes: [123] } }; }
  } });
  expect(await generator.generate({ ...request(), assetOrigin: 'http://daily.example.com/' })).toMatchObject({
    status: 'active', content: {
      dailyWeatherCode: 123, conditionText: 'Unknown weather', conditionCategory: 'unknown',
      iconUrl: 'https://daily.example.com/weather-icons/unknown.png'
    }
  });
});

test.each([
  ['complete', [11], [5], { status: 'active', detail: 'Clear. Low 11C, high 21C. Chance of precipitation 5%.' }],
  ['missing required values', [], [5], { status: 'unavailable', reason: 'Weather forecast is not available for today.' }],
  ['missing precipitation', [11], [null], { status: 'active', detail: 'Clear. Low 11C, high 21C. Chance of precipitation unavailable.' }]
])('supports daily-only forecasts with %s data', async (_name, minimumTemperaturesCelsius, precipitationProbabilities, expected) => {
  const generator = createWeatherSectionGenerator({ forecastProvider: { async fetchDailyForecast() { return { outcome: 'available', forecast: {
    dates: ['2026-07-07'], weatherCodes: [0], minimumTemperaturesCelsius,
    maximumTemperaturesCelsius: [21], precipitationProbabilities
  } }; } } });
  expect(await generator.generate(request())).toEqual(expected);
});
