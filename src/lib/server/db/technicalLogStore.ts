import { and, asc, desc, eq, gte, inArray, lt, lte, or, type SQL } from 'drizzle-orm';
import type { db } from '$lib/server/db';
import { technicalEventSchema, type TechnicalEvent } from '../technicalEventRecorder';
import { technicalLogRecords } from './schema';
import {
  defaultOperationalRetentionDays,
  operationalRetentionCutoff,
  operationalRetentionDaysFromEnvironment,
  positiveBoundedInteger
} from './operationalRetention';

type TechnicalLogDatabase = typeof db;

export const defaultTechnicalLogRetentionDays = defaultOperationalRetentionDays;
const defaultCleanupBatchSize = 100;
const maximumCleanupBatchSize = 1_000;
const maximumPageSize = 100;

export const technicalLogRetentionDaysFromEnvironment =
  operationalRetentionDaysFromEnvironment;

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

type TechnicalLogCursor = {
  occurredAt: string;
  id: string;
};

const encodeCursor = (cursor: TechnicalLogCursor) =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

const decodeCursor = (cursor: string): TechnicalLogCursor => {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'occurredAt' in parsed &&
      typeof parsed.occurredAt === 'string' &&
      'id' in parsed &&
      typeof parsed.id === 'string'
    ) {
      return { occurredAt: parsed.occurredAt, id: parsed.id };
    }
  } catch {
    // The caller receives one stable validation error for every malformed cursor.
  }

  throw new Error('Invalid Technical Log cursor.');
};

export type TechnicalLogFilters = {
  cursor?: string | null;
  pageSize: number;
  fromUtc?: string;
  toUtc?: string;
  severity?: 'info' | 'warning' | 'error';
  subsystem?: 'scheduled-delivery' | 'admin-controls';
  eventCode?:
    | 'scheduled-daily-summary-worker-completed'
    | 'scheduled-daily-summary-worker-failed'
    | 'admin-google-maps-kill-switch-changed';
};

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
  const boundedRetentionDays = positiveBoundedInteger(retentionDays, 'retentionDays');
  const boundedCleanupBatchSize = positiveBoundedInteger(
    cleanupBatchSize,
    'cleanupBatchSize',
    maximumCleanupBatchSize
  );

  const deleteExpiredBatch = async () => {
    const expiredRecordIds = database
      .select({ id: technicalLogRecords.id })
      .from(technicalLogRecords)
      .where(
        lt(technicalLogRecords.occurredAt, operationalRetentionCutoff(now(), boundedRetentionDays))
      )
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
          correlationId: 'correlationId' in event ? (event.correlationId ?? null) : null,
          durationMilliseconds:
            'durationMilliseconds' in event ? event.durationMilliseconds : null,
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
    },
    async list(filters: TechnicalLogFilters) {
      const pageSize = positiveBoundedInteger(filters.pageSize, 'pageSize', maximumPageSize);
      const conditions: SQL[] = [];

      if (filters.fromUtc) conditions.push(gte(technicalLogRecords.occurredAt, filters.fromUtc));
      if (filters.toUtc) conditions.push(lte(technicalLogRecords.occurredAt, filters.toUtc));
      if (filters.severity) conditions.push(eq(technicalLogRecords.severity, filters.severity));
      if (filters.subsystem) conditions.push(eq(technicalLogRecords.subsystem, filters.subsystem));
      if (filters.eventCode) conditions.push(eq(technicalLogRecords.eventCode, filters.eventCode));

      if (filters.cursor) {
        const cursor = decodeCursor(filters.cursor);
        conditions.push(
          or(
            lt(technicalLogRecords.occurredAt, cursor.occurredAt),
            and(
              eq(technicalLogRecords.occurredAt, cursor.occurredAt),
              lt(technicalLogRecords.id, cursor.id)
            )
          )!
        );
      }

      const rows = await database
        .select()
        .from(technicalLogRecords)
        .where(and(...conditions))
        .orderBy(desc(technicalLogRecords.occurredAt), desc(technicalLogRecords.id))
        .limit(pageSize + 1);
      const pageRows = rows.slice(0, pageSize);
      const lastRecord = pageRows.at(-1);

      return {
        records: pageRows.map(storedRecord),
        nextCursor:
          rows.length > pageSize && lastRecord
            ? encodeCursor({ occurredAt: lastRecord.occurredAt, id: lastRecord.id })
            : null
      };
    }
  };
};

export type TechnicalLogStore = ReturnType<typeof createTechnicalLogStore>;
