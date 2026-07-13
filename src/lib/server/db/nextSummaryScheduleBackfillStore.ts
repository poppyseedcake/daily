import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
  defaultSummaryConfiguration,
  summaryConfigurationSchema
} from '$lib/summaryConfiguration';
import type { SummaryScheduleBackfillStore } from '../nextSummaryScheduleBackfill';
import { summaryConfigurations, users } from './schema';

export const nextSummaryScheduleBackfillStore: SummaryScheduleBackfillStore = {
  async loadUsers() {
    const rows = await db
      .select({ userId: users.id, configuration: summaryConfigurations })
      .from(users)
      .leftJoin(summaryConfigurations, eq(summaryConfigurations.userId, users.id));

    return rows.map(({ userId, configuration }) => ({
      userId,
      configuration: configuration
        ? summaryConfigurationSchema.parse({
            summaryTime: configuration.summaryTime,
            userTimeZone: configuration.userTimeZone,
            summaryTheme: configuration.summaryTheme,
            summaryDeliveryEnabled: configuration.summaryDeliveryEnabled,
            sections: {
              weather: configuration.weatherSectionEnabled,
              commute: configuration.commuteSectionEnabled,
              calendar: configuration.calendarSectionEnabled,
              todo: configuration.todoSectionEnabled
            }
          })
        : defaultSummaryConfiguration
    }));
  },
  async saveNextSummaryAt(userId, nextSummaryAt) {
    await db.update(users).set({ nextSummaryAt }).where(eq(users.id, userId));
  }
};
