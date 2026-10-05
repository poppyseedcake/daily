import { env } from '$env/dynamic/private';
import { z } from 'zod';
import {
  type NormalizedWeatherSummaryInput,
  type WeatherSummaryProvider as WeatherSummaryProviderContract
} from '$lib/weatherForecast';
import { normalizedWeatherSummaryInputSchema, type WeatherSummaryDiagnostic } from '$lib/weatherSummaryContract';

export type WeatherSummaryProvider = WeatherSummaryProviderContract;

export type { WeatherSummaryDiagnostic } from '$lib/weatherSummaryContract';

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
  prompt?: string;
  onDiagnostic?: (diagnostic: WeatherSummaryDiagnostic) => void;
};

const openAiResponsesUrl = 'https://api.openai.com/v1/responses';
const defaultWeatherModel = 'gpt-6-luna';
const defaultSummaryTimeoutMilliseconds = 5_000;
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

const defaultWeatherSummaryPrompt = [
  'Write exactly one factual English weather sentence on one line.',
  'Use only the normalized weather values supplied by the user.',
  'Use at most {{maxCharacters}} characters, including spaces and punctuation.',
  'Prioritize unusual or actionable conditions and their local time of day.',
  'Do not mention a location, identity, greeting, recommendation, action, or unsupported fact.',
  'End the sentence with one period.'
].join(' ');

const weatherSummaryDeveloperInstruction = (prompt: string, maxCharacters: number) =>
  prompt.includes('{{maxCharacters}}')
    ? prompt.replaceAll('{{maxCharacters}}', String(maxCharacters))
    : `${prompt} Use at most ${maxCharacters} characters, including spaces and punctuation.`;

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
  prompt = env.OPENAI_WEATHER_PROMPT,
  onDiagnostic = () => {}
}: OpenAiWeatherSummaryProviderOptions = {}): WeatherSummaryProvider => ({
  async summarize(input, diagnosticOptions) {
    const startedAt = Date.now();
    let attempt = 0;
    let readingResponse = false;
    const report = (reason: WeatherSummaryDiagnostic['reason'], httpStatus?: number) => {
      try {
        (diagnosticOptions?.onDiagnostic ?? onDiagnostic)({
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
                    prompt?.trim() || defaultWeatherSummaryPrompt,
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

        const sentence = validateWeatherSummarySentence(parsedSummary.data.summary, maxCharacters);
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

// Content constraints are currently enforced through the configured prompt only.
const validateWeatherSummarySentence = (
  value: string,
  maxCharacters: number
) => {
  const sentence = value.trim();
  if (
    !sentence ||
    /[\r\n]/.test(sentence) ||
    Array.from(sentence).length > maxCharacters ||
    !/[.!?]$/.test(sentence) ||
    sentence.split(/[.!?]+(?=\s|$)/).filter(Boolean).length !== 1
  ) {
    return null;
  }

  return sentence;
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
