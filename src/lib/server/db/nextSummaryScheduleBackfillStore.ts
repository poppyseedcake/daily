import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
  defaultSummaryConfiguration
} from '$lib/summaryConfiguration';
import { summaryConfigurationFromFlat } from '../summaryConfigurationPersistence';
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
        ? summaryConfigurationFromFlat(configuration)
        : defaultSummaryConfiguration
    }));
  },
  async saveNextSummaryAt(userId, nextSummaryAt) {
    await db.update(users).set({ nextSummaryAt }).where(eq(users.id, userId));
  }
};
