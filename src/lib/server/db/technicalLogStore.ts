import { asc, desc, inArray, lt } from 'drizzle-orm';
import type { db } from '$lib/server/db';
import { technicalEventSchema, type TechnicalEvent } from '../technicalEventRecorder';
import { technicalLogRecords } from './schema';

type TechnicalLogDatabase = typeof db;

export const defaultTechnicalLogRetentionDays = 30;
const defaultCleanupBatchSize = 100;
const maximumCleanupBatchSize = 1_000;

const positiveInteger = (value: number, name: string, maximum?: number) => {
  if (!Number.isSafeInteger(value) || value < 1 || (maximum !== undefined && value > maximum)) {
    throw new Error(`${name} must be a positive bounded integer.`);
  }

  return value;
};

export const technicalLogRetentionDaysFromEnvironment = (
  configuredValue = process.env.TECHNICAL_LOG_RETENTION_DAYS
) => {
  if (configuredValue === undefined || configuredValue === '') {
    return defaultTechnicalLogRetentionDays;
  }

  return positiveInteger(Number(configuredValue), 'TECHNICAL_LOG_RETENTION_DAYS');
};

const retentionCutoff = (now: Date, retentionDays: number) => {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff.toISOString();
};

const storedRecord = (row: typeof technicalLogRecords.$inferSelect): TechnicalEvent & { id: string } => ({
  id: row.id,
  ...technicalEventSchema.parse({
    eventCode: row.eventCode,
    severity: row.severity,
    subsystem: row.subsystem,
    occurredAt: row.occurredAt,
    outcome: row.outcome,
    ...(row.failureClassification
      ? { failureClassification: row.failureClassification }
      : {}),
    ...(row.correlationId ? { correlationId: row.correlationId } : {}),
    ...(row.durationMilliseconds === null
      ? {}
      : { durationMilliseconds: row.durationMilliseconds }),
    metadata: JSON.parse(row.metadata) as unknown
  })
});

export const createTechnicalLogStore = (
  database: TechnicalLogDatabase,
  {
    retentionDays = technicalLogRetentionDaysFromEnvironment(),
    cleanupBatchSize = defaultCleanupBatchSize,
    now = () => new Date()
  }: {
    retentionDays?: number;
    cleanupBatchSize?: number;
    now?: () => Date;
  } = {}
) => {
  const boundedRetentionDays = positiveInteger(retentionDays, 'retentionDays');
  const boundedCleanupBatchSize = positiveInteger(
    cleanupBatchSize,
    'cleanupBatchSize',
    maximumCleanupBatchSize
  );

  const deleteExpiredBatch = async () => {
    const expiredRecordIds = database
      .select({ id: technicalLogRecords.id })
      .from(technicalLogRecords)
      .where(lt(technicalLogRecords.occurredAt, retentionCutoff(now(), boundedRetentionDays)))
      .orderBy(asc(technicalLogRecords.occurredAt))
      .limit(boundedCleanupBatchSize);

    await database
      .delete(technicalLogRecords)
      .where(inArray(technicalLogRecords.id, expiredRecordIds))
      .run();
  };

  return {
    async persist(event: TechnicalEvent) {
      await database
        .insert(technicalLogRecords)
        .values({
          id: crypto.randomUUID(),
          ...event,
          failureClassification:
            'failureClassification' in event ? event.failureClassification : null,
          correlationId: event.correlationId ?? null,
          durationMilliseconds: event.durationMilliseconds,
          metadata: JSON.stringify(event.metadata)
        })
        .run();
      await deleteExpiredBatch();
    },
    async loadRecent(limit: number) {
      const rows = await database
        .select()
        .from(technicalLogRecords)
        .orderBy(desc(technicalLogRecords.occurredAt))
        .limit(limit);

      return rows.map(storedRecord);
    }
  };
};

export type TechnicalLogStore = ReturnType<typeof createTechnicalLogStore>;
