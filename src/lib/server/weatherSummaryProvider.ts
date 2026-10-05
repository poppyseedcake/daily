import { env } from '$env/dynamic/private';
import { z } from 'zod';
import {
  type NormalizedWeatherSummaryInput,
  type WeatherSummaryObservability,
  type WeatherSummaryProvider as WeatherSummaryProviderContract
} from '$lib/weatherForecast';
import { normalizedWeatherSummaryInputSchema, type WeatherSummaryDiagnostic } from '$lib/weatherSummaryContract';
import { getServerPostHogClient } from './posthog';

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
  ).optional(),
  usage: z.object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional()
  }).optional()
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
  async summarize(input, options) {
    const observability = options?.observability;
    const startedAt = Date.now();
    let attempt = 0;
    let readingResponse = false;
    const report = (reason: WeatherSummaryDiagnostic['reason'], httpStatus?: number) => {
      try {
        (options?.onDiagnostic ?? onDiagnostic)({
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
        const inputMessages = [
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
        ];
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
              input: inputMessages,
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
          await captureOpenAiWeatherGeneration({
            observability,
            model: configuration.data.model,
            maxOutputTokens: configuration.data.maxOutputTokens,
            input: inputMessages,
            httpStatus: response.status,
            latencySeconds: (Date.now() - startedAt) / 1_000,
            error: `OpenAI Responses request returned HTTP ${response.status}.`
          });
          report('http-error', response.status);
          return { outcome: 'unavailable' };
        }

        readingResponse = true;
        const payload = responsePayloadSchema.parse(await response.json());
        const responseText = responseTextFrom(payload);
        await captureOpenAiWeatherGeneration({
          observability,
          model: configuration.data.model,
          maxOutputTokens: configuration.data.maxOutputTokens,
          input: inputMessages,
          output: responseText,
          inputTokens: payload.usage?.input_tokens,
          outputTokens: payload.usage?.output_tokens,
          httpStatus: response.status,
          latencySeconds: (Date.now() - startedAt) / 1_000,
          error: payload.status === 'completed' && responseText
            ? undefined
            : 'OpenAI Responses response was incomplete or did not contain output.'
        });

        if (payload.status !== 'completed') {
          report('incomplete-response', response.status);
          return { outcome: 'unavailable' };
        }

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

const captureOpenAiWeatherGeneration = async ({
  observability,
  model,
  maxOutputTokens,
  input,
  output,
  inputTokens,
  outputTokens,
  httpStatus,
  latencySeconds,
  error
}: {
  observability: WeatherSummaryObservability | undefined;
  model: string;
  maxOutputTokens: number;
  input: Array<{ role: string; content: string }>;
  output?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  httpStatus: number;
  latencySeconds: number;
  error?: string;
}) => {
  if (!observability) return;

  try {
    const posthog = getServerPostHogClient();
    if (!posthog) return;

    posthog.capture({
      distinctId: observability.distinctId,
      event: '$ai_generation',
      properties: {
        $ai_trace_id: observability.traceId,
        $ai_session_id: observability.sessionId,
        $ai_span_name: 'daily_weather_summary',
        $ai_model: model,
        $ai_provider: 'openai',
        $ai_input: input,
        $ai_output_choices: output ? [{ role: 'assistant', content: output }] : [],
        $ai_max_tokens: maxOutputTokens,
        $ai_http_status: httpStatus,
        $ai_latency: latencySeconds,
        $ai_is_error: Boolean(error),
        ...(error ? { $ai_error: error } : {}),
        ...(inputTokens === undefined ? {} : { $ai_input_tokens: inputTokens }),
        ...(outputTokens === undefined ? {} : { $ai_output_tokens: outputTokens })
      }
    });
    await posthog.flush();
  } catch {
    // AI observability must not change weather-summary delivery.
  }
};

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
