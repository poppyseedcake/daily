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
    }
  | {
      status: 'failed';
      label: 'Calendar';
      statusLabel: 'Calendar not connected';
      detail: 'Calendar consent was canceled or failed.';
      unavailableReason: 'Connect Google Calendar to include Calendar Events.';
    }
  | {
      status: 'connected';
      label: 'Calendar';
      statusLabel: 'Calendar connected';
      detail: 'Google Calendar is connected for this User.';
    };

export type UserCalendarReadinessConnection = {
  status: 'not-connected' | 'failed' | 'connected';
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

export const calendarReadinessForUserConnection = (
  connection: UserCalendarReadinessConnection
): CalendarReadiness => {
  if (connection.status === 'connected') {
    return {
      status: 'connected',
      label: 'Calendar',
      statusLabel: 'Calendar connected',
      detail: 'Google Calendar is connected for this User.'
    };
  }

  if (connection.status === 'failed') {
    return {
      status: 'failed',
      label: 'Calendar',
      statusLabel: 'Calendar not connected',
      detail: 'Calendar consent was canceled or failed.',
      unavailableReason: 'Connect Google Calendar to include Calendar Events.'
    };
  }

  return calendarReadinessForAuthMode('user');
};
