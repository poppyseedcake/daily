import { describe, expect, test, vi } from 'vitest';
import type { NormalizedWeatherSummaryInput } from '$lib/weatherForecast';
import { createOpenAiWeatherSummaryProvider } from './weatherSummaryProvider';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));

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
  test.each(['', '   '])('keeps the default instruction when the environment prompt is blank: %j', async (prompt) => {
    vi.stubEnv('OPENAI_WEATHER_PROMPT', prompt);
    try {
      const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        status: 'completed', output_text: JSON.stringify({ summary: 'Cloudy conditions today.' })
      })));
      await createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher }).summarize(normalizedInput);
      const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
      expect(body.input[0].content).toContain('Write exactly one factual English weather sentence on one line.');
      expect(body.input[0].content).toContain('at most 160 characters');
      expect(body.input[0].content).not.toContain('{{maxCharacters}}');
    } finally { vi.unstubAllEnvs(); }
  });

  test('appends the character target to a prompt without a placeholder', async () => {
    vi.stubEnv('OPENAI_WEATHER_PROMPT', 'Describe wind before temperature.');
    try {
      const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        status: 'completed', output_text: JSON.stringify({ summary: 'Cloudy conditions today.' })
      })));
      await createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher, maxCharacters: 80 }).summarize(normalizedInput);
      const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
      expect(body.input[0].content).toBe('Describe wind before temperature. Use at most 80 characters, including spaces and punctuation.');
    } finally { vi.unstubAllEnvs(); }
  });

  test('uses the environment prompt on both requests and substitutes the shorter retry limit', async () => {
    vi.stubEnv('OPENAI_WEATHER_PROMPT', 'Describe the wind first. Use at most {{maxCharacters}} characters.');
    try {
      const sentences = ['Today will be cloudy, with temperatures around 18°C, no rain, and winds up to 12 km/h.', 'Cloudy conditions today.'];
      const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
        status: 'completed', output_text: JSON.stringify({ summary: sentences.shift() })
      })));
      const provider = createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher, maxCharacters: 60 });
      await expect(provider.summarize(normalizedInput)).resolves.toEqual({ outcome: 'available', sentence: 'Cloudy conditions today.' });
      const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(init.body));
      expect(bodies[0].input[0].content).toBe('Describe the wind first. Use at most 60 characters.');
      expect(bodies[1].input[0].content).toBe('Describe the wind first. Use at most 42 characters.');
      expect(bodies[1].input[1]).toEqual(bodies[0].input[1]);
    } finally { vi.unstubAllEnvs(); }
  });

  test('uses environment configuration for model, reasoning, and the character limit', async () => {
    vi.stubEnv('OPENAI_WEATHER_MODEL', 'gpt-5.6-terra');
    vi.stubEnv('OPENAI_WEATHER_REASONING_EFFORT', 'low');
    vi.stubEnv('OPENAI_WEATHER_MAX_CHARACTERS', '80');
    vi.stubEnv('OPENAI_WEATHER_MAX_OUTPUT_TOKENS', '4000');
    vi.stubEnv('OPENAI_WEATHER_TIMEOUT_MS', '10000');
    try {
      const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        status: 'completed', output_text: JSON.stringify({ summary: 'Cloudy conditions today.' })
      })));
      const provider = createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher });
      await expect(provider.summarize(normalizedInput)).resolves.toEqual({
        outcome: 'available', sentence: 'Cloudy conditions today.'
      });
      const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
      expect(body).toMatchObject({ model: 'gpt-5.6-terra', reasoning: { effort: 'low' }, max_output_tokens: 4000 });
      expect(body.input[0].content).toContain('at most 80 characters');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test('allocates space for reasoning tokens when reasoning is enabled', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'completed', output_text: JSON.stringify({ summary: 'Cloudy conditions today.' })
    })));
    const provider = createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher, reasoningEffort: 'high' });
    await expect(provider.summarize(normalizedInput)).resolves.toMatchObject({ outcome: 'available' });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(body.max_output_tokens).toBeGreaterThanOrEqual(25_000);
  });

  test('accepts a grounded sentence with more than 15 words inside the character limit', async () => {
    const summary = 'Today will be partly cloudy with temperatures around 18°C and winds reaching 24 km/h later today.';
    const provider = createOpenAiWeatherSummaryProvider({
      apiKey: 'test-key', maxCharacters: 160,
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        status: 'completed', output_text: JSON.stringify({ summary })
      })))
    });
    await expect(provider.summarize(normalizedInput)).resolves.toEqual({ outcome: 'available', sentence: summary });
  });

  test('counts Unicode characters, spaces, and punctuation, and accepts the exact limit', async () => {
    const summary = 'Cloudy conditions 🌥 today.';
    const length = Array.from(summary).length;
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      status: 'completed', output_text: JSON.stringify({ summary: `  ${summary}  ` })
    })));
    const provider = createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher, maxCharacters: length });
    await expect(provider.summarize(normalizedInput)).resolves.toEqual({ outcome: 'available', sentence: summary });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const tooShort = createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher, maxCharacters: length - 1 });
    await expect(tooShort.summarize(normalizedInput)).resolves.toEqual({ outcome: 'unavailable' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  test.each([
    { maxCharacters: 0 }, { maxCharacters: 1.5 }, { maxCharacters: 2001 },
    { maxCharacters: Number.NaN }, { reasoningEffort: 'unsupported' }, { model: ' ' },
    { maxOutputTokens: 0 }, { timeoutMilliseconds: -1 }
  ])('rejects invalid configuration before making an API request: %j', async (configuration) => {
    const fetcher = vi.fn();
    const onDiagnostic = vi.fn();
    const provider = createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher, onDiagnostic, ...configuration });
    await expect(provider.summarize(normalizedInput)).resolves.toEqual({ outcome: 'unavailable' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(onDiagnostic).toHaveBeenCalledWith({
      reason: 'invalid-configuration', attempt: 0, durationMilliseconds: expect.any(Number)
    });
  });

  test.each([
    'A cloudy day with mild winds.',
    'The day stays cloudy with mild winds.',
    'It stays cloudy throughout the day.',
    'This afternoon remains cloudy.',
    'Cloudy skies with no rain expected.',
    'Cloudy skies without rain or snow.',
    'Rain is not expected under cloudy skies.',
    'Cloudy skies with rain unlikely.',
    'Cloudy skies with no heavy rain expected.'
  ])('accepts natural weather wording and grounded negative claims: %s', async (summary) => {
    const provider = createOpenAiWeatherSummaryProvider({
      apiKey: 'test-key',
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        status: 'completed', output_text: JSON.stringify({ summary })
      })))
    });

    await expect(provider.summarize(normalizedInput)).resolves.toEqual({
      outcome: 'available', sentence: summary
    });
  });

  test.each([
    'Cloudy skies with no rain, but snow expected.',
    'No rain expected, with heavy snow later.',
    'No rain expected and snow showers later.',
    'A rainy day with mild winds.',
    'This message has been delivered.',
    'Hello, cloudy skies today.',
    'Warsaw is cloudy today.',
    'The cloudy weather means you should carry an umbrella.'
  ])('still rejects unsupported claims and non-weather content: %s', async (summary) => {
    const provider = createOpenAiWeatherSummaryProvider({
      apiKey: 'test-key',
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        status: 'completed', output_text: JSON.stringify({ summary })
      })))
    });

    await expect(provider.summarize(normalizedInput)).resolves.toEqual({ outcome: 'unavailable' });
  });

  test.each([
    'Rain expected today, with no snow.',
    'No snow expected, but rain later.',
    'No snow expected and rain later.',
    'Rain is expected with snow unlikely.'
  ])('checks positive and negative claims independently: %s', async (summary) => {
    const input = {
      ...normalizedInput,
      day: { ...normalizedInput.day, weatherCode: 61 },
      remainingHours: normalizedInput.remainingHours.map((hour) => ({ ...hour, weatherCode: 61 }))
    };
    const provider = createOpenAiWeatherSummaryProvider({
      apiKey: 'test-key',
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        status: 'completed', output_text: JSON.stringify({ summary })
      })))
    });

    await expect(provider.summarize(input)).resolves.toEqual({ outcome: 'available', sentence: summary });
  });

  test.each([
    ['No rain expected today.', { weatherCode: 61 }],
    ['Rain is not expected today.', { weatherCode: 61 }],
    ['Cloudy skies with no rain expected.', { precipitation: 1 }],
    ['Cloudy skies without snow.', { snowfall: 1 }]
  ])('rejects negative claims contradicted by forecast values: %s', async (summary, changes) => {
    const input = {
      ...normalizedInput,
      remainingHours: normalizedInput.remainingHours.map((hour) => ({ ...hour, ...changes }))
    };
    const provider = createOpenAiWeatherSummaryProvider({
      apiKey: 'test-key',
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        status: 'completed', output_text: JSON.stringify({ summary })
      })))
    });

    await expect(provider.summarize(input)).resolves.toEqual({ outcome: 'unavailable' });
  });

  test('accepts a grounded short sentence beginning with Cloudy', async () => {
    const provider = createOpenAiWeatherSummaryProvider({
      apiKey: 'test-key',
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        status: 'completed',
        output_text: JSON.stringify({ summary: 'Cloudy conditions today.' })
      })))
    });
    await expect(provider.summarize(normalizedInput)).resolves.toEqual({
      outcome: 'available', sentence: 'Cloudy conditions today.'
    });
  });

  test('recovers a too-long Luna sentence with one shorter generation using the original weather facts', async () => {
    const summaries = [
      'Today will be cloudy, with temperatures around 18°C, no rain, and winds up to 12 km/h.',
      'Cloudy conditions today.'
    ];
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      status: 'completed',
      output_text: JSON.stringify({ summary: summaries.shift() })
    })));
    const provider = createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher, maxCharacters: 60 });

    await expect(provider.summarize(normalizedInput)).resolves.toEqual({
      outcome: 'available', sentence: 'Cloudy conditions today.'
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(bodies[1].input[1]).toEqual(bodies[0].input[1]);
    expect(bodies[1].input[0].content).toContain('at most 42 characters');
    expect(JSON.stringify(bodies[1])).not.toContain('Today will be cloudy');
  });

  test('stops after two overlong responses and logs only technical metadata', async () => {
    const summary = 'Today will be cloudy, with temperatures around 18°C, no rain, and winds up to 12 km/h.';
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      status: 'completed', output_text: JSON.stringify({ summary })
    })));
    const onDiagnostic = vi.fn();
    const provider = createOpenAiWeatherSummaryProvider({
      apiKey: 'private-api-key', fetcher, onDiagnostic, maxCharacters: 60
    });

    await expect(provider.summarize(normalizedInput)).resolves.toEqual({ outcome: 'unavailable' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onDiagnostic.mock.calls.map(([event]) => event)).toEqual([
      { reason: 'sentence-too-long', attempt: 1, httpStatus: 200, durationMilliseconds: expect.any(Number) },
      { reason: 'sentence-too-long', attempt: 2, httpStatus: 200, durationMilliseconds: expect.any(Number) }
    ]);
    const diagnostics = JSON.stringify(onDiagnostic.mock.calls);
    expect(diagnostics).not.toContain('private-api-key');
    expect(diagnostics).not.toContain(summary);
    expect(diagnostics).not.toContain('remainingHours');
  });

  test('reports HTTP failures without copying the private error response or retrying', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('private-provider-response', { status: 403 }));
    const onDiagnostic = vi.fn();
    const provider = createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher, onDiagnostic });
    await expect(provider.summarize(normalizedInput)).resolves.toEqual({ outcome: 'unavailable' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onDiagnostic).toHaveBeenCalledWith({
      reason: 'http-error', httpStatus: 403, attempt: 1, durationMilliseconds: expect.any(Number)
    });
    expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('private-provider-response');
  });

  test('reports a timeout and omits the sentence without retrying', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
      const onDiagnostic = vi.fn();
      const provider = createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher, onDiagnostic });
      const result = provider.summarize(normalizedInput);
      await vi.advanceTimersByTimeAsync(3_000);
      await expect(result).resolves.toEqual({ outcome: 'unavailable' });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(onDiagnostic).toHaveBeenCalledWith({ reason: 'timeout', attempt: 1, durationMilliseconds: 3_000 });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test('diagnostic failures do not hide a valid weather summary', async () => {
    const provider = createOpenAiWeatherSummaryProvider({
      apiKey: 'test-key',
      onDiagnostic: () => { throw new Error('Logging failed'); },
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        status: 'completed', output_text: JSON.stringify({ summary: 'Cloudy conditions today.' })
      })))
    });
    await expect(provider.summarize(normalizedInput)).resolves.toEqual({
      outcome: 'available', sentence: 'Cloudy conditions today.'
    });
  });

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
              text: JSON.stringify({ summary: 'Partly cloudy through the day.' })
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
      sentence: 'Partly cloudy through the day.'
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
    'Warsaw is sunny.',
    'Heavy rain expected.'
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
