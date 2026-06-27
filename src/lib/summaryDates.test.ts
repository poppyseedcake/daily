import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, test } from 'vitest';
import { buildWeekAhead, getLocalToday, parseSummaryTime } from './summaryDates';

describe('Summary date calculations', () => {
  test('calculates local today from an instant and User Time Zone with Temporal', () => {
    const instant = Temporal.Instant.from('2026-06-22T03:30:00Z');

    expect(getLocalToday({ instant, userTimeZone: 'America/New_York' }).toString()).toBe(
      '2026-06-21'
    );
    expect(getLocalToday({ instant, userTimeZone: 'Europe/Warsaw' }).toString()).toBe(
      '2026-06-22'
    );
  });

  test('builds the Week Ahead as local today plus the next six days', () => {
    const today = Temporal.PlainDate.from('2026-12-29');

    expect(buildWeekAhead(today).map((date) => date.toString())).toEqual([
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
      '2027-01-04'
    ]);
  });

  test('parses Summary Time as a Temporal PlainTime', () => {
    expect(parseSummaryTime('18:45').toString()).toBe('18:45:00');
  });
});
