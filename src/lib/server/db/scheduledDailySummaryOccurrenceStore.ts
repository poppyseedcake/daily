import { and, asc, eq, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { deliveryRecords, users } from './schema';

export type DueScheduledDailySummaryOccurrence = {
  userId: string;
  summaryRecipient: string;
  scheduledAt: string;
};

type ScheduledDailySummaryOccurrenceDatabase = typeof db;

export const createScheduledDailySummaryOccurrenceStore = (
  database: ScheduledDailySummaryOccurrenceDatabase
) => ({
  async loadNextProcessable(now: string): Promise<DueScheduledDailySummaryOccurrence | null> {
    const [recoverable] = await database
      .select({
        userId: users.id,
        summaryRecipient: users.email,
        scheduledAt: deliveryRecords.scheduledAt
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
          )
        )
      )
      .orderBy(asc(sql`julianday(${deliveryRecords.scheduledAt})`), asc(deliveryRecords.id))
      .limit(1);

    if (recoverable?.scheduledAt) {
      return { ...recoverable, scheduledAt: recoverable.scheduledAt };
    }

    const [row] = await database
      .select({
        userId: users.id,
        summaryRecipient: users.email,
        scheduledAt: users.nextSummaryAt
      })
      .from(users)
      .where(
        and(
          isNotNull(users.nextSummaryAt),
          sql`julianday(${users.nextSummaryAt}) <= julianday(${now})`
        )
      )
      .orderBy(asc(sql`julianday(${users.nextSummaryAt})`), asc(users.id))
      .limit(1);

    return row?.scheduledAt ? { ...row, scheduledAt: row.scheduledAt } : null;
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
});

export const scheduledDailySummaryOccurrenceStore =
  createScheduledDailySummaryOccurrenceStore(db);
