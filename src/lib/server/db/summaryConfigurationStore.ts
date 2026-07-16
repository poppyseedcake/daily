import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { SummaryConfiguration } from '$lib/summaryConfiguration';
import { summaryConfigurations, users } from './schema';
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
  summaryTheme: configuration.summaryTheme,
  summaryDeliveryEnabled: configuration.summaryDeliveryEnabled,
  weatherSectionEnabled: configuration.sections.weather,
  commuteSectionEnabled: configuration.sections.commute,
  calendarSectionEnabled: configuration.sections.calendar,
  todoSectionEnabled: configuration.sections.todo
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
  async save(userId, configuration, nextSummaryAt) {
    database.transaction((transaction) => {
      const activeUser = transaction
        .update(users)
        .set({ nextSummaryAt })
        .where(and(eq(users.id, userId), eq(users.lifecycleState, 'active')))
        .returning({ id: users.id })
        .get();

      if (!activeUser) {
        return;
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

    });
  }
});

export const userSummaryConfigurationStore = createUserSummaryConfigurationStore(db);
