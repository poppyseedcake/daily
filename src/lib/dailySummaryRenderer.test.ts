import { describe, expect, test } from 'vitest';
import { dailySummarySubject, renderDailySummary, type DailySummaryInput } from './dailySummaryRenderer';
import { buildDemoCalendarSection } from './demoCalendar';
import { buildTodoSection } from './todo';

const pausedSections = {
  weather: { status: 'paused', detail: 'Weather is paused.' },
  commute: { status: 'paused', detail: 'Commute is paused.' },
  calendar: { status: 'paused', detail: 'Calendar is paused.' },
  todo: { status: 'paused', detail: 'Todo is paused.' }
} as const satisfies DailySummaryInput['sections'];

const renderSections = (sections: DailySummaryInput['sections']) => renderDailySummary({
  userTimeZone: 'UTC',
  generatedAt: new Date('2026-07-07T12:00:00.000Z'),
  openDailyUrl: '/',
  sections
});

describe('Daily Summary renderer', () => {
  test('renders each Summary Section from one state-and-content value', () => {
    const rendered = renderSections({
      weather: { status: 'active', detail: '18C and clear.' },
      commute: { status: 'paused', detail: 'Commute is paused.' },
      calendar: { status: 'unavailable', reason: 'Reconnect Google Calendar.' },
      todo: { status: 'empty', detail: 'There are no active Todo Tasks.' }
    });

    expect(rendered.text).toContain('Weather\n18C and clear.');
    expect(rendered.text).toContain('Commute\nPaused\nCommute is paused.');
    expect(rendered.text).toContain('Calendar\nUnavailable\nReconnect Google Calendar.');
    expect(rendered.text).toContain('Todo\nNothing scheduled\nThere are no active Todo Tasks.');
  });

  test('builds the English subject from the actual local generation date', () => {
    const generatedAt = new Date('2026-07-07T12:00:00.000Z');

    expect(dailySummarySubject('scheduled', generatedAt, 'America/New_York')).toBe(
      'Your Daily Summary · Tuesday, 7 July'
    );
    expect(dailySummarySubject('test', generatedAt, 'America/New_York')).toBe(
      'Test · Your Daily Summary · Tuesday, 7 July'
    );
  });

  test('returns HTML and text in the fixed Summary Section order with fixed labels', () => {
    const todo = buildTodoSection([], [{
      id: 'todo-order',
      title: 'Verify fixed order.',
      categoryId: null,
      urgency: 'medium',
      position: 1,
      completed: false
    }])!;
    const rendered = renderSections({
      weather: { status: 'active', detail: 'Weather facts.' },
      commute: {
        status: 'active',
        detail: 'Commute facts.',
        content: { label: 'Commute', estimates: [] }
      },
      calendar: { status: 'active', detail: 'Calendar facts.' },
      todo: { status: 'active', detail: 'Todo facts.', content: todo }
    });

    for (const output of [rendered.html, rendered.text]) {
      expect(output.indexOf('Weather')).toBeLessThan(output.indexOf('Commute'));
      expect(output.indexOf('Commute')).toBeLessThan(output.indexOf('Calendar'));
      expect(output.indexOf('Calendar')).toBeLessThan(output.indexOf('Todo'));
    }
    expect(rendered.html).toContain('max-width:680px');
    expect(rendered.html).not.toContain('background-color:#111827');
  });

  test('escapes section text in HTML while preserving plain text output', () => {
    const unsafe = `<script>&"'</script> Use <b>bold</b> & "quotes".`;
    const rendered = renderSections({
      ...pausedSections,
      weather: { status: 'active', detail: unsafe }
    });

    expect(rendered.html).toContain('&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).not.toContain('<b>bold</b>');
    expect(rendered.text).toContain(unsafe);
  });

  test('renders Demo Calendar detail separately from Todo content', () => {
    const demoCalendar = buildDemoCalendarSection({
      userTimeZone: 'UTC',
      now: new Date('2026-06-22T12:00:00.000Z')
    });
    const todo = buildTodoSection([], [{
      id: 'todo-1',
      title: 'Ship the renderer.',
      categoryId: null,
      urgency: 'low',
      position: 1
    }])!;
    const rendered = renderSections({
      ...pausedSections,
      calendar: { status: 'active', detail: demoCalendar.summaryDetail },
      todo: { status: 'active', content: todo }
    });

    expect(rendered.text).toContain('Demo Calendar');
    expect(rendered.text).toContain('Planning check-in');
    expect(rendered.text).toContain('Ship the renderer. — Low urgency');
  });

  test('renders an empty Calendar state with its seven-day content', () => {
    const rendered = renderSections({
      ...pausedSections,
      calendar: {
        status: 'empty',
        detail: 'No Calendar Events in the Week Ahead.',
        content: {
          label: 'Calendar',
          today: { label: 'Today', allDayEvents: [], timedEvents: [] },
          weekAhead: [{ label: 'Tomorrow', allDayEvents: [], timedEvents: [] }]
        }
      }
    });

    expect(rendered.text).toContain('Calendar\nNothing scheduled\nNo Calendar Events in the Week Ahead.');
    expect(rendered.text).toContain('Today');
    expect(rendered.text).toContain('Tomorrow');
  });

  test.each([null, 'not-a-color', '#0b8043'])(
    'renders Calendar Events safely when the Selected Calendar color is %s',
    (calendarColor) => {
      const rendered = renderSections({
        ...pausedSections,
        calendar: {
          status: 'active',
          content: {
            label: 'Calendar',
            today: {
              label: 'Today',
              allDayEvents: [],
              timedEvents: [{
                id: 'planning',
                title: 'Planning',
                calendarLabel: 'Work & Focus',
                calendarColor,
                localStartTime: '10:00'
              }]
            },
            weekAhead: []
          }
        }
      });

      expect(rendered.html).toContain('Work &amp; Focus');
      expect(rendered.html).toContain('<time>10:00</time> Planning');
      expect(rendered.text).toContain('10:00 Planning (Work & Focus)');
      if (calendarColor === '#0b8043') {
        expect(rendered.html).toContain('background-color:#0b8043');
      }
    }
  );

  test('renders Todo grouping, escaping, and urgency from active content', () => {
    const todo = buildTodoSection(
      [{ id: 'work', name: `<script>Work & "quotes"</script>`, position: 1 }],
      [
        { id: 'uncat', title: 'Buy coffee', categoryId: null, urgency: 'high', position: 1 },
        { id: 'work', title: '<b>Draft update</b>', categoryId: 'work', urgency: 'low', position: 1 }
      ]
    )!;
    const rendered = renderSections({
      ...pausedSections,
      todo: { status: 'active', content: todo }
    });

    expect(rendered.html.indexOf('Buy coffee')).toBeLessThan(rendered.html.indexOf('Work'));
    expect(rendered.html).toContain('&lt;script&gt;Work &amp; &quot;quotes&quot;&lt;/script&gt;');
    expect(rendered.html).toContain('&lt;b&gt;Draft update&lt;/b&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.text).toContain('Buy coffee — High urgency');
    expect(rendered.text).toContain('<b>Draft update</b> — Low urgency');
  });
});
