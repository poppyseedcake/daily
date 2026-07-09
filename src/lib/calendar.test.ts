import { describe, expect, test } from 'vitest';
import { buildCalendarSection } from './calendar';
import { renderDailySummary } from './dailySummaryRenderer';
import { defaultSummaryConfiguration } from './summaryConfiguration';

const selectedCalendars = [
  { id: 'personal', summary: 'Personal', backgroundColor: null, primary: true }
];

describe('Calendar Section', () => {
  test('keeps a single-day All-Day Event separate from timed events on the configured local day', () => {
    const section = buildCalendarSection({
      providerEvents: [
        {
          kind: 'all-day',
          id: 'holiday',
          calendarId: 'personal',
          calendarSummary: 'Personal',
          summary: 'Holiday',
          startDate: '2026-07-07',
          endDate: '2026-07-08'
        },
        {
          kind: 'timed',
          id: 'standup',
          calendarId: 'personal',
          calendarSummary: 'Personal',
          summary: 'Standup',
          start: '2026-07-07T16:00:00.000Z',
          end: '2026-07-07T16:30:00.000Z'
        }
      ],
      selectedCalendars,
      userTimeZone: 'America/New_York',
      now: new Date('2026-07-08T03:00:00.000Z')
    });

    expect(section.today).toEqual({
      label: 'Today',
      allDayEvents: [{ id: 'holiday', title: 'Holiday', calendarLabel: 'Personal' }],
      timedEvents: [
        { id: 'standup', title: 'Standup', calendarLabel: 'Personal', localStartTime: '12:00' }
      ]
    });
  });

  test('renders a multi-day All-Day Event on every covered local date in the Week Ahead', () => {
    const section = buildCalendarSection({
      providerEvents: [
        {
          kind: 'all-day',
          id: 'conference',
          calendarId: 'personal',
          calendarSummary: 'Personal',
          summary: 'Conference',
          startDate: '2026-07-08',
          endDate: '2026-07-11'
        }
      ],
      selectedCalendars,
      userTimeZone: 'America/New_York',
      now: new Date('2026-07-08T10:00:00.000Z')
    });

    expect(section.today?.allDayEvents).toEqual([
      { id: 'conference', title: 'Conference', calendarLabel: 'Personal' }
    ]);
    expect(section.weekAhead.map((day) => [day.label, day.allDayEvents])).toEqual([
      ['Thu, Jul 9', [{ id: 'conference', title: 'Conference', calendarLabel: 'Personal' }]],
      ['Fri, Jul 10', [{ id: 'conference', title: 'Conference', calendarLabel: 'Personal' }]]
    ]);
  });

  test('includes an All-Day Event only on its dates inside the Week Ahead boundaries', () => {
    const section = buildCalendarSection({
      providerEvents: [
        {
          kind: 'all-day',
          id: 'leave',
          calendarId: 'personal',
          calendarSummary: 'Personal',
          summary: 'Leave',
          startDate: '2026-07-06',
          endDate: '2026-07-17'
        }
      ],
      selectedCalendars,
      userTimeZone: 'America/New_York',
      now: new Date('2026-07-08T10:00:00.000Z')
    });

    expect([section.today, ...section.weekAhead].map((day) => day?.allDayEvents[0]?.id)).toEqual([
      'leave',
      'leave',
      'leave',
      'leave',
      'leave',
      'leave',
      'leave'
    ]);
  });

  test('excludes declined and canceled Calendar Events from rendered HTML and text', () => {
    const calendarSection = buildCalendarSection({
      providerEvents: [
        {
          kind: 'timed',
          id: 'declined',
          calendarId: 'personal',
          calendarSummary: 'Personal',
          summary: 'Declined planning',
          start: '2026-07-08T15:00:00.000Z',
          end: '2026-07-08T16:00:00.000Z',
          selfResponseStatus: 'declined'
        },
        {
          kind: 'all-day',
          id: 'canceled',
          calendarId: 'personal',
          calendarSummary: 'Personal',
          summary: 'Canceled leave',
          startDate: '2026-07-08',
          endDate: '2026-07-09',
          status: 'cancelled'
        },
        {
          kind: 'timed',
          id: 'included',
          calendarId: 'personal',
          calendarSummary: 'Personal',
          summary: 'Included planning',
          start: '2026-07-08T17:00:00.000Z',
          end: '2026-07-08T18:00:00.000Z'
        }
      ],
      selectedCalendars,
      userTimeZone: 'America/New_York',
      now: new Date('2026-07-08T10:00:00.000Z')
    });
    const rendered = renderDailySummary({
      configuration: {
        ...defaultSummaryConfiguration,
        sections: { weather: false, commute: false, calendar: true, todo: false }
      },
      sections: {
        weather: { status: 'available', label: 'Weather', detail: '' },
        commute: { status: 'available', label: 'Commute', detail: '' },
        calendar: { status: 'available', label: 'Calendar', detail: '' },
        todo: { status: 'available', label: 'Todo', detail: '' }
      },
      calendarSection,
      todoSection: null
    });

    expect(rendered.html).toContain('Included planning');
    expect(rendered.text).toContain('Included planning');
    expect(rendered.html).not.toContain('Declined planning');
    expect(rendered.text).not.toContain('Declined planning');
    expect(rendered.html).not.toContain('Canceled leave');
    expect(rendered.text).not.toContain('Canceled leave');
  });
});
