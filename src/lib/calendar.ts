import { Temporal } from '@js-temporal/polyfill';
import type { SavedSelectedCalendar } from './selectedCalendars';
import type { UserTimeZone } from './summaryConfiguration';
import { buildWeekAhead, getLocalToday } from './summaryDates';

type CalendarProviderEventStatus = {
  status?: 'cancelled';
  selfResponseStatus?: 'declined';
};

export type CalendarProviderEvent =
  | (CalendarProviderEventStatus & {
      kind: 'timed';
      id: string;
      calendarId: string;
      calendarSummary: string;
      summary: string;
      start: string;
      end: string;
    })
  | (CalendarProviderEventStatus & {
      kind: 'all-day';
      id: string;
      calendarId: string;
      calendarSummary: string;
      summary: string;
      startDate: string;
      endDate: string;
    });

export type CalendarEventProvider = {
  fetchEvents: (request: {
    calendarIds: string[];
    timeMin: string;
    timeMax: string;
    timeZone: UserTimeZone;
  }) => Promise<
    | { outcome: 'available'; events: CalendarProviderEvent[] }
    | { outcome: 'unavailable'; reason: string }
  >;
};

export type AllDayCalendarEvent = {
  id: string;
  title: string;
  calendarLabel: string;
  calendarColor?: string | null;
};

export type TimedCalendarEvent = {
  id: string;
  title: string;
  calendarLabel: string;
  calendarColor?: string | null;
  localStartTime: string;
};

export type CalendarDay = {
  label: string;
  allDayEvents: AllDayCalendarEvent[];
  timedEvents: TimedCalendarEvent[];
};

export type CalendarSection = {
  label: 'Calendar';
  today: CalendarDay | null;
  weekAhead: CalendarDay[];
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
  const weekAheadDateKeys = new Set(weekAhead.map((date) => date.toString()));
  const selectedCalendarMetadata = new Map(
    selectedCalendars.map((calendar) => [
      calendar.id,
      { label: calendar.summary, color: calendar.backgroundColor }
    ])
  );
  const eventsByDate = new Map<
    string,
    {
      allDayEvents: AllDayCalendarEvent[];
      timedEvents: TimedCalendarEvent[];
    }
  >();

  for (const event of providerEvents) {
    if (event.status === 'cancelled' || event.selfResponseStatus === 'declined') {
      continue;
    }

    const calendarMetadata = selectedCalendarMetadata.get(event.calendarId);
    if (!calendarMetadata) {
      continue;
    }

    const calendarLabel = calendarMetadata.label;
    const calendarColor = calendarMetadata?.color;

    if (event.kind === 'timed') {
      const localDate = Temporal.Instant.from(event.start)
        .toZonedDateTimeISO(userTimeZone)
        .toPlainDate()
        .toString();

      if (!weekAheadDateKeys.has(localDate)) {
        continue;
      }

      const localEvents = eventsByDate.get(localDate) ?? { allDayEvents: [], timedEvents: [] };
      localEvents.timedEvents.push({
        id: event.id,
        title: event.summary,
        calendarLabel,
        ...(calendarColor ? { calendarColor } : {}),
        localStartTime: formatLocalTime(
          Temporal.Instant.from(event.start).toZonedDateTimeISO(userTimeZone)
        )
      });
      eventsByDate.set(localDate, localEvents);
    } else {
      for (const date of allDayEventDatesInWindow(event, weekAhead)) {
        const localDate = date.toString();
        const localEvents = eventsByDate.get(localDate) ?? { allDayEvents: [], timedEvents: [] };
        localEvents.allDayEvents.push({
          id: event.id,
          title: event.summary,
          calendarLabel,
          ...(calendarColor ? { calendarColor } : {})
        });
        eventsByDate.set(localDate, localEvents);
      }
    }
  }

  const days = weekAhead.map((date, index): CalendarDay => {
    const events = eventsByDate.get(date.toString()) ?? { allDayEvents: [], timedEvents: [] };

    return {
      label: index === 0 ? 'Today' : formatDayLabel(date),
      allDayEvents: events.allDayEvents.toSorted(compareCalendarEvents),
      timedEvents: events.timedEvents.toSorted(compareTimedCalendarEvents)
    };
  });

  return {
    label: 'Calendar',
    today: days[0] ?? null,
    weekAhead: days.slice(1)
  };
};

const compareCalendarEvents = (
  left: AllDayCalendarEvent,
  right: AllDayCalendarEvent
) =>
  left.calendarLabel.localeCompare(right.calendarLabel) ||
  left.title.localeCompare(right.title) ||
  left.id.localeCompare(right.id);

const compareTimedCalendarEvents = (left: TimedCalendarEvent, right: TimedCalendarEvent) =>
  left.localStartTime.localeCompare(right.localStartTime) || compareCalendarEvents(left, right);

export const calendarSectionHasEvents = (section: CalendarSection) =>
  [section.today, ...section.weekAhead].some(
    (day) => day !== null && (day.allDayEvents.length > 0 || day.timedEvents.length > 0)
  );

const allDayEventDatesInWindow = (
  event: Extract<CalendarProviderEvent, { kind: 'all-day' }>,
  weekAhead: Temporal.PlainDate[]
) => {
  const eventStart = Temporal.PlainDate.from(event.startDate);
  const eventEnd = Temporal.PlainDate.from(event.endDate);

  return weekAhead.filter(
    (date) => Temporal.PlainDate.compare(date, eventStart) >= 0 && Temporal.PlainDate.compare(date, eventEnd) < 0
  );
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
