import { afterEach, expect, test, vi } from 'vitest';
import { openMeteoWeatherForecastProvider } from '$lib/weatherForecast';
import { createUserDailySummaryGenerator } from '$lib/dailySummaryGeneration/server';
import { createProductionUserDailySummaryGenerator } from './productionUserDailySummaryGeneration';
import { writeWeatherSummaryDiagnostic } from './weatherSummaryProvider';

vi.mock('$lib/server/db', () => ({ db: {} }));
vi.mock('./googleMapsOperations', () => ({ googleMapsOperations: {} }));
vi.mock('$lib/dailySummaryGeneration/server', () => ({ createUserDailySummaryGenerator: vi.fn() }));
vi.mock('./weatherSummaryProvider', () => ({
  openAiWeatherSummaryProvider: {},
  writeWeatherSummaryDiagnostic: vi.fn()
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test('logs the elapsed forecast request time when hourly summary context is missing', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const forecastResult = { outcome: 'available' as const, forecast: {
    dates: ['2026-10-01'], weatherCodes: [3], minimumTemperaturesCelsius: [12],
    maximumTemperaturesCelsius: [18], precipitationProbabilities: [0]
  } };
  const durations = [750, 1250];
  vi.spyOn(openMeteoWeatherForecastProvider, 'fetchDailyForecast').mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, durations.shift()));
    return forecastResult;
  });
  createProductionUserDailySummaryGenerator({ load: vi.fn() });
  const { weatherProvider } = vi.mocked(createUserDailySummaryGenerator).mock.calls[0]![0];
  const request = { latitude: 52.2297, longitude: 21.0122, timeZone: 'Europe/Warsaw' };

  for (const duration of [750, 1250]) {
    const pending = weatherProvider.fetchDailyForecast(request);
    await vi.advanceTimersByTimeAsync(duration);
    expect(await pending).toBe(forecastResult);
    expect(writeWeatherSummaryDiagnostic).toHaveBeenLastCalledWith({
      reason: 'missing-weather-context', durationMilliseconds: duration, attempt: 0
    });
  }
  expect(writeWeatherSummaryDiagnostic).toHaveBeenCalledTimes(2);
});
