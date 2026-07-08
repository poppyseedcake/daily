import { Temporal } from '@js-temporal/polyfill';
import type { SavedSelectedCalendar } from './selectedCalendars';
import type { UserTimeZone } from './summaryConfiguration';
import { buildWeekAhead, getLocalToday } from './summaryDates';

export type CalendarProviderEvent = {
  id: string;
  calendarId: string;
  calendarSummary: string;
  summary: string;
  start: string;
  end: string;
};

export type CalendarEventProvider = {
  fetchEvents: (request: {
    calendarIds: string[];
    timeMin: string;
    timeMax: string;
    timeZone: UserTimeZone;
  }) => Promise<CalendarProviderEvent[]>;
};

export type TimedCalendarEvent = {
  id: string;
  title: string;
  calendarLabel: string;
  localStartTime: string;
};

export type CalendarDay = {
  label: string;
  events: TimedCalendarEvent[];
};

export type CalendarSection = {
  label: 'Calendar';
  days: CalendarDay[];
};

export const buildCalendarEventFetchRequest = ({
  selectedCalendars,
  userTimeZone,
  now
}: {
  selectedCalendars: SavedSelectedCalendar[];
  userTimeZone: UserTimeZone;
  now: Date;
}) => {
  const today = getLocalToday({
    instant: Temporal.Instant.from(now.toISOString()),
    userTimeZone
  });
  const timeMin = today.toZonedDateTime({ timeZone: userTimeZone }).toInstant();
  const timeMax = today.add({ days: 7 }).toZonedDateTime({ timeZone: userTimeZone }).toInstant();

  return {
    calendarIds: selectedCalendars.map((calendar) => calendar.id),
    timeMin: formatInstantForProvider(timeMin),
    timeMax: formatInstantForProvider(timeMax),
    timeZone: userTimeZone
  };
};

export const buildCalendarSection = ({
  providerEvents,
  selectedCalendars,
  userTimeZone,
  now
}: {
  providerEvents: CalendarProviderEvent[];
  selectedCalendars: SavedSelectedCalendar[];
  userTimeZone: UserTimeZone;
  now: Date;
}): CalendarSection => {
  const today = getLocalToday({
    instant: Temporal.Instant.from(now.toISOString()),
    userTimeZone
  });
  const weekAhead = buildWeekAhead(today);
  const selectedCalendarLabels = new Map(
    selectedCalendars.map((calendar) => [calendar.id, calendar.summary])
  );
  const eventsByDate = new Map<string, TimedCalendarEvent[]>();

  for (const event of providerEvents) {
    const startsAt = Temporal.Instant.from(event.start).toZonedDateTimeISO(userTimeZone);
    const localDate = startsAt.toPlainDate().toString();

    if (!weekAhead.some((date) => date.toString() === localDate)) {
      continue;
    }

    const localEvents = eventsByDate.get(localDate) ?? [];
    localEvents.push({
      id: event.id,
      title: event.summary,
      calendarLabel: selectedCalendarLabels.get(event.calendarId) ?? event.calendarSummary,
      localStartTime: formatLocalTime(startsAt)
    });
    eventsByDate.set(localDate, localEvents);
  }

  return {
    label: 'Calendar',
    days: weekAhead.flatMap((date, index) => {
      const events = eventsByDate.get(date.toString()) ?? [];

      if (events.length === 0) {
        return [];
      }

      return [
        {
          label: index === 0 ? 'Today' : formatDayLabel(date),
          events: events.toSorted((left, right) =>
            left.localStartTime.localeCompare(right.localStartTime)
          )
        }
      ];
    })
  };
};

const formatInstantForProvider = (instant: Temporal.Instant) =>
  instant.toString().replace('.000', '');

const formatLocalTime = (startsAt: Temporal.ZonedDateTime) =>
  `${String(startsAt.hour).padStart(2, '0')}:${String(startsAt.minute).padStart(2, '0')}`;

const formatDayLabel = (date: Temporal.PlainDate) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${date.toString()}T00:00:00.000Z`));
