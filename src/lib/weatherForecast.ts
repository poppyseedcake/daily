import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';
import type { UserTimeZone } from './summaryConfiguration';
import type { NormalizedWeatherSummaryInput } from './weatherSummaryContract';

export type { NormalizedWeatherSummaryInput } from './weatherSummaryContract';

export type DailyWeatherForecastRequest = {
  latitude: number;
  longitude: number;
  timeZone: UserTimeZone;
  targetDate?: string;
};

export type WeatherConditionCategory =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'rain'
  | 'snow'
  | 'thunderstorm'
  | 'unknown';

export type WeatherDisplayForecast = {
  observedAtLocal: string;
  currentTemperatureCelsius: number;
  minimumTemperatureCelsius: number;
  maximumTemperatureCelsius: number;
  maximumPrecipitationProbabilityPercent: number;
  maximumWindSpeedKmh: number;
  dailyWeatherCode: number;
  conditionText: string;
  conditionCategory: WeatherConditionCategory;
  iconUrl: string;
  summary?: string;
};

type WeatherGenerationState =
  | { status: 'active'; label: 'Weather'; detail: string }
  | { status: 'unavailable'; label: 'Weather'; reason: string };

export type DailyWeatherForecast = {
  dates: string[];
  weatherCodes: Array<number | null>;
  minimumTemperaturesCelsius: Array<number | null>;
  maximumTemperaturesCelsius: Array<number | null>;
  precipitationProbabilities: Array<number | null>;
  currentTemperatureCelsius?: number | null;
  observedAtLocal?: string | null;
  maximumWindSpeedsKmh?: Array<number | null>;
  maximumWindGustsKmh?: Array<number | null>;
  summaryInput?: NormalizedWeatherSummaryInput;
};

export type DailyWeatherForecastResult =
  | {
      outcome: 'available';
      forecast: DailyWeatherForecast;
    }
  | {
      outcome: 'unavailable';
      reason: string;
    };

export type WeatherForecastProvider = {
  fetchDailyForecast: (request: DailyWeatherForecastRequest) => Promise<DailyWeatherForecastResult>;
};

export type WeatherSummaryProvider = {
  summarize: (
    input: NormalizedWeatherSummaryInput
  ) => Promise<
    | { outcome: 'available'; sentence: string }
    | { outcome: 'unavailable' }
  >;
};

const openMeteoNumber = z.number().nullable();

const openMeteoResponseSchema = z.object({
  current_units: z.object({
    time: z.string(),
    temperature_2m: z.string()
  }),
  current: z.object({
    time: z.string(),
    temperature_2m: openMeteoNumber
  }),
  daily_units: z.object({
    time: z.string(),
    weather_code: z.string(),
    temperature_2m_min: z.string(),
    temperature_2m_max: z.string(),
    precipitation_probability_max: z.string(),
    wind_speed_10m_max: z.string(),
    wind_gusts_10m_max: z.string()
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(openMeteoNumber),
    temperature_2m_min: z.array(openMeteoNumber),
    temperature_2m_max: z.array(openMeteoNumber),
    precipitation_probability_max: z.array(openMeteoNumber),
    wind_speed_10m_max: z.array(openMeteoNumber),
    wind_gusts_10m_max: z.array(openMeteoNumber)
  }),
  hourly_units: z.unknown().optional(),
  hourly: z.unknown().optional()
});

const openMeteoHourlyResponseSchema = z.object({
  hourly_units: z.object({
    time: z.string(),
    temperature_2m: z.string(),
    precipitation_probability: z.string(),
    precipitation: z.string(),
    snowfall: z.string(),
    weather_code: z.string(),
    wind_speed_10m: z.string(),
    wind_gusts_10m: z.string()
  }),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(openMeteoNumber),
    precipitation_probability: z.array(openMeteoNumber),
    precipitation: z.array(openMeteoNumber),
    snowfall: z.array(openMeteoNumber),
    weather_code: z.array(openMeteoNumber),
    wind_speed_10m: z.array(openMeteoNumber),
    wind_gusts_10m: z.array(openMeteoNumber)
  })
});

type OpenMeteoProviderOptions = {
  fetcher?: typeof fetch;
  timeoutMilliseconds?: number;
};

const defaultForecastTimeoutMilliseconds = 3_000;
const defaultWeatherAssetOrigin = 'https://daily.example.com';

export const createOpenMeteoWeatherForecastProvider = ({
  fetcher = fetch,
  timeoutMilliseconds = defaultForecastTimeoutMilliseconds
}: OpenMeteoProviderOptions = {}): WeatherForecastProvider => ({
  async fetchDailyForecast({ latitude, longitude, timeZone, targetDate: requestedTargetDate }) {
    const targetDate = requestedTargetDate ?? localDateFor(new Date(), timeZone);

    try {
      if (!isIsoDate(targetDate)) {
        return unavailableForecast();
      }

      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', latitude.toString());
      url.searchParams.set('longitude', longitude.toString());
      url.searchParams.set('timezone', timeZone);
      url.searchParams.set('start_date', targetDate);
      url.searchParams.set('end_date', targetDate);
      url.searchParams.set('current', 'temperature_2m');
      url.searchParams.set('daily', [
        'weather_code',
        'temperature_2m_min',
        'temperature_2m_max',
        'precipitation_probability_max',
        'wind_speed_10m_max',
        'wind_gusts_10m_max'
      ].join(','));
      url.searchParams.set('hourly', [
        'temperature_2m',
        'precipitation_probability',
        'precipitation',
        'snowfall',
        'weather_code',
        'wind_speed_10m',
        'wind_gusts_10m'
      ].join(','));
      url.searchParams.set('temperature_unit', 'celsius');
      url.searchParams.set('wind_speed_unit', 'kmh');
      url.searchParams.set('precipitation_unit', 'mm');
      url.searchParams.set('timeformat', 'iso8601');

      const response = await fetchWithTimeout(fetcher, url, timeoutMilliseconds);

      if (!response.ok) {
        return unavailableForecast();
      }

      const parsed = openMeteoResponseSchema.parse(await response.json());

      if (!hasExpectedUnits(parsed) || !hasValidDailyDisplayData(parsed, targetDate, timeZone)) {
        return unavailableForecast();
      }

      const currentDateTime = parseLocalDateTime(parsed.current.time, timeZone);
      const currentTemperature = parsed.current.temperature_2m;
      const maximumWindGust = parsed.daily.wind_gusts_10m_max[0];
      const hourlySummaryInput = buildNormalizedWeatherSummaryInput({
        parsed,
        targetDate,
        timeZone,
        currentDateTime,
        currentTemperature,
        maximumWindGust
      });

      return {
        outcome: 'available',
        forecast: {
          dates: parsed.daily.time,
          weatherCodes: parsed.daily.weather_code,
          minimumTemperaturesCelsius: parsed.daily.temperature_2m_min,
          maximumTemperaturesCelsius: parsed.daily.temperature_2m_max,
          precipitationProbabilities: parsed.daily.precipitation_probability_max,
          currentTemperatureCelsius: currentTemperature,
          observedAtLocal: currentDateTime ? formatLocalDateTime(currentDateTime) : null,
          maximumWindSpeedsKmh: parsed.daily.wind_speed_10m_max,
          maximumWindGustsKmh: parsed.daily.wind_gusts_10m_max,
          ...(hourlySummaryInput ? { summaryInput: hourlySummaryInput } : {})
        }
      };
    } catch {
      return unavailableForecast();
    }
  }
});

export const openMeteoWeatherForecastProvider = createOpenMeteoWeatherForecastProvider();

export const buildWeatherDisplayForecast = ({
  forecast,
  userTimeZone,
  now = new Date(),
  assetOrigin = defaultWeatherAssetOrigin
}: {
  forecast: DailyWeatherForecast;
  userTimeZone: UserTimeZone;
  now?: Date;
  assetOrigin?: string;
}): WeatherDisplayForecast | null => {
  const localDate = localDateFor(now, userTimeZone);
  const dayIndex = forecast.dates.indexOf(localDate);
  const weatherCode = forecast.weatherCodes[dayIndex];
  const minimumTemperature = forecast.minimumTemperaturesCelsius[dayIndex];
  const maximumTemperature = forecast.maximumTemperaturesCelsius[dayIndex];
  const precipitationProbability = forecast.precipitationProbabilities[dayIndex];
  const maximumWindSpeed = forecast.maximumWindSpeedsKmh?.[dayIndex];

  if (
    dayIndex === -1 ||
    !isFiniteNumber(forecast.currentTemperatureCelsius) ||
    !isFiniteNumber(weatherCode) ||
    !isFiniteNumber(minimumTemperature) ||
    !isFiniteNumber(maximumTemperature) ||
    !isFiniteNumber(precipitationProbability) ||
    !isFiniteNumber(maximumWindSpeed) ||
    !forecast.observedAtLocal
  ) {
    return null;
  }

  const conditionCategory = weatherConditionCategoryForCode(weatherCode);

  return {
    observedAtLocal: forecast.observedAtLocal,
    currentTemperatureCelsius: forecast.currentTemperatureCelsius,
    minimumTemperatureCelsius: minimumTemperature,
    maximumTemperatureCelsius: maximumTemperature,
    maximumPrecipitationProbabilityPercent: precipitationProbability,
    maximumWindSpeedKmh: maximumWindSpeed,
    dailyWeatherCode: weatherCode,
    conditionText: weatherCodeDescription(weatherCode),
    conditionCategory,
    iconUrl: weatherIconUrlForCategory(conditionCategory, assetOrigin)
  };
};

export const buildWeatherSection = ({
  forecast,
  userTimeZone,
  now = new Date(),
  summary,
  assetOrigin = defaultWeatherAssetOrigin
}: {
  forecast: DailyWeatherForecast;
  userTimeZone: UserTimeZone;
  now?: Date;
  summary?: string;
  assetOrigin?: string;
}): WeatherGenerationState => {
  const isLegacyForecast = forecast.currentTemperatureCelsius === undefined;

  if (isLegacyForecast) {
    return buildLegacyWeatherSection(forecast, userTimeZone, now);
  }

  const display = buildWeatherDisplayForecast({
    forecast,
    userTimeZone,
    now,
    assetOrigin
  });

  if (!display) {
    return unavailableWeatherSection();
  }

  return {
    status: 'active',
    label: 'Weather',
    detail: formatWeatherDetail(display, summary)
  };
};

export const weatherConditionCategoryForCode = (code: number): WeatherConditionCategory => {
  if (code === 0) return 'clear';
  if ([1, 2].includes(code)) return 'partly-cloudy';
  if (code === 3) return 'cloudy';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunderstorm';
  return 'unknown';
};

export const weatherIconUrlForCategory = (
  category: WeatherConditionCategory,
  assetOrigin = defaultWeatherAssetOrigin
) => {
  try {
    const origin = new URL(assetOrigin, defaultWeatherAssetOrigin);
    origin.protocol = 'https:';
    origin.pathname = `/weather-icons/${category}.png`;
    origin.search = '';
    origin.hash = '';
    return origin.toString();
  } catch {
    return `${defaultWeatherAssetOrigin}/weather-icons/${category}.png`;
  }
};

export const weatherCodeDescription = (code: number) => {
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';

  switch (weatherConditionCategoryForCode(code)) {
    case 'clear':
      return 'Clear';
    case 'cloudy':
      return 'Cloudy';
    case 'partly-cloudy':
      return 'Partly cloudy';
    case 'fog':
      return 'Foggy';
    case 'rain':
      return 'Rainy';
    case 'snow':
      return 'Snowy';
    case 'thunderstorm':
      return 'Thunderstorm';
    case 'unknown':
      return 'Unknown weather';
  }
};

const buildNormalizedWeatherSummaryInput = ({
  parsed,
  targetDate,
  timeZone,
  currentDateTime,
  currentTemperature,
  maximumWindGust
}: {
  parsed: z.infer<typeof openMeteoResponseSchema>;
  targetDate: string;
  timeZone: UserTimeZone;
  currentDateTime: Temporal.PlainDateTime | null;
  currentTemperature: number | null;
  maximumWindGust: number | null | undefined;
}): NormalizedWeatherSummaryInput | undefined => {
  if (
    !currentDateTime ||
    !isFiniteNumber(currentTemperature) ||
    !isFiniteNumber(maximumWindGust)
  ) {
    return undefined;
  }

  const hourlyResponse = openMeteoHourlyResponseSchema.safeParse({
    hourly_units: parsed.hourly_units,
    hourly: parsed.hourly
  });

  if (!hourlyResponse.success || !hasExpectedHourlyUnits(hourlyResponse.data)) {
    return undefined;
  }

  const hourly = hourlyResponse.data.hourly;
  const lengths = [
    hourly.time.length,
    hourly.temperature_2m.length,
    hourly.precipitation_probability.length,
    hourly.precipitation.length,
    hourly.snowfall.length,
    hourly.weather_code.length,
    hourly.wind_speed_10m.length,
    hourly.wind_gusts_10m.length
  ];

  if (lengths.some((length) => length !== lengths[0]) || lengths[0] === 0) {
    return undefined;
  }

  const rows = hourly.time.map((time, index) => {
    const dateTime = parseLocalDateTime(time, timeZone);
    const temperature = hourly.temperature_2m[index];
    const precipitationProbability = hourly.precipitation_probability[index];
    const precipitation = hourly.precipitation[index];
    const snowfall = hourly.snowfall[index];
    const weatherCode = hourly.weather_code[index];
    const windSpeed = hourly.wind_speed_10m[index];
    const windGust = hourly.wind_gusts_10m[index];

    if (
      !dateTime ||
      dateTime.toPlainDate().toString() !== targetDate ||
      !isFiniteNumber(temperature) ||
      !isFiniteNumber(precipitationProbability) ||
      !isFiniteNumber(precipitation) ||
      !isFiniteNumber(snowfall) ||
      !isFiniteNumber(weatherCode) ||
      !isFiniteNumber(windSpeed) ||
      !isFiniteNumber(windGust)
    ) {
      return undefined;
    }

    return {
      dateTime,
      localTime: formatLocalTime(dateTime),
      temperature,
      precipitationProbability,
      precipitation,
      snowfall,
      weatherCode,
      windSpeed,
      windGust
    };
  });

  const validRows = rows.filter(
    (row): row is NonNullable<(typeof rows)[number]> => Boolean(row)
  );

  if (validRows.length !== rows.length) {
    return undefined;
  }

  const remainingHours = validRows
    .filter((row) => row.dateTime.hour >= currentDateTime.hour)
    .map(({ dateTime: _dateTime, ...row }) => row);

  if (remainingHours.length === 0) {
    return undefined;
  }

  return {
    units: {
      temperature: 'celsius',
      precipitationProbability: 'percent',
      precipitation: 'millimetres',
      snowfall: 'centimetres',
      wind: 'kilometres_per_hour'
    },
    current: { temperature: currentTemperature },
    day: {
      weatherCode: parsed.daily.weather_code[0]!,
      minimumTemperature: parsed.daily.temperature_2m_min[0]!,
      maximumTemperature: parsed.daily.temperature_2m_max[0]!,
      maximumPrecipitationProbability: parsed.daily.precipitation_probability_max[0]!,
      maximumWindSpeed: parsed.daily.wind_speed_10m_max[0]!,
      maximumWindGust
    },
    remainingHours
  };
};

const hasExpectedUnits = (parsed: z.infer<typeof openMeteoResponseSchema>) =>
  parsed.current_units.time === 'iso8601' &&
  parsed.current_units.temperature_2m === '°C' &&
  parsed.daily_units.time === 'iso8601' &&
  parsed.daily_units.weather_code === 'wmo code' &&
  parsed.daily_units.temperature_2m_min === '°C' &&
  parsed.daily_units.temperature_2m_max === '°C' &&
  parsed.daily_units.precipitation_probability_max === '%' &&
  parsed.daily_units.wind_speed_10m_max === 'km/h' &&
  parsed.daily_units.wind_gusts_10m_max === 'km/h';

const hasExpectedHourlyUnits = (
  parsed: z.infer<typeof openMeteoHourlyResponseSchema>
) =>
  parsed.hourly_units.time === 'iso8601' &&
  parsed.hourly_units.temperature_2m === '°C' &&
  parsed.hourly_units.precipitation_probability === '%' &&
  parsed.hourly_units.precipitation === 'mm' &&
  parsed.hourly_units.snowfall === 'cm' &&
  parsed.hourly_units.weather_code === 'wmo code' &&
  parsed.hourly_units.wind_speed_10m === 'km/h' &&
  parsed.hourly_units.wind_gusts_10m === 'km/h';

const hasValidDailyDisplayData = (
  parsed: z.infer<typeof openMeteoResponseSchema>,
  targetDate: string,
  timeZone: UserTimeZone
) => {
  const currentDateTime = parseLocalDateTime(parsed.current.time, timeZone);
  const daily = parsed.daily;

  return (
    currentDateTime?.toPlainDate().toString() === targetDate &&
    isFiniteNumber(parsed.current.temperature_2m) &&
    daily.time.length === 1 &&
    daily.time[0] === targetDate &&
    daily.weather_code.length === 1 &&
    daily.temperature_2m_min.length === 1 &&
    daily.temperature_2m_max.length === 1 &&
    daily.precipitation_probability_max.length === 1 &&
    daily.wind_speed_10m_max.length === 1 &&
    daily.wind_gusts_10m_max.length === 1 &&
    isFiniteNumber(daily.weather_code[0]) &&
    isFiniteNumber(daily.temperature_2m_min[0]) &&
    isFiniteNumber(daily.temperature_2m_max[0]) &&
    isFiniteNumber(daily.precipitation_probability_max[0]) &&
    isFiniteNumber(daily.wind_speed_10m_max[0]) &&
    isFiniteNumber(daily.wind_gusts_10m_max[0])
  );
};

const buildLegacyWeatherSection = (
  forecast: DailyWeatherForecast,
  userTimeZone: UserTimeZone,
  now: Date
): WeatherGenerationState => {
  const localDate = localDateFor(now, userTimeZone);
  const dayIndex = forecast.dates.indexOf(localDate);
  const weatherCode = forecast.weatherCodes[dayIndex];
  const minimumTemperature = forecast.minimumTemperaturesCelsius[dayIndex];
  const maximumTemperature = forecast.maximumTemperaturesCelsius[dayIndex];
  const precipitationProbability = forecast.precipitationProbabilities[dayIndex];

  if (
    dayIndex === -1 ||
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
    status: 'active',
    label: 'Weather',
    detail: [
      `${weatherCodeDescription(weatherCode)}. Low ${Math.round(minimumTemperature)}C, high ${Math.round(maximumTemperature)}C.`,
      isFiniteNumber(precipitationProbability)
        ? `Chance of precipitation ${Math.round(precipitationProbability)}%.`
        : 'Chance of precipitation unavailable.'
    ].join(' ')
  };
};

const formatWeatherDetail = (display: WeatherDisplayForecast, summary?: string) => [
  `Current ${formatMetric(display.currentTemperatureCelsius)}C. ${display.conditionText}.`,
  `Low ${formatMetric(display.minimumTemperatureCelsius)}C, high ${formatMetric(display.maximumTemperatureCelsius)}C.`,
  `Chance of precipitation ${formatMetric(display.maximumPrecipitationProbabilityPercent)}%.`,
  `Wind up to ${formatMetric(display.maximumWindSpeedKmh)} km/h.`,
  ...(summary ? [summary] : [])
].join(' ');

const formatMetric = (value: number) =>
  Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\.0$/, '');

const unavailableWeatherSection = (): WeatherGenerationState => ({
  status: 'unavailable',
  label: 'Weather',
  reason: 'Live weather is unavailable right now.'
});

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

const parseLocalDateTime = (
  value: string,
  timeZone: UserTimeZone
): Temporal.PlainDateTime | null => {
  try {
    return Temporal.PlainDateTime.from(value);
  } catch {
    try {
      return Temporal.Instant.from(value).toZonedDateTimeISO(timeZone).toPlainDateTime();
    } catch {
      return null;
    }
  }
};

const formatLocalDateTime = (dateTime: Temporal.PlainDateTime) =>
  `${dateTime.toPlainDate().toString()}T${formatLocalTime(dateTime)}`;

const formatLocalTime = (dateTime: Temporal.PlainDateTime) =>
  `${dateTime.hour.toString().padStart(2, '0')}:${dateTime.minute.toString().padStart(2, '0')}`;

const localDateFor = (now: Date, timeZone: UserTimeZone) =>
  Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString();

const isIsoDate = (value: string) => {
  try {
    return Temporal.PlainDate.from(value).toString() === value;
  } catch {
    return false;
  }
};

const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const unavailableForecast = (): DailyWeatherForecastResult => ({
  outcome: 'unavailable',
  reason: 'Live weather is unavailable right now.'
});
