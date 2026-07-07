import { describe, expect, test, vi } from 'vitest';
import {
  buildWeatherSection,
  createOpenMeteoWeatherForecastProvider,
  weatherCodeDescription
} from './weatherForecast';

describe('Weather forecast mapping', () => {
  test.each([
    [0, 'Clear'],
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
      status: 'available',
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
      status: 'available',
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

    const forecastExpectation = expect(forecast).rejects.toThrow(
      'Open-Meteo forecast request timed out.'
    );

    await vi.advanceTimersByTimeAsync(100);
    await forecastExpectation;
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), {
      signal: expect.any(AbortSignal)
    });
    vi.useRealTimers();
  });
});
