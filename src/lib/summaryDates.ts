import { Temporal } from '@js-temporal/polyfill';
import type { UserTimeZone } from './summaryConfiguration';

export type LocalTodayInput = {
  instant: Temporal.Instant;
  userTimeZone: UserTimeZone;
};

export const parseSummaryTime = (summaryTime: string) => Temporal.PlainTime.from(summaryTime);

export const getLocalToday = ({ instant, userTimeZone }: LocalTodayInput) =>
  instant.toZonedDateTimeISO(userTimeZone).toPlainDate();

export const buildWeekAhead = (today: Temporal.PlainDate) =>
  Array.from({ length: 7 }, (_, offsetDays) => today.add({ days: offsetDays }));
