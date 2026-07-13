import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, test } from 'vitest';
import { defaultSummaryConfiguration } from '$lib/summaryConfiguration';
import {
  backfillNextSummarySchedules,
  type SummaryScheduleBackfillStore
} from './nextSummaryScheduleBackfill';

describe('next Daily Summary schedule backfill', () => {
  test('idempotently initializes eligible Users and clears ineligible Users with a deployment clock', async () => {
    const saved = new Map<string, string | null>();
    const store: SummaryScheduleBackfillStore = {
      async loadUsers() {
        return [
          { userId: 'eligible', configuration: defaultSummaryConfiguration },
          {
            userId: 'ineligible',
            configuration: { ...defaultSummaryConfiguration, summaryDeliveryEnabled: false }
          }
        ];
      },
      async saveNextSummaryAt(userId, nextSummaryAt) {
        saved.set(userId, nextSummaryAt);
      }
    };
    const deploymentInstant = Temporal.Instant.from('2026-06-22T07:00:00Z');

    await expect(backfillNextSummarySchedules(store, deploymentInstant)).resolves.toEqual({
      updatedUsers: 2
    });
    const firstRun = new Map(saved);
    await backfillNextSummarySchedules(store, deploymentInstant);

    expect(saved).toEqual(firstRun);
    expect(saved).toEqual(
      new Map([
        ['eligible', '2026-06-23T07:00:00Z'],
        ['ineligible', null]
      ])
    );
  });
});
