import { env } from '$env/dynamic/private';
import { z } from 'zod';
import {
  weatherConditionCategoryForCode,
  type WeatherConditionCategory,
  type NormalizedWeatherSummaryInput,
  type WeatherSummaryProvider as WeatherSummaryProviderContract
} from '$lib/weatherForecast';
import { normalizedWeatherSummaryInputSchema } from '$lib/weatherSummaryContract';

export type WeatherSummaryProvider = WeatherSummaryProviderContract;

type OpenAiWeatherSummaryProviderOptions = {
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMilliseconds?: number;
};

const openAiResponsesUrl = 'https://api.openai.com/v1/responses';
const openAiWeatherModel = 'gpt-5.6-luna';
const defaultSummaryTimeoutMilliseconds = 3_000;
const maxSummaryOutputTokens = 64;

const responsePayloadSchema = z.object({
  status: z.string(),
  output_text: z.string().optional(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z.array(
        z.object({
          type: z.string(),
          text: z.string().optional(),
          refusal: z.string().optional()
        }).passthrough()
      ).optional()
    }).passthrough()
  ).optional()
}).passthrough();

const structuredSummarySchema = z.object({
  summary: z.string()
});

const weatherSummaryDeveloperInstruction = [
  'Write exactly one factual English weather sentence on one line.',
  'Use only the normalized weather values supplied by the user.',
  'Use at most 15 whitespace-delimited words.',
  'Prioritize unusual or actionable conditions and their local time of day.',
  'Do not mention a location, identity, greeting, recommendation, action, or unsupported fact.',
  'End the sentence with one period.'
].join(' ');

const weatherSummaryLeadPattern = /^(?:after|around|at|before|becomes?|by|chance|clear(?:er|ing)?|clouds?|cold|conditions?|cool|drizzle|dry|expect(?:ed)?|fog(?:gy)?|freezing|gusts?|hail|heavy|hot|later|likely|light|mainly|mild|mostly|no|overcast|partly|possible|precipitation|rain(?:y)?|showers?|snow(?:y)?|some|storms?|strong|sun(?:ny)?|temperatures?|thunderstorms?|today|unsettled|variable|visibility|warm|weather|wet|winds?)\b/i;
const unsupportedSummaryTermsPattern = /\b(?:advised|avoid|bring|carry|coat|grab|jacket|pack|recommend(?:ed)?|should|suggest(?:ed)?|sunscreen|take|umbrella|wear)\b/i;

type WeatherClaimFamily = Exclude<WeatherConditionCategory, 'unknown'>;

const weatherClaimPatterns: ReadonlyArray<{
  pattern: RegExp;
  families: readonly WeatherClaimFamily[];
}> = [
  { pattern: /\b(?:clear|sun(?:ny|shine)?)\b/i, families: ['clear'] },
  { pattern: /\b(?:partly(?:[ -]+cloudy)?|mainly clear)\b/i, families: ['partly-cloudy', 'clear'] },
  { pattern: /\b(?:cloud(?:y|s)?|overcast)\b/i, families: ['partly-cloudy', 'cloudy'] },
  { pattern: /\b(?:fog|foggy|mist|misty)\b/i, families: ['fog'] },
  { pattern: /\b(?:drizzle|rain(?:y)?|shower(?:s)?|wet)\b/i, families: ['rain'] },
  { pattern: /\b(?:flurr(?:y|ies)|snow(?:fall|y)?)\b/i, families: ['snow'] },
  { pattern: /\b(?:hail|lightning|storm(?:s)?|thunder(?:storm)?s?)\b/i, families: ['thunderstorm'] }
];

export const createOpenAiWeatherSummaryProvider = ({
  apiKey = env.OPENAI_API_KEY,
  fetcher = fetch,
  timeoutMilliseconds = defaultSummaryTimeoutMilliseconds
}: OpenAiWeatherSummaryProviderOptions = {}): WeatherSummaryProvider => ({
  async summarize(input) {
    if (!apiKey) {
      return { outcome: 'unavailable' };
    }

    try {
      const sanitizedInput = sanitizeWeatherSummaryInput(input);
      const normalizedInput = normalizedWeatherSummaryInputSchema.safeParse(sanitizedInput);
      if (!normalizedInput.success) {
        return { outcome: 'unavailable' };
      }

      const response = await fetchWithTimeout(
        fetcher,
        openAiResponsesUrl,
        timeoutMilliseconds,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: openAiWeatherModel,
            reasoning: { effort: 'none' },
            store: false,
            tools: [],
            max_output_tokens: maxSummaryOutputTokens,
            input: [
              {
                role: 'developer',
                content: weatherSummaryDeveloperInstruction
              },
              {
                role: 'user',
                content: JSON.stringify(normalizedInput.data)
              }
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'daily_weather_summary',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    summary: { type: 'string' }
                  },
                  required: ['summary'],
                  additionalProperties: false
                }
              }
            }
          })
        }
      );

      if (!response.ok) {
        return { outcome: 'unavailable' };
      }

      const payload = responsePayloadSchema.parse(await response.json());

      if (payload.status !== 'completed') {
        return { outcome: 'unavailable' };
      }

      const responseText = responseTextFrom(payload);
      if (!responseText) {
        return { outcome: 'unavailable' };
      }

      const parsedSummary = structuredSummarySchema.safeParse(JSON.parse(responseText));
      if (!parsedSummary.success) {
        return { outcome: 'unavailable' };
      }

      const sentence = validateWeatherSummarySentence(parsedSummary.data.summary, normalizedInput.data);
      return sentence ? { outcome: 'available', sentence } : { outcome: 'unavailable' };
    } catch {
      return { outcome: 'unavailable' };
    }
  }
});

export const openAiWeatherSummaryProvider = createOpenAiWeatherSummaryProvider();

const responseTextFrom = (payload: z.infer<typeof responsePayloadSchema>) => {
  if (payload.output_text?.trim()) {
    return payload.output_text;
  }

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text?.trim()) {
        return content.text;
      }
    }
  }

  return null;
};

const validateWeatherSummarySentence = (
  value: string,
  input: NormalizedWeatherSummaryInput
) => {
  const sentence = value.trim();
  if (
    !sentence ||
    /[\r\n]/.test(sentence) ||
    sentence.split(/\s+/).length > 15 ||
    !/[.!?]$/.test(sentence) ||
    sentence.split(/[.!?]+(?=\s|$)/).filter(Boolean).length !== 1 ||
    !weatherSummaryLeadPattern.test(sentence) ||
    unsupportedSummaryTermsPattern.test(sentence) ||
    !hasGroundedWeatherClaims(sentence, input)
  ) {
    return null;
  }

  const supportedNumbers = new Set(
    JSON.stringify(input).match(/-?\d+(?:\.\d+)?/g) ?? []
  );
  const sentenceNumbers = sentence.match(/-?\d+(?:\.\d+)?/g) ?? [];

  if (sentenceNumbers.some((number) => !supportedNumbers.has(number))) {
    return null;
  }

  return sentence;
};

const hasGroundedWeatherClaims = (
  sentence: string,
  input: NormalizedWeatherSummaryInput
) => {
  const supportedFamilies = new Set(
    [input.day.weatherCode, ...input.remainingHours.map((hour) => hour.weatherCode)]
      .flatMap(weatherClaimFamiliesForCode)
  );

  return weatherClaimPatterns.every(({ pattern, families }) =>
    !pattern.test(sentence) || families.some((family) => supportedFamilies.has(family))
  );
};

const weatherClaimFamiliesForCode = (code: number): WeatherClaimFamily[] => {
  if (code === 1) return ['clear'];

  const category = weatherConditionCategoryForCode(code);
  return category === 'unknown' ? [] : [category];
};

const sanitizeWeatherSummaryInput = (input: NormalizedWeatherSummaryInput): NormalizedWeatherSummaryInput => ({
  units: {
    temperature: 'celsius',
    precipitationProbability: 'percent',
    precipitation: 'millimetres',
    snowfall: 'centimetres',
    wind: 'kilometres_per_hour'
  },
  current: {
    temperature: input.current.temperature
  },
  day: {
    weatherCode: input.day.weatherCode,
    minimumTemperature: input.day.minimumTemperature,
    maximumTemperature: input.day.maximumTemperature,
    maximumPrecipitationProbability: input.day.maximumPrecipitationProbability,
    maximumWindSpeed: input.day.maximumWindSpeed,
    maximumWindGust: input.day.maximumWindGust
  },
  remainingHours: input.remainingHours.map((hour) => ({
    localTime: hour.localTime,
    temperature: hour.temperature,
    precipitationProbability: hour.precipitationProbability,
    precipitation: hour.precipitation,
    snowfall: hour.snowfall,
    weatherCode: hour.weatherCode,
    windSpeed: hour.windSpeed,
    windGust: hour.windGust
  }))
});

const fetchWithTimeout = async (
  fetcher: typeof fetch,
  url: string,
  timeoutMilliseconds: number,
  init: RequestInit
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);

  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};
