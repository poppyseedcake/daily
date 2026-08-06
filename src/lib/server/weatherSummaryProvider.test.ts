import { describe, expect, test, vi } from 'vitest';
import type { NormalizedWeatherSummaryInput } from '$lib/weatherForecast';
import { createOpenAiWeatherSummaryProvider } from './weatherSummaryProvider';

const normalizedInput: NormalizedWeatherSummaryInput = {
  units: {
    temperature: 'celsius',
    precipitationProbability: 'percent',
    precipitation: 'millimetres',
    snowfall: 'centimetres',
    wind: 'kilometres_per_hour'
  },
  current: { temperature: 18 },
  day: {
    weatherCode: 2,
    minimumTemperature: 12,
    maximumTemperature: 22,
    maximumPrecipitationProbability: 35,
    maximumWindSpeed: 24,
    maximumWindGust: 39
  },
  remainingHours: [
    {
      localTime: '07:00',
      temperature: 17,
      precipitationProbability: 5,
      precipitation: 0,
      snowfall: 0,
      weatherCode: 2,
      windSpeed: 11,
      windGust: 19
    }
  ]
};

describe('OpenAI Weather Summary provider', () => {
  test('does not call OpenAI when the API key is missing', async () => {
    const fetcher = vi.fn();
    const provider = createOpenAiWeatherSummaryProvider({
      fetcher,
      apiKey: ''
    });

    await expect(provider.summarize(normalizedInput)).resolves.toEqual({
      outcome: 'unavailable'
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test.each([
    ['an HTTP error', new Response('', { status: 503 })],
    ['malformed JSON output', new Response(JSON.stringify({ status: 'completed', output_text: 'not-json' }))],
    ['an incomplete response', new Response(JSON.stringify({ status: 'incomplete' }))]
  ])('omits the sentence after %s', async (_failure, response) => {
    const provider = createOpenAiWeatherSummaryProvider({
      fetcher: vi.fn().mockResolvedValue(response),
      apiKey: 'test-key'
    });

    await expect(provider.summarize(normalizedInput)).resolves.toEqual({
      outcome: 'unavailable'
    });
  });

  test('sends only normalized weather facts with the locked Responses contract', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'completed',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({ summary: 'Clouds clear by noon.' })
            }]
          }]
        })
      )
    );
    const provider = createOpenAiWeatherSummaryProvider({
      fetcher,
      apiKey: 'test-key'
    });

    await expect(provider.summarize(normalizedInput)).resolves.toEqual({
      outcome: 'available',
      sentence: 'Clouds clear by noon.'
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init).toEqual(expect.objectContaining({
      method: 'POST',
      headers: {
        authorization: 'Bearer test-key',
        'content-type': 'application/json'
      },
      signal: expect.any(AbortSignal)
    }));

    const body = JSON.parse(String(init?.body));
    expect(body).toEqual(expect.objectContaining({
      model: 'gpt-5.6-luna',
      reasoning: { effort: 'none' },
      store: false,
      tools: [],
      max_output_tokens: expect.any(Number),
      text: {
        format: {
          type: 'json_schema',
          name: 'daily_weather_summary',
          strict: true,
          schema: {
            type: 'object',
            properties: { summary: { type: 'string' } },
            required: ['summary'],
            additionalProperties: false
          }
        }
      }
    }));
    expect(body.input[1]).toEqual({
      role: 'user',
      content: JSON.stringify(normalizedInput)
    });
    expect(JSON.stringify(body)).not.toContain('Warsaw');
    expect(JSON.stringify(body)).not.toContain('Europe/Warsaw');
  });

  test.each([
    'This sentence has too many words and should be omitted because it is not safe to send.',
    'Pack an umbrella.',
    'Warsaw is sunny.'
  ])('omits an unsupported sentence instead of exposing it to the renderer', async (summary) => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        status: 'completed',
        output_text: JSON.stringify({ summary })
      }))
    );
    const provider = createOpenAiWeatherSummaryProvider({
      fetcher,
      apiKey: 'test-key'
    });

    await expect(provider.summarize(normalizedInput)).resolves.toEqual({
      outcome: 'unavailable'
    });
  });
});
