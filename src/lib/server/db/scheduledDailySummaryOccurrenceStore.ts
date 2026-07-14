import { and, asc, eq, isNotNull, or, sql, type SQLWrapper } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { deliveryRecords, users } from './schema';

export type DueScheduledDailySummaryOccurrence = {
  userId: string;
  summaryRecipient: string;
  scheduledAt: string;
  workId: string;
};

export type ScheduledDailySummaryOccurrenceCursor = Pick<
  DueScheduledDailySummaryOccurrence,
  'scheduledAt' | 'workId'
>;

type ScheduledDailySummaryOccurrenceDatabase = typeof db;

const afterCursorCondition = (
  scheduledAt: SQLWrapper,
  workId: SQLWrapper,
  after: ScheduledDailySummaryOccurrenceCursor | null
) =>
  after
    ? sql`(
        julianday(${scheduledAt}) > julianday(${after.scheduledAt})
        or (
          julianday(${scheduledAt}) = julianday(${after.scheduledAt})
          and ${workId} > ${after.workId}
        )
      )`
    : undefined;

export const createScheduledDailySummaryOccurrenceStore = (
  database: ScheduledDailySummaryOccurrenceDatabase
) => {
  const loadProcessableBatch = async ({
    now,
    limit,
    after
  }: {
    now: string;
    limit: number;
    after: ScheduledDailySummaryOccurrenceCursor | null;
  }): Promise<DueScheduledDailySummaryOccurrence[]> => {
    const recoverableScheduledAt = deliveryRecords.scheduledAt;
    const recoverableWorkId = sql<string>`'retry:' || ${deliveryRecords.id}`;
    const recoverable = await database
      .select({
        userId: users.id,
        summaryRecipient: users.email,
        scheduledAt: recoverableScheduledAt,
        workId: recoverableWorkId
      })
      .from(deliveryRecords)
      .innerJoin(users, eq(users.id, deliveryRecords.userId))
      .where(
        and(
          eq(deliveryRecords.attemptType, 'scheduled'),
          isNotNull(deliveryRecords.scheduledAt),
          or(
            and(
              eq(deliveryRecords.deliveryStatus, 'processing'),
              isNotNull(deliveryRecords.claimExpiresAt),
              sql`julianday(${deliveryRecords.claimExpiresAt}) <= julianday(${now})`
            ),
            and(
              eq(deliveryRecords.deliveryStatus, 'retrying'),
              isNotNull(deliveryRecords.nextRetryAt),
              sql`julianday(${deliveryRecords.nextRetryAt}) <= julianday(${now})`
            )
          ),
          afterCursorCondition(recoverableScheduledAt, recoverableWorkId, after)
        )
      )
      .orderBy(asc(sql`julianday(${recoverableScheduledAt})`), asc(recoverableWorkId))
      .limit(limit);

    const newScheduledAt = users.nextSummaryAt;
    const newWorkId = sql<string>`'new:' || ${users.id}`;
    const newlyDue = await database
      .select({
        userId: users.id,
        summaryRecipient: users.email,
        scheduledAt: newScheduledAt,
        workId: newWorkId
      })
      .from(users)
      .where(
        and(
          isNotNull(newScheduledAt),
          sql`julianday(${newScheduledAt}) <= julianday(${now})`,
          afterCursorCondition(newScheduledAt, newWorkId, after)
        )
      )
      .orderBy(asc(sql`julianday(${newScheduledAt})`), asc(newWorkId))
      .limit(limit);

    return [...recoverable, ...newlyDue]
      .flatMap((occurrence) =>
        occurrence.scheduledAt
          ? [{ ...occurrence, scheduledAt: occurrence.scheduledAt }]
          : []
      )
      .sort(
        (left, right) =>
          new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime() ||
          (left.workId < right.workId ? -1 : left.workId > right.workId ? 1 : 0)
      )
      .slice(0, limit);
  };

  return {
    loadProcessableBatch,

    async loadNextProcessable(now: string): Promise<DueScheduledDailySummaryOccurrence | null> {
      const [occurrence] = await loadProcessableBatch({ now, limit: 1, after: null });

      return occurrence ?? null;
    },

    async advance(
      userId: string,
      scheduledAt: string,
      nextSummaryAt: string | null
    ): Promise<boolean> {
      const rows = await database
        .update(users)
        .set({ nextSummaryAt: nextSummaryAt })
        .where(and(eq(users.id, userId), eq(users.nextSummaryAt, scheduledAt)))
        .returning({ id: users.id });

      return rows.length === 1;
    }
  };
};

export const scheduledDailySummaryOccurrenceStore =
  createScheduledDailySummaryOccurrenceStore(db);
