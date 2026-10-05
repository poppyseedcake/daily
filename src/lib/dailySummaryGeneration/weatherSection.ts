import { Temporal } from '@js-temporal/polyfill';
import type { DailySummaryInput } from '../dailySummaryRenderer';
import type { SummaryConfiguration } from '../summaryConfiguration';
import type { WeatherLocation } from '../weatherLocation';
import {
  weatherConditionCategoryForCode,
  weatherIconUrlForCategory,
  weatherCodeDescription,
  type DailyWeatherForecast,
  type WeatherDisplayForecast,
  type WeatherForecastProvider,
  type WeatherSummaryObservability,
  type WeatherSummaryProvider
} from '../weatherForecast';
import type { WeatherSummaryDiagnostic } from '../weatherSummaryContract';

type WeatherSectionRequest = {
  configuration: SummaryConfiguration;
  location: WeatherLocation | null;
  locationUnavailable?: boolean;
  now: Date;
  assetOrigin?: string;
  observability?: Omit<WeatherSummaryObservability, 'traceId'>;
};

export type WeatherSectionGenerator = {
  generate(request: WeatherSectionRequest): Promise<DailySummaryInput['sections']['weather']>;
};

export const createWeatherSectionGenerator = ({ forecastProvider, summaryProvider, onDiagnostic }: {
  forecastProvider: WeatherForecastProvider;
  summaryProvider?: WeatherSummaryProvider;
  onDiagnostic?: (diagnostic: WeatherSummaryDiagnostic & { traceId: string }) => void;
}): WeatherSectionGenerator => ({
  async generate({ configuration, location, locationUnavailable = false, now, assetOrigin, observability }) {
    if (configuration.sectionPauses.weather) {
      return { status: 'paused', detail: 'Weather is paused.' };
    }
    if (locationUnavailable) return unavailable();
    if (!location) {
      return { status: 'unconfigured', detail: 'Choose a Weather Location to include local weather.' };
    }

    let traceId: string | undefined;
    try {
      traceId = crypto.randomUUID();
    } catch {
      // Tracing must not change the Weather Section.
    }
    const report = (diagnostic: WeatherSummaryDiagnostic) => {
      if (!traceId) return;
      try {
        onDiagnostic?.({ ...diagnostic, traceId });
      } catch {
        // Diagnostics must not change the Weather Section.
      }
    };
    const startedAt = performance.now();
    try {
      const result = await forecastProvider.fetchDailyForecast({
        latitude: location.latitude,
        longitude: location.longitude,
        timeZone: configuration.userTimeZone,
        targetDate: localDateFor(now, configuration.userTimeZone)
      });
      if (result.outcome === 'unavailable') {
        return { status: 'unavailable', reason: result.reason };
      }
      if (!result.forecast.summaryInput) {
        report({
          reason: 'missing-weather-context',
          durationMilliseconds: Math.round(performance.now() - startedAt),
          attempt: 0
        });
      }
      if (result.forecast.currentTemperatureCelsius === undefined) {
        return buildLegacyWeatherSection(result.forecast, configuration.userTimeZone, now);
      }
      const display = buildWeatherDisplayForecast({
        forecast: result.forecast, userTimeZone: configuration.userTimeZone, now, assetOrigin
      });
      if (!display) return unavailable();
      let summary: string | undefined;
      if (result.forecast.summaryInput && summaryProvider) {
        try {
          const summaryObservability = observability && traceId ? { ...observability, traceId } : undefined;
          const sentence = await summaryProvider.summarize(
            result.forecast.summaryInput,
            onDiagnostic || summaryObservability
              ? {
                  ...(onDiagnostic ? { onDiagnostic: report } : {}),
                  ...(summaryObservability ? { observability: summaryObservability } : {})
                }
              : undefined
          );
          if (sentence.outcome === 'available') summary = sentence.sentence;
        } catch {
          // The optional sentence must not discard forecast facts.
        }
      }
      return {
        status: 'active',
        detail: formatWeatherDetail(display, summary),
        content: { ...display, locationLabel: location.label, ...(summary ? { summary } : {}) }
      };
    } catch {
      return unavailable();
    }
  }
});

const unavailable = (): DailySummaryInput['sections']['weather'] => ({
  status: 'unavailable', reason: 'Live weather is unavailable right now.'
});

const formatWeatherDetail = (display: WeatherDisplayForecast, summary?: string) => [
  `Current ${formatMetric(display.currentTemperatureCelsius)}C. ${display.conditionText}.`,
  `Low ${formatMetric(display.minimumTemperatureCelsius)}C, high ${formatMetric(display.maximumTemperatureCelsius)}C.`,
  `Chance of precipitation ${formatMetric(display.maximumPrecipitationProbabilityPercent)}%.`,
  `Wind up to ${formatMetric(display.maximumWindSpeedKmh)} km/h.`,
  ...(summary ? [summary] : [])
].join(' ');

const formatMetric = (value: number) =>
  Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\.0$/, '');

const buildLegacyWeatherSection = (
  forecast: DailyWeatherForecast,
  userTimeZone: SummaryConfiguration['userTimeZone'],
  now: Date
): DailySummaryInput['sections']['weather'] => {
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
      reason: 'Weather forecast is not available for today.'
    };
  }

  return {
    status: 'active',
    detail: [
      `${weatherCodeDescription(weatherCode)}. Low ${Math.round(minimumTemperature)}C, high ${Math.round(maximumTemperature)}C.`,
      isFiniteNumber(precipitationProbability)
        ? `Chance of precipitation ${Math.round(precipitationProbability)}%.`
        : 'Chance of precipitation unavailable.'
    ].join(' ')
  };
};

const localDateFor = (now: Date, timeZone: string) =>
  Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(timeZone).toPlainDate().toString();

const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const buildWeatherDisplayForecast = ({
  forecast,
  userTimeZone,
  now = new Date(),
  assetOrigin
}: {
  forecast: DailyWeatherForecast;
  userTimeZone: SummaryConfiguration['userTimeZone'];
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
