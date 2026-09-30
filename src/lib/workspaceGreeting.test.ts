import { describe, expect, it } from 'vitest';
import { workspaceGreeting } from './workspaceGreeting';

describe('workspace greeting', () => {
  it.each([
    [4, 'Good evening'],
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening']
  ])('greets at hour %i in the configured time zone', (hour, expected) => {
    const now = new Date(Date.UTC(2026, 8, 30, hour - 2));
    expect(workspaceGreeting(now, 'Europe/Warsaw').greeting).toBe(expected);
  });

  it('uses the first name from Google without the surname', () => {
    expect(workspaceGreeting(new Date('2026-09-30T07:00:00Z'), 'UTC', '  Alex   Smith  ').greeting)
      .toBe('Good morning, Alex');
  });

  it.each([undefined, '', '   '])('omits the name when it is missing', (name) => {
    expect(workspaceGreeting(new Date('2026-09-30T07:00:00Z'), 'UTC', name).greeting)
      .toBe('Good morning');
  });

  it('uses the same local day and hour across a time-zone date boundary', () => {
    expect(workspaceGreeting(new Date('2026-09-30T23:30:00Z'), 'Asia/Tokyo', 'Alex')).toEqual({
      greeting: 'Good morning, Alex',
      dateLabel: 'Thursday, 1 October'
    });
  });
});
