import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import type { ScheduledDailySummaryWorkerEvent } from './scheduledDailySummaryWorker';

let posthogLogProvider: LoggerProvider | null = null;

const requiredConfiguration = (name: string) => {
  const value = process.env[name];
  if (value) return value;

  if (process.env.NODE_ENV !== 'production') {
    throw new Error(
      `${name} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${name} is configured`
    );
  }

  return null;
};

const getPostHogLogProvider = () => {
  if (posthogLogProvider) return posthogLogProvider;

  const token = requiredConfiguration('PUBLIC_POSTHOG_PROJECT_TOKEN');
  const host = requiredConfiguration('PUBLIC_POSTHOG_HOST');
  if (!token || !host) return null;

  posthogLogProvider = new LoggerProvider({
    resource: resourceFromAttributes({
      'service.name': 'daily-scheduled-delivery',
      'deployment.environment': process.env.NODE_ENV ?? 'development'
    }),
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: new URL('/i/v1/logs', host).toString(),
          headers: { Authorization: `Bearer ${token}` }
        })
      })
    ]
  });

  return posthogLogProvider;
};

type WorkerTerminalEvent = Extract<
  ScheduledDailySummaryWorkerEvent,
  {
    event: 'scheduled-daily-summary-worker-completed' | 'scheduled-daily-summary-worker-failed';
  }
>;

export const logScheduledDailySummaryWorkerTerminalEvent = async (event: WorkerTerminalEvent) => {
  try {
    const provider = getPostHogLogProvider();
    if (!provider) return;

    const attributes = {
      event: event.event,
      due_count: event.counts.due,
      sent_count: event.counts.sent,
      skipped_count: event.counts.skipped,
      retrying_count: event.counts.retrying,
      failed_count: event.counts.failed,
      isolated_error_count: event.counts.isolatedError,
      duration_ms: event.durationMilliseconds,
      ...(event.event === 'scheduled-daily-summary-worker-failed'
        ? { outcome: 'failed', failure_classification: event.classification }
        : { outcome: 'completed' })
    };

    provider.getLogger('posthog-scheduled-delivery').emit({
      severityText: event.event === 'scheduled-daily-summary-worker-failed' ? 'ERROR' : 'INFO',
      body:
        event.event === 'scheduled-daily-summary-worker-failed'
          ? 'Scheduled daily summary worker failed'
          : 'Scheduled daily summary worker completed',
      attributes
    });

    await provider.forceFlush();
  } catch {
    // Export failures must not change the scheduled delivery result.
  }
};
