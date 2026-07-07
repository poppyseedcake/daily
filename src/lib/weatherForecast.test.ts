import { describe, expect, test } from 'vitest';
import { buildWeatherSection, weatherCodeDescription } from './weatherForecast';

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
});
