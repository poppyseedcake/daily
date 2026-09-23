export const googleCalendarReadScopes = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly'
] as const;

// Existing connections may still have a grant for the former, broader scope.
const legacyGoogleCalendarReadScope = 'https://www.googleapis.com/auth/calendar.readonly';

export const hasGoogleCalendarReadAccess = (scopes: readonly string[]): boolean =>
  scopes.includes(legacyGoogleCalendarReadScope) ||
  googleCalendarReadScopes.every((scope) => scopes.includes(scope));

export const parseGoogleProviderScopes = (value: string | null): string[] =>
  value
    ? value
        .split(/[\s,]+/)
        .map((scope) => scope.trim())
        .filter(Boolean)
    : [];
