export const googleCalendarReadScope = 'https://www.googleapis.com/auth/calendar.readonly';
export const googleCalendarReadScopes = [googleCalendarReadScope] as const;

export const parseGoogleProviderScopes = (value: string | null): string[] =>
  value
    ? value
        .split(/[\s,]+/)
        .map((scope) => scope.trim())
        .filter(Boolean)
    : [];
