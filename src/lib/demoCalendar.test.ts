import { describe, expect, test } from 'vitest';
import { buildDemoCalendarSection } from './demoCalendar';

describe('Demo Calendar', () => {
  test('builds clearly labeled Week Ahead Calendar Events from the configured User Time Zone', () => {
    const section = buildDemoCalendarSection({
      userTimeZone: 'America/New_York',
      now: new Date('2026-06-22T03:30:00.000Z')
    });

    expect(section.label).toBe('Demo Calendar');
    expect(section.weekAhead.map((day) => day.date)).toEqual([
      '2026-06-21',
      '2026-06-22',
      '2026-06-23',
      '2026-06-24',
      '2026-06-25',
      '2026-06-26',
      '2026-06-27'
    ]);
    expect(section.events.every((event) => event.kind === 'calendar-event')).toBe(true);
    expect(section.summaryDetail).toContain('Demo Calendar');
    expect(section.summaryDetail).toContain('Week Ahead');
    expect(section.summaryDetail).not.toContain('Todo');
  });
});
