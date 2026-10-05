import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createOpenAiWeatherSummaryProvider } from './weatherSummaryProvider';

const telemetry = vi.hoisted(() => ({ capture: vi.fn(), flush: vi.fn() }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('./posthog', () => ({ getServerPostHogClient: () => telemetry }));

const input = {
  units: { temperature: 'celsius' as const, precipitationProbability: 'percent' as const, precipitation: 'millimetres' as const, snowfall: 'centimetres' as const, wind: 'kilometres_per_hour' as const },
  current: { temperature: 18 },
  day: { weatherCode: 2, minimumTemperature: 12, maximumTemperature: 22, maximumPrecipitationProbability: 35, maximumWindSpeed: 24, maximumWindGust: 39 },
  remainingHours: [{ localTime: '07:00', temperature: 17, precipitationProbability: 5, precipitation: 0, snowfall: 0, weatherCode: 2, windSpeed: 11, windGust: 19 }]
};
const options = { observability: { distinctId: 'user-1', sessionId: 'summary-1', traceId: 'trace-1' } };
const response = (summary = 'Cloudy today.') => new Response(JSON.stringify({
  status: 'completed', output_text: JSON.stringify({ summary })
}));

beforeEach(() => {
  telemetry.capture.mockReset();
  telemetry.flush.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

test.each(['network', 'response-body', 'invalid-json', 'invalid-payload'])('records a privacy-safe failed generation for %s failure', async (failure) => {
  const fetcher = vi.fn<typeof fetch>();
  const privateError = new Error('secret-api-key and private provider response');
  if (failure === 'network') fetcher.mockRejectedValue(privateError);
  else if (failure === 'invalid-json') fetcher.mockResolvedValue(new Response('private provider response'));
  else if (failure === 'invalid-payload') fetcher.mockResolvedValue(new Response(JSON.stringify({ status: 123, private: 'private provider response' })));
  else {
    const broken = response();
    vi.spyOn(broken, 'json').mockRejectedValue(privateError);
    fetcher.mockResolvedValue(broken);
  }
  await expect(createOpenAiWeatherSummaryProvider({ apiKey: 'secret-api-key', fetcher }).summarize(input, options))
    .resolves.toEqual({ outcome: 'unavailable' });
  expect(telemetry.capture).toHaveBeenCalledTimes(1);
  const event = telemetry.capture.mock.calls[0][0];
  expect(event).toMatchObject({ event: '$ai_generation', distinctId: 'user-1', properties: {
    $ai_is_error: true, $ai_trace_id: 'trace-1', $ai_session_id: 'summary-1', $ai_input: [], $ai_output_choices: []
  } });
  expect(JSON.stringify(event)).not.toContain('secret-api-key');
  expect(JSON.stringify(event)).not.toContain('private provider response');
});

test('keeps a completed summary deliverable when telemetry rejects', async () => {
  telemetry.flush.mockRejectedValue(new Error('export failed'));
  await expect(createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher: vi.fn().mockResolvedValue(response()) })
    .summarize(input, options)).resolves.toEqual({ outcome: 'available', sentence: 'Cloudy today.' });
});

test('does not capture an attempted generation twice when structured output parsing fails', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output_text: 'invalid structured JSON' })));
  await expect(createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher }).summarize(input, options))
    .resolves.toEqual({ outcome: 'unavailable' });
  expect(telemetry.capture).toHaveBeenCalledTimes(1);
  expect(telemetry.capture.mock.calls[0][0].properties.$ai_is_error).toBe(true);
});

test.each([
  ['invalid JSON', 'not JSON', 'invalid-response'],
  ['invalid schema', JSON.stringify({ summary: 123 }), 'invalid-response'],
  ['multiple sentences', JSON.stringify({ summary: 'Cloudy today. Rain tomorrow.' }), 'sentence-rejected'],
  ['multiline sentence', JSON.stringify({ summary: 'Cloudy\ntoday.' }), 'sentence-rejected'],
  ['empty sentence', JSON.stringify({ summary: '' }), 'sentence-rejected']
])('reports %s as a failed generation after validating the response', async (_case, outputText, reason) => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    status: 'completed', output_text: outputText, usage: { input_tokens: 32, output_tokens: 12 }
  })));
  await expect(createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher }).summarize(input, options))
    .resolves.toEqual({ outcome: 'unavailable' });
  expect(telemetry.capture).toHaveBeenCalledTimes(1);
  expect(telemetry.capture.mock.calls[0][0].properties).toMatchObject({
    $ai_is_error: true, $ai_error: `OpenAI Responses generation failed: ${reason}.`, $ai_input_tokens: 32, $ai_output_tokens: 12
  });
});

test('records a timeout generation without exposing the exception', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('private timeout detail', 'AbortError')));
  }));
  const pending = createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher, timeoutMilliseconds: 100 }).summarize(input, options);
  await vi.advanceTimersByTimeAsync(101);
  await expect(pending).resolves.toEqual({ outcome: 'unavailable' });
  expect(telemetry.capture).toHaveBeenCalledTimes(1);
  expect(telemetry.capture.mock.calls[0][0].properties).toMatchObject({ $ai_is_error: true, $ai_latency: 0.1 });
  expect(JSON.stringify(telemetry.capture.mock.calls)).not.toContain('private timeout detail');
});

test('returns a completed sentence within a short budget when telemetry never finishes', async () => {
  vi.useFakeTimers();
  telemetry.flush.mockImplementation(() => new Promise(() => {}));
  let result: unknown;
  void createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher: vi.fn().mockResolvedValue(response()) })
    .summarize(input, options).then(value => { result = value; });
  await vi.advanceTimersByTimeAsync(251);
  expect(result).toEqual({ outcome: 'available', sentence: 'Cloudy today.' });
});

test('measures each OpenAI attempt independently from retries and telemetry waits', async () => {
  vi.useFakeTimers();
  let attempt = 0;
  const fetcher = vi.fn<typeof fetch>(async () => {
    attempt += 1;
    await new Promise(resolve => setTimeout(resolve, attempt === 1 ? 100 : 200));
    return response(attempt === 1 ? 'Clouds '.repeat(15) + '.' : 'Cloudy today.');
  });
  telemetry.flush.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 80)));
  const pending = createOpenAiWeatherSummaryProvider({ apiKey: 'test-key', fetcher, maxCharacters: 40 }).summarize(input, options);
  await vi.runAllTimersAsync();
  await expect(pending).resolves.toMatchObject({ outcome: 'available' });
  expect(telemetry.capture.mock.calls.map(([event]) => event.properties.$ai_latency)).toEqual([0.1, 0.2]);
  expect(telemetry.capture.mock.calls.map(([event]) => event.properties.$ai_trace_id)).toEqual(['trace-1', 'trace-1']);
  expect(telemetry.capture.mock.calls.map(([event]) => event.properties.$ai_is_error)).toEqual([true, false]);
});
