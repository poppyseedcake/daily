import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { summaryConfigurationSchema, type SummaryConfiguration } from '$lib/summaryConfiguration';
import { summaryConfigurations, users } from './schema';
import type { UserSummaryConfigurationStore } from '../summaryConfigurationPersistence';

const toSummaryConfiguration = (
  row: typeof summaryConfigurations.$inferSelect
): SummaryConfiguration =>
  summaryConfigurationSchema.parse({
    summaryTime: row.summaryTime,
    userTimeZone: row.userTimeZone,
    summaryTheme: row.summaryTheme,
    summaryDeliveryEnabled: row.summaryDeliveryEnabled,
    sections: {
      weather: row.weatherSectionEnabled,
      commute: row.commuteSectionEnabled,
      calendar: row.calendarSectionEnabled,
      todo: row.todoSectionEnabled
    }
  });

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

      transaction.update(users).set({ nextSummaryAt }).where(eq(users.id, userId)).run();
    });
  }
});

export const userSummaryConfigurationStore = createUserSummaryConfigurationStore(db);
