import { Temporal } from '@js-temporal/polyfill';
import { calculateNextSummaryAt } from '$lib/nextSummarySchedule';
import type { SummaryConfiguration } from '$lib/summaryConfiguration';

export type SummaryScheduleBackfillUser = {
  userId: string;
  configuration: SummaryConfiguration;
};

export type SummaryScheduleBackfillStore = {
  loadUsers: () => Promise<SummaryScheduleBackfillUser[]>;
  saveNextSummaryAt: (userId: string, nextSummaryAt: string | null) => Promise<void>;
};

export const backfillNextSummarySchedules = async (
  store: SummaryScheduleBackfillStore,
  deploymentInstant: Temporal.Instant
): Promise<{ updatedUsers: number }> => {
  const users = await store.loadUsers();

  for (const user of users) {
    const nextSummaryAt =
      calculateNextSummaryAt(user.configuration, deploymentInstant)?.toString() ?? null;
    await store.saveNextSummaryAt(user.userId, nextSummaryAt);
  }

  return { updatedUsers: users.length };
};
