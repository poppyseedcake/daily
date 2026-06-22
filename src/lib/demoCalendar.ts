import type { UserTimeZone } from './summaryConfiguration';

export type DemoCalendarEvent = {
  kind: 'calendar-event';
  id: string;
  title: string;
  localDate: string;
  timeLabel: string;
};

export type DemoCalendarDay = {
  date: string;
  label: string;
  events: DemoCalendarEvent[];
};

export type DemoCalendarSection = {
  label: 'Demo Calendar';
  weekAhead: DemoCalendarDay[];
  events: DemoCalendarEvent[];
  summaryDetail: string;
};

export type DemoCalendarInput = {
  userTimeZone: UserTimeZone;
  now?: Date;
};

const demoEventTemplates = [
  { offsetDays: 0, title: 'Planning check-in', timeLabel: '09:00' },
  { offsetDays: 1, title: 'Design review', timeLabel: '13:30' },
  { offsetDays: 3, title: 'Focus block', timeLabel: 'All day' },
  { offsetDays: 5, title: 'Weekly wrap-up', timeLabel: '16:00' }
] as const;

export const buildDemoCalendarSection = ({
  userTimeZone,
  now = new Date()
}: DemoCalendarInput): DemoCalendarSection => {
  const today = getLocalDateParts(now, userTimeZone);
  const weekAhead = Array.from({ length: 7 }, (_, offsetDays) => {
    const date = addDays(today, offsetDays);
    const dateKey = formatDateKey(date);
    const events = demoEventTemplates
      .filter((event) => event.offsetDays === offsetDays)
      .map((event) => ({
        kind: 'calendar-event' as const,
        id: `demo-calendar-${dateKey}-${event.title.toLowerCase().replaceAll(' ', '-')}`,
        title: event.title,
        localDate: dateKey,
        timeLabel: event.timeLabel
      }));

    return {
      date: dateKey,
      label: formatDayLabel(date),
      events
    };
  });
  const events = weekAhead.flatMap((day) => day.events);
  const summaryDetail = [
    'Demo Calendar - sample Calendar Events for the Week Ahead.',
    ...weekAhead.map((day) => {
      const eventText =
        day.events.length === 0
          ? 'No demo Calendar Events.'
          : day.events.map((event) => `${event.timeLabel} ${event.title}`).join('; ');

      return `${day.label}: ${eventText}`;
    })
  ].join('\n');

  return {
    label: 'Demo Calendar',
    weekAhead,
    events,
    summaryDetail
  };
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

const getLocalDateParts = (date: Date, timeZone: UserTimeZone): LocalDateParts => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value)
  };
};

const addDays = (date: LocalDateParts, offsetDays: number): LocalDateParts => {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + offsetDays));

  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate()
  };
};

const formatDateKey = (date: LocalDateParts) =>
  `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;

const formatDayLabel = (date: LocalDateParts) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
