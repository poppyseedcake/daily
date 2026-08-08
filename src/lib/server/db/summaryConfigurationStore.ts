import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calculateNextSummaryAt } from '$lib/nextSummarySchedule';
import type { SummaryConfiguration } from '$lib/summaryConfiguration';
import { deliveryRecords, summaryConfigurations, users } from './schema';
import {
  summaryConfigurationFromFlat,
  type UserSummaryConfigurationStore
} from '../summaryConfigurationPersistence';

const toSummaryConfiguration = (
  row: typeof summaryConfigurations.$inferSelect
): SummaryConfiguration => summaryConfigurationFromFlat(row);

const toSummaryConfigurationRow = (
  userId: string,
  configuration: SummaryConfiguration
): Omit<typeof summaryConfigurations.$inferInsert, 'id'> => ({
  userId,
  summaryTime: configuration.summaryTime,
  userTimeZone: configuration.userTimeZone,
  summaryDeliveryEnabled: configuration.summaryDeliveryEnabled,
  weatherSectionPaused: configuration.sectionPauses.weather,
  commuteSectionPaused: configuration.sectionPauses.commute,
  calendarSectionPaused: configuration.sectionPauses.calendar,
  todoSectionPaused: configuration.sectionPauses.todo
});

type SummaryConfigurationDatabase = typeof db;

export const createUserSummaryConfigurationStore = (
  database: SummaryConfigurationDatabase
): UserSummaryConfigurationStore => ({
  async load(userId) {
    const row = await database.query.summaryConfigurations.findFirst({
      where: eq(summaryConfigurations.userId, userId)
    });

    return row ? toSummaryConfiguration(row) : null;
  },
  async save(userId, configuration, referenceInstant) {
    return database.transaction((transaction) => {
      const currentRow = transaction
        .select()
        .from(summaryConfigurations)
        .where(eq(summaryConfigurations.userId, userId))
        .get();
      const current = currentRow ? toSummaryConfiguration(currentRow) : null;
      const schedulingChanged =
        current === null ||
        current.summaryTime !== configuration.summaryTime ||
        current.userTimeZone !== configuration.userTimeZone ||
        current.summaryDeliveryEnabled !== configuration.summaryDeliveryEnabled;
      const nextSummaryAt = schedulingChanged
        ? calculateNextSummaryAt(configuration, referenceInstant)?.toString() ?? null
        : undefined;
      const activeUser = transaction
        .update(users)
        .set(nextSummaryAt === undefined ? { updatedAt: sql`updated_at` } : { nextSummaryAt })
        .where(and(eq(users.id, userId), eq(users.lifecycleState, 'active')))
        .returning({ id: users.id })
        .get();

      if (!activeUser) {
        return false;
      }

      transaction
        .insert(summaryConfigurations)
        .values({
          id: randomUUID(),
          ...toSummaryConfigurationRow(userId, configuration)
        })
        .onConflictDoUpdate({
          target: summaryConfigurations.userId,
          set: toSummaryConfigurationRow(userId, configuration)
        })
        .run();

      if (!configuration.summaryDeliveryEnabled) {
        transaction
          .update(deliveryRecords)
          .set({
            deliveryStatus: 'cancelled',
            completedAt: referenceInstant.toString(),
            nextRetryAt: null,
            claimExpiresAt: null,
            errorClassification: 'summary-delivery-disabled'
          })
          .where(
            and(
              eq(deliveryRecords.userId, userId),
              eq(deliveryRecords.attemptType, 'scheduled'),
              eq(deliveryRecords.deliveryStatus, 'retrying')
            )
          )
          .run();
      }

      return true;
    });
  }
});

export const userSummaryConfigurationStore = createUserSummaryConfigurationStore(db);
