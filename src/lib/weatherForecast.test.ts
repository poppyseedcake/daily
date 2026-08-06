import { describe, expect, test, vi } from 'vitest';
import {
  buildWeatherSection,
  buildWeatherDisplayForecast,
  createOpenMeteoWeatherForecastProvider,
  weatherCodeDescription,
  weatherIconUrlForCategory
} from './weatherForecast';

const validOpenMeteoPayload = () => ({
  current_units: { time: 'iso8601', temperature_2m: '°C' },
  current: { time: '2026-07-07T07:15', temperature_2m: 18 },
  daily_units: {
    time: 'iso8601',
    weather_code: 'wmo code',
    temperature_2m_min: '°C',
    temperature_2m_max: '°C',
    precipitation_probability_max: '%',
    wind_speed_10m_max: 'km/h',
    wind_gusts_10m_max: 'km/h'
  },
  daily: {
    time: ['2026-07-07'],
    weather_code: [2],
    temperature_2m_min: [12],
    temperature_2m_max: [22],
    precipitation_probability_max: [35],
    wind_speed_10m_max: [24],
    wind_gusts_10m_max: [39]
  },
  hourly_units: {
    time: 'iso8601',
    temperature_2m: '°C',
    precipitation_probability: '%',
    precipitation: 'mm',
    snowfall: 'cm',
    weather_code: 'wmo code',
    wind_speed_10m: 'km/h',
    wind_gusts_10m: 'km/h'
  },
  hourly: {
    time: ['2026-07-07T07:00'],
    temperature_2m: [17],
    precipitation_probability: [5],
    precipitation: [0],
    snowfall: [0],
    weather_code: [2],
    wind_speed_10m: [11],
    wind_gusts_10m: [19]
  }
});

describe('Weather forecast mapping', () => {
  test.each([
    ['a unit mismatch', (payload: ReturnType<typeof validOpenMeteoPayload>) => ({
      ...payload,
      daily_units: { ...payload.daily_units, temperature_2m_min: '°F' }
    })],
    ['a target-date mismatch', (payload: ReturnType<typeof validOpenMeteoPayload>) => ({
      ...payload,
      daily: { ...payload.daily, time: ['2026-07-08'] }
    })],
    ['an invalid required current value', (payload: ReturnType<typeof validOpenMeteoPayload>) => ({
      ...payload,
      current: { ...payload.current, temperature_2m: null }
    })]
  ])('returns unavailable for %s before normalization', async (_failure, mutate) => {
    const provider = createOpenMeteoWeatherForecastProvider({
      fetcher: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mutate(validOpenMeteoPayload())))
      )
    });

    await expect(provider.fetchDailyForecast({
      latitude: 52.2297,
      longitude: 21.0122,
      timeZone: 'Europe/Warsaw',
      targetDate: '2026-07-07'
    })).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'Live weather is unavailable right now.'
    });
  });

  test('keeps valid display data when hourly context is malformed and suppresses Luna input', async () => {
    const payload = validOpenMeteoPayload();
    const malformedPayload = {
      ...payload,
      hourly: { ...payload.hourly, temperature_2m: [null] }
    };
    const provider = createOpenMeteoWeatherForecastProvider({
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify(malformedPayload)))
    });

    const result = await provider.fetchDailyForecast({
      latitude: 52.2297,
      longitude: 21.0122,
      timeZone: 'Europe/Warsaw',
      targetDate: '2026-07-07'
    });

    expect(result).toEqual({
      outcome: 'available',
      forecast: expect.objectContaining({ currentTemperatureCelsius: 18 })
    });
    expect(result.outcome === 'available' ? result.forecast.summaryInput : null).toBeUndefined();
  });

  test('keeps valid display data when hourly fields are missing', async () => {
    const { hourly: _hourly, hourly_units: _hourlyUnits, ...displayPayload } = validOpenMeteoPayload();
    const provider = createOpenMeteoWeatherForecastProvider({
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify(displayPayload)))
    });

    const result = await provider.fetchDailyForecast({
      latitude: 52.2297,
      longitude: 21.0122,
      timeZone: 'Europe/Warsaw',
      targetDate: '2026-07-07'
    });

    expect(result).toEqual({
      outcome: 'available',
      forecast: expect.objectContaining({
        currentTemperatureCelsius: 18
      })
    });
    expect(result.outcome === 'available' ? result.forecast.summaryInput : null).toBeUndefined();
  });

  test('maps unknown daily codes to a neutral deterministic asset', () => {
    const display = buildWeatherDisplayForecast({
      forecast: {
        dates: ['2026-07-07'],
        weatherCodes: [123],
        minimumTemperaturesCelsius: [12],
        maximumTemperaturesCelsius: [22],
        precipitationProbabilities: [35],
        maximumWindSpeedsKmh: [24],
        currentTemperatureCelsius: 18,
        observedAtLocal: '2026-07-07T07:15'
      },
      userTimeZone: 'UTC',
      now: new Date('2026-07-07T07:15:00.000Z'),
      assetOrigin: 'http://daily.example.com/'
    });

    expect(display).toEqual(expect.objectContaining({
      dailyWeatherCode: 123,
      conditionText: 'Unknown weather',
      conditionCategory: 'unknown',
      iconUrl: 'https://daily.example.com/weather-icons/unknown.png'
    }));
    expect(weatherIconUrlForCategory('thunderstorm')).toMatch(
      /^https:\/\/daily\.example\.com\/weather-icons\/thunderstorm\.png$/
    );
  });

  test('requests one explicit local-day forecast and normalizes the display and Luna inputs', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          current_units: { time: 'iso8601', temperature_2m: '°C' },
          current: { time: '2026-07-07T07:15', temperature_2m: 18 },
          daily_units: {
            time: 'iso8601',
            weather_code: 'wmo code',
            temperature_2m_min: '°C',
            temperature_2m_max: '°C',
            precipitation_probability_max: '%',
            wind_speed_10m_max: 'km/h',
            wind_gusts_10m_max: 'km/h'
          },
          daily: {
            time: ['2026-07-07'],
            weather_code: [2],
            temperature_2m_min: [12],
            temperature_2m_max: [22],
            precipitation_probability_max: [35],
            wind_speed_10m_max: [24],
            wind_gusts_10m_max: [39]
          },
          hourly_units: {
            time: 'iso8601',
            temperature_2m: '°C',
            precipitation_probability: '%',
            precipitation: 'mm',
            snowfall: 'cm',
            weather_code: 'wmo code',
            wind_speed_10m: 'km/h',
            wind_gusts_10m: 'km/h'
          },
          hourly: {
            time: [
              '2026-07-07T00:00',
              '2026-07-07T07:00',
              '2026-07-07T08:00',
              '2026-07-07T23:00'
            ],
            temperature_2m: [13, 17, 18, 16],
            precipitation_probability: [10, 5, 15, 40],
            precipitation: [0, 0, 0.2, 1],
            snowfall: [0, 0, 0, 0],
            weather_code: [1, 2, 2, 61],
            wind_speed_10m: [8, 11, 12, 20],
            wind_gusts_10m: [14, 19, 20, 31]
          }
        })
      )
    );
    const provider = createOpenMeteoWeatherForecastProvider({ fetcher });

    const result = await provider.fetchDailyForecast({
      latitude: 52.2297,
      longitude: 21.0122,
      timeZone: 'Europe/Warsaw',
      targetDate: '2026-07-07'
    });

    expect(result).toEqual({
      outcome: 'available',
      forecast: expect.objectContaining({
        dates: ['2026-07-07'],
        currentTemperatureCelsius: 18,
        observedAtLocal: '2026-07-07T07:15',
        minimumTemperaturesCelsius: [12],
        maximumTemperaturesCelsius: [22],
        precipitationProbabilities: [35],
        maximumWindSpeedsKmh: [24],
        maximumWindGustsKmh: [39],
        summaryInput: {
          units: {
            temperature: 'celsius',
            precipitationProbability: 'percent',
            precipitation: 'millimetres',
            snowfall: 'centimetres',
            wind: 'kilometres_per_hour'
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
          remainingHours: [
            {
              localTime: '07:00',
              temperature: 17,
              precipitationProbability: 5,
              precipitation: 0,
              snowfall: 0,
              weatherCode: 2,
              windSpeed: 11,
              windGust: 19
            },
            {
              localTime: '08:00',
              temperature: 18,
              precipitationProbability: 15,
              precipitation: 0.2,
              snowfall: 0,
              weatherCode: 2,
              windSpeed: 12,
              windGust: 20
            },
            {
              localTime: '23:00',
              temperature: 16,
              precipitationProbability: 40,
              precipitation: 1,
              snowfall: 0,
              weatherCode: 61,
              windSpeed: 20,
              windGust: 31
            }
          ]
        }
      })
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url] = fetcher.mock.calls[0]!;
    const parsedUrl = new URL(url as string);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(Object.fromEntries(parsedUrl.searchParams)).toEqual({
      latitude: '52.2297',
      longitude: '21.0122',
      timezone: 'Europe/Warsaw',
      start_date: '2026-07-07',
      end_date: '2026-07-07',
      current: 'temperature_2m',
      daily: 'weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max',
      hourly: 'temperature_2m,precipitation_probability,precipitation,snowfall,weather_code,wind_speed_10m,wind_gusts_10m',
      temperature_unit: 'celsius',
      wind_speed_unit: 'kmh',
      precipitation_unit: 'mm',
      timeformat: 'iso8601'
    });
  });

  test.each([
    [0, 'Clear'],
    [1, 'Mainly clear'],
    [2, 'Partly cloudy'],
    [3, 'Cloudy'],
    [61, 'Rainy'],
    [75, 'Snowy'],
    [999, 'Unknown weather']
  ])('maps weather code %i to %s', (code, description) => {
    expect(weatherCodeDescription(code)).toBe(description);
  });

  test('selects the forecast day using the configured User Time Zone', () => {
    const weather = buildWeatherSection({
      userTimeZone: 'America/New_York',
      now: new Date('2026-07-08T02:30:00.000Z'),
      forecast: {
        dates: ['2026-07-07', '2026-07-08'],
        weatherCodes: [0, 61],
        minimumTemperaturesCelsius: [11, 14],
        maximumTemperaturesCelsius: [21, 24],
        precipitationProbabilities: [5, 90]
      }
    });

    expect(weather).toEqual({
      status: 'active',
      label: 'Weather',
      detail: 'Clear. Low 11C, high 21C. Chance of precipitation 5%.'
    });
  });

  test('marks incomplete required forecast values unavailable instead of rendering NaN', () => {
    const weather = buildWeatherSection({
      userTimeZone: 'UTC',
      now: new Date('2026-07-07T12:00:00.000Z'),
      forecast: {
        dates: ['2026-07-07'],
        weatherCodes: [0],
        minimumTemperaturesCelsius: [],
        maximumTemperaturesCelsius: [21],
        precipitationProbabilities: [5]
      }
    });

    expect(weather).toEqual({
      status: 'unavailable',
      label: 'Weather',
      reason: 'Weather forecast is not available for today.'
    });
  });

  test('renders usable forecast details when precipitation probability is missing', () => {
    const weather = buildWeatherSection({
      userTimeZone: 'UTC',
      now: new Date('2026-07-07T12:00:00.000Z'),
      forecast: {
        dates: ['2026-07-07'],
        weatherCodes: [0],
        minimumTemperaturesCelsius: [11],
        maximumTemperaturesCelsius: [21],
        precipitationProbabilities: [null]
      }
    });

    expect(weather).toEqual({
      status: 'active',
      label: 'Weather',
      detail: 'Clear. Low 11C, high 21C. Chance of precipitation unavailable.'
    });
  });

  test('aborts stalled Open-Meteo requests', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    );
    const provider = createOpenMeteoWeatherForecastProvider({
      fetcher,
      timeoutMilliseconds: 100
    });

    const forecast = provider.fetchDailyForecast({
      latitude: 52.2297,
      longitude: 21.0122,
      timeZone: 'Europe/Warsaw'
    });

    const forecastExpectation = expect(forecast).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'Live weather is unavailable right now.'
    });

    await vi.advanceTimersByTimeAsync(100);
    await forecastExpectation;
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), {
      signal: expect.any(AbortSignal)
    });
    vi.useRealTimers();
  });

  test('returns a typed unavailable outcome when Open-Meteo rejects a forecast request', async () => {
    const provider = createOpenMeteoWeatherForecastProvider({
      fetcher: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Service unavailable' }), {
          status: 503
        })
      )
    });

    await expect(
      provider.fetchDailyForecast({
        latitude: 52.2297,
        longitude: 21.0122,
        timeZone: 'Europe/Warsaw'
      })
    ).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'Live weather is unavailable right now.'
    });
  });

  test('returns a typed unavailable outcome when Open-Meteo returns unmappable forecast data', async () => {
    const provider = createOpenMeteoWeatherForecastProvider({
      fetcher: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ daily: { time: ['2026-07-07'] } }), {
          status: 200
        })
      )
    });

    await expect(
      provider.fetchDailyForecast({
        latitude: 52.2297,
        longitude: 21.0122,
        timeZone: 'Europe/Warsaw'
      })
    ).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'Live weather is unavailable right now.'
    });
  });
});
