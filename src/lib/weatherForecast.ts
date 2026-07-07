import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';
import type { DailySummarySectionState } from './dailySummaryRenderer';
import type { UserTimeZone } from './summaryConfiguration';

export type DailyWeatherForecastRequest = {
  latitude: number;
  longitude: number;
  timeZone: UserTimeZone;
};

export type DailyWeatherForecast = {
  dates: string[];
  weatherCodes: Array<number | null>;
  minimumTemperaturesCelsius: Array<number | null>;
  maximumTemperaturesCelsius: Array<number | null>;
  precipitationProbabilities: Array<number | null>;
};

export type WeatherForecastProvider = {
  fetchDailyForecast: (request: DailyWeatherForecastRequest) => Promise<DailyWeatherForecast>;
};

const openMeteoDailyForecastSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
    temperature_2m_max: z.array(z.number().nullable()),
    precipitation_probability_max: z.array(z.number().nullable())
  })
});

type OpenMeteoProviderOptions = {
  fetcher?: typeof fetch;
  timeoutMilliseconds?: number;
};

const defaultForecastTimeoutMilliseconds = 3_000;

export const createOpenMeteoWeatherForecastProvider = ({
  fetcher = fetch,
  timeoutMilliseconds = defaultForecastTimeoutMilliseconds
}: OpenMeteoProviderOptions = {}): WeatherForecastProvider => ({
  async fetchDailyForecast({ latitude, longitude, timeZone }) {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', latitude.toString());
    url.searchParams.set('longitude', longitude.toString());
    url.searchParams.set('daily', [
      'weather_code',
      'temperature_2m_min',
      'temperature_2m_max',
      'precipitation_probability_max'
    ].join(','));
    url.searchParams.set('temperature_unit', 'celsius');
    url.searchParams.set('timezone', timeZone);

    const response = await fetchWithTimeout(fetcher, url, timeoutMilliseconds);

    if (!response.ok) {
      throw new Error('Open-Meteo forecast request failed.');
    }

    const parsed = openMeteoDailyForecastSchema.parse(await response.json());

    return {
      dates: parsed.daily.time,
      weatherCodes: parsed.daily.weather_code,
      minimumTemperaturesCelsius: parsed.daily.temperature_2m_min,
      maximumTemperaturesCelsius: parsed.daily.temperature_2m_max,
      precipitationProbabilities: parsed.daily.precipitation_probability_max
    };
  }
});

export const openMeteoWeatherForecastProvider = createOpenMeteoWeatherForecastProvider();

export const buildWeatherSection = ({
  forecast,
  userTimeZone,
  now = new Date()
}: {
  forecast: DailyWeatherForecast;
  userTimeZone: UserTimeZone;
  now?: Date;
}): DailySummarySectionState => {
  const localDate = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO(userTimeZone)
    .toPlainDate()
    .toString();
  const dayIndex = forecast.dates.indexOf(localDate);

  if (dayIndex === -1) {
    return {
      status: 'unavailable',
      label: 'Weather',
      reason: 'Weather forecast is not available for today.'
    };
  }

  const weatherCode = forecast.weatherCodes[dayIndex];
  const minimumTemperature = forecast.minimumTemperaturesCelsius[dayIndex];
  const maximumTemperature = forecast.maximumTemperaturesCelsius[dayIndex];
  const precipitationProbability = forecast.precipitationProbabilities[dayIndex];

  if (
    !isFiniteNumber(weatherCode) ||
    !isFiniteNumber(minimumTemperature) ||
    !isFiniteNumber(maximumTemperature)
  ) {
    return {
      status: 'unavailable',
      label: 'Weather',
      reason: 'Weather forecast is not available for today.'
    };
  }

  return {
    status: 'available',
    label: 'Weather',
    detail: [
      `${weatherCodeDescription(weatherCode)}. Low ${Math.round(minimumTemperature)}C, high ${Math.round(maximumTemperature)}C.`,
      isFiniteNumber(precipitationProbability)
        ? `Chance of precipitation ${Math.round(precipitationProbability)}%.`
        : 'Chance of precipitation unavailable.'
    ].join(' ')
  };
};

const fetchWithTimeout = async (
  fetcher: typeof fetch,
  url: URL,
  timeoutMilliseconds: number
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);

  try {
    return await fetcher(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Open-Meteo forecast request timed out.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const weatherCodeDescription = (code: number) => {
  if (code === 0) {
    return 'Clear';
  }

  if ([1, 2, 3, 45, 48].includes(code)) {
    return 'Cloudy';
  }

  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) {
    return 'Rainy';
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return 'Snowy';
  }

  return 'Unknown weather';
};
