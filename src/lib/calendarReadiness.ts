export type CalendarReadinessAuthMode = 'visitor' | 'user';

export type CalendarReadiness =
  | {
      status: 'demo';
      label: 'Demo Calendar';
      detail: 'Sample Calendar Events for Visitor mode';
    }
  | {
      status: 'not-connected';
      label: 'Calendar';
      statusLabel: 'Calendar not connected';
      detail: 'Calendar Events will appear after Google Calendar setup is available.';
      unavailableReason: 'Connect Google Calendar to include Calendar Events.';
    };

export const calendarReadinessForAuthMode = (
  authMode: CalendarReadinessAuthMode
): CalendarReadiness =>
  authMode === 'visitor'
    ? {
        status: 'demo',
        label: 'Demo Calendar',
        detail: 'Sample Calendar Events for Visitor mode'
      }
    : {
        status: 'not-connected',
        label: 'Calendar',
        statusLabel: 'Calendar not connected',
        detail: 'Calendar Events will appear after Google Calendar setup is available.',
        unavailableReason: 'Connect Google Calendar to include Calendar Events.'
      };
