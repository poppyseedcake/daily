import { Temporal } from '@js-temporal/polyfill';
import { backfillNextSummarySchedules } from '../nextSummaryScheduleBackfill';
import { nextSummaryScheduleBackfillStore } from './nextSummaryScheduleBackfillStore';

const deploymentTime = process.argv[2];

if (!deploymentTime) {
  throw new Error('Usage: npm run db:backfill-next-summary -- <deployment-time-utc>');
}

const result = await backfillNextSummarySchedules(
  nextSummaryScheduleBackfillStore,
  Temporal.Instant.from(deploymentTime)
);

console.log(JSON.stringify(result));
