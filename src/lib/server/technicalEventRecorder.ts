import { z } from 'zod';
import type { TechnicalLogStore } from './db/technicalLogStore';

declare const technicalCorrelationIdBrand: unique symbol;
export type TechnicalCorrelationId = string & {
  readonly [technicalCorrelationIdBrand]: true;
};

export const createTechnicalCorrelationId = (): TechnicalCorrelationId =>
  crypto.randomUUID() as TechnicalCorrelationId;

const workerCountsSchema = z.object({
  dueCount: z.number().int().nonnegative(),
  sentCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  retryingCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  isolatedErrorCount: z.number().int().nonnegative()
});

const workerCompletedEventSchema = z.object({
  eventCode: z.literal('scheduled-daily-summary-worker-completed'),
  severity: z.literal('info'),
  subsystem: z.literal('scheduled-delivery'),
  occurredAt: z.iso.datetime(),
  correlationId: z.uuid().optional(),
  outcome: z.literal('succeeded'),
  durationMilliseconds: z.number().nonnegative().finite(),
  metadata: workerCountsSchema
});

const workerFailedEventSchema = z.object({
  eventCode: z.literal('scheduled-daily-summary-worker-failed'),
  severity: z.literal('error'),
  subsystem: z.literal('scheduled-delivery'),
  occurredAt: z.iso.datetime(),
  correlationId: z.uuid().optional(),
  outcome: z.literal('failed'),
  failureClassification: z.enum([
    'due-work-query-failed',
    'worker-initialization-failed',
    'unexpected'
  ]),
  durationMilliseconds: z.number().nonnegative().finite(),
  metadata: workerCountsSchema
});

export const technicalEventSchema = z.discriminatedUnion('eventCode', [
  workerCompletedEventSchema,
  workerFailedEventSchema
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
  correlationId?: TechnicalCorrelationId;
  durationMilliseconds: number;
  counts: WorkerCountsInput;
} &
  (
    | { eventCode: 'scheduled-daily-summary-worker-completed' }
    | {
        eventCode: 'scheduled-daily-summary-worker-failed';
        classification?: 'due-work-query-failed' | 'worker-initialization-failed';
        failure: unknown;
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
    writeLine(JSON.stringify(event));
    try {
      await store.persist(event);
    } catch {
      // Persistence is best effort. Logging this failure through the same boundary would recurse.
    }
    return event;
  }
});
