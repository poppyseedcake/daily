import { z } from 'zod';
import type { TechnicalLogStore } from './db/technicalLogStore';
import {
  scheduledDailySummaryWorkerFailureClassifications,
  type ScheduledDailySummaryWorkerFailureClassification
} from './scheduledDailySummaryWorker';

declare const technicalCorrelationIdBrand: unique symbol;
export type TechnicalCorrelationId = string & {
  readonly [technicalCorrelationIdBrand]: true;
};

export const createTechnicalCorrelationId = (): TechnicalCorrelationId =>
  crypto.randomUUID() as TechnicalCorrelationId;

export const technicalEventSeverities = ['info', 'warning', 'error'] as const;
export const technicalEventSubsystems = ['scheduled-delivery', 'admin-controls'] as const;
export const technicalEventCodes = [
  'scheduled-daily-summary-worker-completed',
  'scheduled-daily-summary-worker-failed',
  'admin-google-maps-kill-switch-changed'
] as const;

export type TechnicalEventSeverity = (typeof technicalEventSeverities)[number];
export type TechnicalEventSubsystem = (typeof technicalEventSubsystems)[number];
export type TechnicalEventCode = (typeof technicalEventCodes)[number];

const workerCountsSchema = z.object({
  dueCount: z.number().int().nonnegative(),
  sentCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  retryingCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  isolatedErrorCount: z.number().int().nonnegative()
});

const workerEventBaseSchema = z.object({
  subsystem: z.literal('scheduled-delivery'),
  occurredAt: z.iso.datetime(),
  correlationId: z.uuid().optional(),
  durationMilliseconds: z.number().nonnegative().finite(),
  metadata: workerCountsSchema
});

const workerCompletedEventSchema = workerEventBaseSchema.extend({
  eventCode: z.literal('scheduled-daily-summary-worker-completed'),
  severity: z.literal('info'),
  outcome: z.literal('succeeded')
});

const workerFailedEventSchema = workerEventBaseSchema.extend({
  eventCode: z.literal('scheduled-daily-summary-worker-failed'),
  severity: z.literal('error'),
  outcome: z.literal('failed'),
  failureClassification: z.enum(scheduledDailySummaryWorkerFailureClassifications)
});

const adminGoogleMapsKillSwitchChangedEventSchema = z.object({
  eventCode: z.literal('admin-google-maps-kill-switch-changed'),
  severity: z.literal('info'),
  subsystem: z.literal('admin-controls'),
  occurredAt: z.iso.datetime(),
  outcome: z.literal('succeeded'),
  metadata: z.object({
    previousEnabled: z.boolean(),
    newEnabled: z.boolean()
  })
});

export const technicalEventSchema = z.discriminatedUnion('eventCode', [
  workerCompletedEventSchema,
  workerFailedEventSchema,
  adminGoogleMapsKillSwitchChangedEventSchema
]);

export type TechnicalEvent = z.infer<typeof technicalEventSchema>;

type WorkerCountsInput = {
  due: number;
  sent: number;
  skipped: number;
  retrying: number;
  failed: number;
  isolatedError: number;
};

type TechnicalEventInput = {
  occurredAt: string;
} &
  (
    | {
        eventCode: 'scheduled-daily-summary-worker-completed';
        correlationId?: TechnicalCorrelationId;
        durationMilliseconds: number;
        counts: WorkerCountsInput;
      }
    | {
        eventCode: 'scheduled-daily-summary-worker-failed';
        correlationId?: TechnicalCorrelationId;
        durationMilliseconds: number;
        counts: WorkerCountsInput;
        classification?: ScheduledDailySummaryWorkerFailureClassification;
        failure: unknown;
      }
    | {
        eventCode: 'admin-google-maps-kill-switch-changed';
        previousEnabled: boolean;
        newEnabled: boolean;
      }
  );

const eventMetadata = (counts: WorkerCountsInput) => ({
  dueCount: counts.due,
  sentCount: counts.sent,
  skippedCount: counts.skipped,
  retryingCount: counts.retrying,
  failedCount: counts.failed,
  isolatedErrorCount: counts.isolatedError
});

const buildTechnicalEvent = (input: TechnicalEventInput): TechnicalEvent => {
  if (input.eventCode === 'admin-google-maps-kill-switch-changed') {
    return technicalEventSchema.parse({
      eventCode: input.eventCode,
      severity: 'info',
      subsystem: 'admin-controls',
      occurredAt: input.occurredAt,
      outcome: 'succeeded',
      metadata: {
        previousEnabled: input.previousEnabled,
        newEnabled: input.newEnabled
      }
    });
  }

  if (input.eventCode === 'scheduled-daily-summary-worker-failed') {
    return technicalEventSchema.parse({
      eventCode: input.eventCode,
      severity: 'error',
      subsystem: 'scheduled-delivery',
      occurredAt: input.occurredAt,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      outcome: 'failed',
      failureClassification: input.classification ?? 'unexpected',
      durationMilliseconds: input.durationMilliseconds,
      metadata: eventMetadata(input.counts)
    });
  }

  return technicalEventSchema.parse({
    eventCode: input.eventCode,
    severity: 'info',
    subsystem: 'scheduled-delivery',
    occurredAt: input.occurredAt,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    outcome: 'succeeded',
    durationMilliseconds: input.durationMilliseconds,
    metadata: eventMetadata(input.counts)
  });
};

export const createTechnicalEventRecorder = ({
  store,
  writeLine = (line: string) => console.log(line)
}: {
  store: Pick<TechnicalLogStore, 'persist'>;
  writeLine?: (line: string) => void;
}) => ({
  async record(input: TechnicalEventInput) {
    const event = buildTechnicalEvent(input);
    try {
      writeLine(JSON.stringify(event));
    } catch {
      // Output is best effort and must not replace the operation's primary result.
    }
    try {
      await store.persist(event);
    } catch {
      // Persistence is best effort. Logging this failure through the same boundary would recurse.
    }
    return event;
  }
});
