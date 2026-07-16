import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
  defaultSummaryConfiguration
} from '$lib/summaryConfiguration';
import { summaryConfigurationFromFlat } from '../summaryConfigurationPersistence';
import type { SummaryScheduleBackfillStore } from '../nextSummaryScheduleBackfill';
import { summaryConfigurations, users } from './schema';

type NextSummaryScheduleBackfillDatabase = typeof db;

export const createNextSummaryScheduleBackfillStore = (
  database: NextSummaryScheduleBackfillDatabase
): SummaryScheduleBackfillStore => ({
  async loadUsers() {
    const rows = await database
      .select({ userId: users.id, configuration: summaryConfigurations })
      .from(users)
      .leftJoin(summaryConfigurations, eq(summaryConfigurations.userId, users.id))
      .where(eq(users.lifecycleState, 'active'));

    return rows.map(({ userId, configuration }) => ({
      userId,
      configuration: configuration
        ? summaryConfigurationFromFlat(configuration)
        : defaultSummaryConfiguration
    }));
  },
  async saveNextSummaryAt(userId, nextSummaryAt) {
    await database
      .update(users)
      .set({ nextSummaryAt })
      .where(and(eq(users.id, userId), eq(users.lifecycleState, 'active')));
  }
});

export const nextSummaryScheduleBackfillStore = createNextSummaryScheduleBackfillStore(db);
