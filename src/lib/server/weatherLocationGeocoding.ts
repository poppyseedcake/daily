import { z } from 'zod';
import { weatherLocationSchema, type WeatherLocation } from '$lib/weatherLocation';

export const weatherLocationSearchQuerySchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .refine((query) => !/[<>]/.test(query), 'Weather Location search contains unsafe characters.');

export type WeatherLocationGeocodingProvider = {
  search: (query: string) => Promise<WeatherLocation[]>;
};

const deterministicLocations: WeatherLocation[] = [
  {
    label: 'Springfield, Illinois, United States',
    latitude: 39.799,
    longitude: -89.644
  },
  {
    label: 'Springfield, Massachusetts, United States',
    latitude: 42.101,
    longitude: -72.589
  },
  {
    label: 'Warsaw, Masovian Voivodeship, Poland',
    latitude: 52.2297,
    longitude: 21.0122
  }
];

export const deterministicWeatherLocationGeocodingProvider: WeatherLocationGeocodingProvider = {
  async search(query) {
    const normalizedQuery = query.toLowerCase();

    return deterministicLocations.filter((location) =>
      location.label.toLowerCase().includes(normalizedQuery)
    );
  }
};

export const searchWeatherLocations = async (
  provider: WeatherLocationGeocodingProvider,
  query: unknown
): Promise<
  | { outcome: 'found'; locations: WeatherLocation[] }
  | { outcome: 'invalid-query' }
  | { outcome: 'unavailable'; reason: string }
> => {
  const result = weatherLocationSearchQuerySchema.safeParse(query);

  if (!result.success) {
    return { outcome: 'invalid-query' };
  }

  try {
    const locations = await provider.search(result.data);

    return {
      outcome: 'found',
      locations: z.array(weatherLocationSchema).parse(locations)
    };
  } catch {
    return {
      outcome: 'unavailable',
      reason: 'Weather Location search is unavailable right now.'
    };
  }
};
