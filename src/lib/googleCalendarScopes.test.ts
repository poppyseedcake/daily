import { describe, expect, test } from 'vitest';
import { googleCalendarReadScopes, hasGoogleCalendarReadAccess } from './googleCalendarScopes';

describe('Google Calendar scopes', () => {
  test('requests only the two permissions used by Calendar list and events', () => {
    expect(googleCalendarReadScopes).toEqual([
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly'
    ]);
  });

  test('requires both narrow permissions for new grants', () => {
    expect(hasGoogleCalendarReadAccess(googleCalendarReadScopes)).toBe(true);
    expect(hasGoogleCalendarReadAccess([googleCalendarReadScopes[0]])).toBe(false);
    expect(hasGoogleCalendarReadAccess([googleCalendarReadScopes[1]])).toBe(false);
  });

  test('keeps existing broad grants usable', () => {
    expect(
      hasGoogleCalendarReadAccess(['https://www.googleapis.com/auth/calendar.readonly'])
    ).toBe(true);
  });
});
