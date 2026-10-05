import { afterEach, expect, test, vi } from 'vitest';
import { logScheduledDailySummaryWorkerTerminalEvent } from './posthogLogs';

const logs = vi.hoisted(() => ({ emit: vi.fn(), forceFlush: vi.fn() }));
vi.mock('@opentelemetry/sdk-logs', () => ({
  BatchLogRecordProcessor: class {},
  LoggerProvider: class {
    getLogger() { return { emit: logs.emit }; }
    forceFlush = logs.forceFlush;
  }
}));
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

test('finishes the worker terminal record within a short budget when the exporter hangs', async () => {
  vi.useFakeTimers();
  vi.stubEnv('PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_fixture');
  vi.stubEnv('PUBLIC_POSTHOG_HOST', 'https://logs.example.invalid');
  logs.forceFlush.mockImplementation(() => new Promise(() => {}));
  let finished = false;
  void logScheduledDailySummaryWorkerTerminalEvent({
    event: 'scheduled-daily-summary-worker-completed',
    counts: { due: 0, sent: 0, skipped: 0, retrying: 0, failed: 0, isolatedError: 0 },
    durationMilliseconds: 10
  }).then(() => { finished = true; });
  await vi.advanceTimersByTimeAsync(251);
  expect(logs.emit).toHaveBeenCalledTimes(1);
  expect(finished).toBe(true);
});
