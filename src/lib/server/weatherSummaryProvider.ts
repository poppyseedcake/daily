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

export type WeatherSummaryDiagnostic = {
  reason:
    | 'missing-api-key'
    | 'missing-weather-context'
    | 'invalid-configuration'
    | 'invalid-input'
    | 'http-error'
    | 'incomplete-response'
    | 'missing-output'
    | 'invalid-response'
    | 'sentence-too-long'
    | 'sentence-rejected'
    | 'available'
    | 'timeout'
    | 'request-failed';
  durationMilliseconds: number;
  attempt: number;
  httpStatus?: number;
};

export const writeWeatherSummaryDiagnostic = (diagnostic: WeatherSummaryDiagnostic) => {
  try {
    console.log(JSON.stringify({ eventCode: 'weather-summary', ...diagnostic }));
  } catch {
    // Diagnostics must not prevent delivery.
  }
};

type OpenAiWeatherSummaryProviderOptions = {
  apiKey?: string;
  fetcher?: typeof fetch;
  model?: string;
  reasoningEffort?: string;
  maxCharacters?: number;
  maxOutputTokens?: number;
  timeoutMilliseconds?: number;
  onDiagnostic?: (diagnostic: WeatherSummaryDiagnostic) => void;
};

const openAiResponsesUrl = 'https://api.openai.com/v1/responses';
const defaultWeatherModel = 'gpt-5.6-luna';
const defaultSummaryTimeoutMilliseconds = 3_000;
const defaultSummaryMaxCharacters = 160;
const reasoningEfforts = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const configurationSchema = z.object({
  model: z.string().trim().min(1).max(200).regex(/^[^\s]+$/),
  reasoningEffort: z.enum(reasoningEfforts),
  maxCharacters: z.number().int().min(1).max(2000),
  maxOutputTokens: z.number().int().min(16).max(128_000),
  timeoutMilliseconds: z.number().int().min(1).max(120_000)
});

const optionalEnvironmentInteger = (value: string | undefined): number | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
};

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

const weatherSummaryDeveloperInstruction = (maxCharacters: number) => [
  'Write exactly one factual English weather sentence on one line.',
  'Use only the normalized weather values supplied by the user.',
  `Use at most ${maxCharacters} characters, including spaces and punctuation.`,
  'Prioritize unusual or actionable conditions and their local time of day.',
  'Do not mention a location, identity, greeting, recommendation, action, or unsupported fact.',
  'End the sentence with one period.'
].join(' ');

const weatherSummaryLeadPattern = /^(?:after|around|at|before|becomes?|by|chance|clear(?:er|ing)?|cloud(?:y|s)?|cold|conditions?|cool|drizzle|dry|expect(?:ed)?|fog(?:gy)?|freezing|gusts?|hail|heavy|hot|later|likely|light|mainly|mild|mostly|no|overcast|partly|possible|precipitation|rain(?:y)?|showers?|snow(?:y)?|some|storms?|strong|sun(?:ny)?|temperatures?|thunderstorms?|today|unsettled|variable|visibility|warm|weather|wet|winds?)\b/i;
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
  model = env.OPENAI_WEATHER_MODEL?.trim() || defaultWeatherModel,
  reasoningEffort = env.OPENAI_WEATHER_REASONING_EFFORT?.trim() || 'none',
  maxCharacters = optionalEnvironmentInteger(env.OPENAI_WEATHER_MAX_CHARACTERS) ?? defaultSummaryMaxCharacters,
  maxOutputTokens = optionalEnvironmentInteger(env.OPENAI_WEATHER_MAX_OUTPUT_TOKENS) ??
    (reasoningEffort === 'none' ? Math.max(256, maxCharacters + 32) : 25_000),
  timeoutMilliseconds = optionalEnvironmentInteger(env.OPENAI_WEATHER_TIMEOUT_MS) ??
    (reasoningEffort === 'none' ? defaultSummaryTimeoutMilliseconds : 30_000),
  onDiagnostic = () => {}
}: OpenAiWeatherSummaryProviderOptions = {}): WeatherSummaryProvider => ({
  async summarize(input) {
    const startedAt = Date.now();
    let attempt = 0;
    let readingResponse = false;
    const report = (reason: WeatherSummaryDiagnostic['reason'], httpStatus?: number) => {
      try {
        onDiagnostic({
          reason,
          durationMilliseconds: Date.now() - startedAt,
          attempt,
          ...(httpStatus === undefined ? {} : { httpStatus })
        });
      } catch {
        // Diagnostics must not change the summary result.
      }
    };
    if (!apiKey) {
      report('missing-api-key');
      return { outcome: 'unavailable' };
    }

    try {
      const configuration = configurationSchema.safeParse({
        model, reasoningEffort, maxCharacters, maxOutputTokens, timeoutMilliseconds
      });
      if (!configuration.success) {
        report('invalid-configuration');
        return { outcome: 'unavailable' };
      }
      const sanitizedInput = sanitizeWeatherSummaryInput(input);
      const normalizedInput = normalizedWeatherSummaryInputSchema.safeParse(sanitizedInput);
      if (!normalizedInput.success) {
        report('invalid-input');
        return { outcome: 'unavailable' };
      }

      for (attempt = 1; attempt <= 2; attempt += 1) {
        readingResponse = false;
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
              model: configuration.data.model,
              reasoning: { effort: configuration.data.reasoningEffort },
              store: false,
              tools: [],
              max_output_tokens: configuration.data.maxOutputTokens,
              input: [
                {
                  role: 'developer',
                  content: weatherSummaryDeveloperInstruction(
                    attempt === 1 ? maxCharacters : Math.max(1, Math.floor(maxCharacters * 0.7))
                  )
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
          report('http-error', response.status);
          return { outcome: 'unavailable' };
        }

        readingResponse = true;
        const payload = responsePayloadSchema.parse(await response.json());

        if (payload.status !== 'completed') {
          report('incomplete-response', response.status);
          return { outcome: 'unavailable' };
        }

        const responseText = responseTextFrom(payload);
        if (!responseText) {
          report('missing-output', response.status);
          return { outcome: 'unavailable' };
        }

        const parsedSummary = structuredSummarySchema.safeParse(JSON.parse(responseText));
        if (!parsedSummary.success) {
          report('invalid-response', response.status);
          return { outcome: 'unavailable' };
        }

        if (Array.from(parsedSummary.data.summary.trim()).length > maxCharacters) {
          report('sentence-too-long', response.status);
          if (attempt === 1) continue;
          return { outcome: 'unavailable' };
        }

        const sentence = validateWeatherSummarySentence(parsedSummary.data.summary, normalizedInput.data, maxCharacters);
        report(sentence ? 'available' : 'sentence-rejected', response.status);
        return sentence ? { outcome: 'available', sentence } : { outcome: 'unavailable' };
      }
      return { outcome: 'unavailable' };
    } catch (error) {
      report(error instanceof Error && error.name === 'AbortError'
        ? 'timeout'
        : readingResponse ? 'invalid-response' : 'request-failed');
      return { outcome: 'unavailable' };
    }
  }
});

export const openAiWeatherSummaryProvider = createOpenAiWeatherSummaryProvider({
  onDiagnostic: writeWeatherSummaryDiagnostic
});

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
  input: NormalizedWeatherSummaryInput,
  maxCharacters: number
) => {
  const sentence = value.trim();
  if (
    !sentence ||
    /[\r\n]/.test(sentence) ||
    Array.from(sentence).length > maxCharacters ||
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
