import { describe, expect, test } from 'vitest';
import { defaultSummaryConfiguration } from './summaryConfiguration';
import { renderDailySummary } from './dailySummaryRenderer';
import { buildDemoCalendarSection } from './demoCalendar';
import { buildTodoSection } from './todo';

describe('Daily Summary renderer', () => {
  test('returns HTML and plain text from the same Daily Summary input in section order', () => {
    const rendered = renderDailySummary({
      configuration: defaultSummaryConfiguration,
      sections: {
        weather: { status: 'available', label: 'Mock Weather', detail: 'Mock: 18C and clear.' },
        commute: { status: 'available', label: 'Mock Commute', detail: 'Mock: 24 minutes by tram.' },
        calendar: { status: 'available', label: 'Calendar', detail: 'Design review at 10:00.' },
        todo: { status: 'available', label: 'Todo', detail: 'Ship the summary renderer.' }
      },
      todoSection: buildTodoSection(
        [],
        [
          {
            id: 'todo-1',
            title: 'Ship the summary renderer.',
            categoryId: null,
            urgency: 'low',
            position: 1
          }
        ]
      )
    });

    expect(rendered.html).toContain('Mock Weather');
    expect(rendered.text).toContain('Mock Weather');
    expect(rendered.html.indexOf('Mock Weather')).toBeLessThan(rendered.html.indexOf('Mock Commute'));
    expect(rendered.html.indexOf('Mock Commute')).toBeLessThan(rendered.html.indexOf('Calendar'));
    expect(rendered.html.indexOf('Calendar')).toBeLessThan(rendered.html.indexOf('Todo'));
    expect(rendered.text.indexOf('Mock Weather')).toBeLessThan(rendered.text.indexOf('Mock Commute'));
    expect(rendered.text.indexOf('Mock Commute')).toBeLessThan(rendered.text.indexOf('Calendar'));
    expect(rendered.text.indexOf('Calendar')).toBeLessThan(rendered.text.indexOf('Todo'));
  });

  test('omits disabled sections, renders unavailable states, and applies the Summary Theme to HTML', () => {
    const rendered = renderDailySummary({
      configuration: {
        ...defaultSummaryConfiguration,
        summaryTheme: 'dark',
        sections: {
          weather: true,
          commute: false,
          calendar: true,
          todo: true
        }
      },
      sections: {
        weather: { status: 'available', label: 'Mock Weather', detail: 'Mock: 18C and clear.' },
        commute: { status: 'available', label: 'Mock Commute', detail: 'Mock: 24 minutes by tram.' },
        calendar: { status: 'unavailable', label: 'Calendar', reason: 'Calendar is not connected yet.' },
        todo: { status: 'available', label: 'Todo', detail: 'Ship the summary renderer.' }
      },
      todoSection: null
    });

    expect(rendered.html).toContain('background-color:#111827');
    expect(rendered.html).toContain('Calendar is not connected yet.');
    expect(rendered.text).toContain('Calendar is not connected yet.');
    expect(rendered.html).not.toContain('Mock Commute');
    expect(rendered.text).not.toContain('Mock Commute');
  });

  test('omits Todo when disabled in configuration even with prepared Todo content', () => {
    const rendered = renderDailySummary({
      configuration: {
        ...defaultSummaryConfiguration,
        sections: {
          weather: false,
          commute: false,
          calendar: true,
          todo: false
        }
      },
      sections: {
        weather: { status: 'available', label: 'Weather', detail: 'Hidden.' },
        commute: { status: 'available', label: 'Commute', detail: 'Hidden.' },
        calendar: { status: 'available', label: 'Calendar', detail: 'Planning check-in.' },
        todo: { status: 'available', label: 'Todo', detail: 'Ship the summary renderer.' }
      },
      todoSection: buildTodoSection(
        [],
        [
          {
            id: 'todo-1',
            title: 'Ship the summary renderer.',
            categoryId: null,
            urgency: 'high',
            position: 1
          }
        ]
      )
    });

    expect(rendered.html).toContain('Calendar');
    expect(rendered.text).toContain('Planning check-in.');
    expect(rendered.html).not.toContain('Todo Tasks');
    expect(rendered.html).not.toContain('Ship the summary renderer.');
    expect(rendered.text).not.toContain('Todo Tasks');
    expect(rendered.text).not.toContain('Ship the summary renderer.');
  });

  test('escapes special characters in HTML while preserving plain text output', () => {
    const rendered = renderDailySummary({
      configuration: {
        ...defaultSummaryConfiguration,
        sections: {
          weather: true,
          commute: false,
          calendar: false,
          todo: false
        }
      },
      sections: {
        weather: {
          status: 'available',
          label: `<script>&"'</script>`,
          detail: `Use <b>bold</b> & "quotes" plus 'apostrophes'.`
        },
        commute: { status: 'available', label: 'Commute', detail: 'Hidden.' },
        calendar: { status: 'available', label: 'Calendar', detail: 'Hidden.' },
        todo: { status: 'available', label: 'Todo', detail: 'Hidden.' }
      },
      todoSection: null
    });

    expect(rendered.html).toContain('&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;');
    expect(rendered.html).toContain(
      'Use &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quotes&quot; plus &#39;apostrophes&#39;.'
    );
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).not.toContain('<b>bold</b>');
    expect(rendered.text).toContain(`<script>&"'</script>`);
    expect(rendered.text).toContain(`Use <b>bold</b> & "quotes" plus 'apostrophes'.`);
  });

  test('renders Demo Calendar Events separately from Todo Tasks in the Daily Summary preview', () => {
    const demoCalendar = buildDemoCalendarSection({
      userTimeZone: 'UTC',
      now: new Date('2026-06-22T12:00:00.000Z')
    });
    const rendered = renderDailySummary({
      configuration: {
        ...defaultSummaryConfiguration,
        sections: {
          weather: false,
          commute: false,
          calendar: true,
          todo: true
        }
      },
      sections: {
        weather: { status: 'available', label: 'Weather', detail: 'Hidden.' },
        commute: { status: 'available', label: 'Commute', detail: 'Hidden.' },
        calendar: {
          status: 'available',
          label: demoCalendar.label,
          detail: demoCalendar.summaryDetail
        },
        todo: { status: 'available', label: 'Todo Tasks', detail: 'Ship the renderer.' }
      },
      todoSection: buildTodoSection(
        [],
        [
          {
            id: 'todo-1',
            title: 'Ship the renderer.',
            categoryId: null,
            urgency: 'low',
            position: 1
          }
        ]
      )
    });

    expect(rendered.html).toContain('Demo Calendar');
    expect(rendered.html).toContain('Planning check-in');
    expect(rendered.html).toContain('Todo Tasks');
    expect(rendered.html.indexOf('Demo Calendar')).toBeLessThan(rendered.html.indexOf('Todo Tasks'));
    expect(rendered.text).toContain('Demo Calendar');
    expect(rendered.text).toContain('Planning check-in');
    expect(rendered.text.indexOf('Demo Calendar')).toBeLessThan(rendered.text.indexOf('Todo Tasks'));
  });

  test('omits Todo output when the module-prepared Todo Section is empty', () => {
    const rendered = renderDailySummary({
      configuration: {
        ...defaultSummaryConfiguration,
        sections: {
          weather: false,
          commute: false,
          calendar: true,
          todo: true
        }
      },
      sections: {
        weather: { status: 'available', label: 'Weather', detail: 'Hidden.' },
        commute: { status: 'available', label: 'Commute', detail: 'Hidden.' },
        calendar: { status: 'available', label: 'Calendar', detail: 'Planning check-in.' },
        todo: { status: 'available', label: 'Todo Tasks', detail: 'Ship the renderer.' }
      },
      todoSection: buildTodoSection([{ id: 'empty', name: 'Empty Category', position: 1 }], [])
    });

    expect(rendered.html).toContain('Calendar');
    expect(rendered.text).toContain('Planning check-in.');
    expect(rendered.html).not.toContain('Todo Tasks');
    expect(rendered.html).not.toContain('Ship the renderer.');
    expect(rendered.text).not.toContain('Todo Tasks');
    expect(rendered.text).not.toContain('Ship the renderer.');
  });

  test('renders active Todo Tasks with uncategorized tasks first, category groups, and urgency marks', () => {
    const rendered = renderDailySummary({
      configuration: {
        ...defaultSummaryConfiguration,
        sections: {
          weather: false,
          commute: false,
          calendar: false,
          todo: true
        }
      },
      sections: {
        weather: { status: 'available', label: 'Weather', detail: 'Hidden.' },
        commute: { status: 'available', label: 'Commute', detail: 'Hidden.' },
        calendar: { status: 'available', label: 'Calendar', detail: 'Hidden.' },
        todo: { status: 'unavailable', label: 'Todo', reason: 'Todo source is not connected yet.' }
      },
      todoSection: buildTodoSection(
        [
          { id: 'work', name: 'Work', position: 1 },
          { id: 'home', name: 'Home', position: 2 },
          { id: 'empty', name: 'Empty Category', position: 3 }
        ],
        [
          { id: 'work-2', title: 'Send agenda', categoryId: 'work', urgency: 'medium', position: 2 },
          { id: 'uncat-1', title: 'Buy coffee', categoryId: null, urgency: 'high', position: 1 },
          { id: 'work-1', title: 'Draft update', categoryId: 'work', urgency: 'low', position: 1 },
          { id: 'home-1', title: 'Water plants', categoryId: 'home', urgency: 'medium', position: 1 }
        ]
      )
    });

    expect(rendered.html).toContain('Todo Tasks');
    expect(rendered.html.indexOf('Buy coffee')).toBeLessThan(rendered.html.indexOf('Work'));
    expect(rendered.html.indexOf('Draft update')).toBeLessThan(rendered.html.indexOf('Send agenda'));
    expect(rendered.html.indexOf('Work')).toBeLessThan(rendered.html.indexOf('Home'));
    expect(rendered.html.indexOf('Home')).toBeLessThan(rendered.html.indexOf('Water plants'));
    expect(rendered.html).toContain('High urgency');
    expect(rendered.html).toContain('Medium urgency');
    expect(rendered.html).not.toContain('Empty Category');
    expect(rendered.text.indexOf('Buy coffee')).toBeLessThan(rendered.text.indexOf('Work'));
    expect(rendered.text.indexOf('Work')).toBeLessThan(rendered.text.indexOf('Home'));
    expect(rendered.text.indexOf('Home')).toBeLessThan(rendered.text.indexOf('Water plants'));
    expect(rendered.text).toContain('Buy coffee !');
    expect(rendered.text).toContain('Draft update');
    expect(rendered.text).not.toContain('Draft update !');
    expect(rendered.text).toContain('Send agenda !');
    expect(rendered.text).toContain('Water plants !');
    expect(rendered.text).not.toContain('Empty Category');
  });

  test('keeps Todo Tasks visible when category metadata is missing', () => {
    const rendered = renderDailySummary({
      configuration: {
        ...defaultSummaryConfiguration,
        sections: {
          weather: false,
          commute: false,
          calendar: false,
          todo: true
        }
      },
      sections: {
        weather: { status: 'available', label: 'Weather', detail: 'Hidden.' },
        commute: { status: 'available', label: 'Commute', detail: 'Hidden.' },
        calendar: { status: 'available', label: 'Calendar', detail: 'Hidden.' },
        todo: { status: 'unavailable', label: 'Todo', reason: 'Todo source is not connected yet.' }
      },
      todoSection: buildTodoSection(
        [],
        [
          {
            id: 'unknown-category-task',
            title: 'Recover orphaned task',
            categoryId: 'missing-category',
            urgency: 'high',
            position: 1
          }
        ]
      )
    });

    expect(rendered.html).toContain('Todo Tasks');
    expect(rendered.html).toContain('Recover orphaned task');
    expect(rendered.text).toContain('Recover orphaned task !');
  });

  test('renders module-prepared Todo Section content without raw Todo grouping inputs', () => {
    const todoSection = buildTodoSection(
      [
        { id: 'work', name: 'Work', position: 1 },
        { id: 'empty', name: 'Empty Category', position: 2 }
      ],
      [
        { id: 'work-2', title: 'Send agenda', categoryId: 'work', urgency: 'medium', position: 2 },
        { id: 'work-1', title: 'Draft update', categoryId: 'work', urgency: 'low', position: 1 },
        { id: 'uncat-1', title: 'Buy coffee', categoryId: null, urgency: 'high', position: 1 }
      ]
    );

    const rendered = renderDailySummary({
      configuration: {
        ...defaultSummaryConfiguration,
        sections: {
          weather: false,
          commute: false,
          calendar: false,
          todo: true
        }
      },
      sections: {
        weather: { status: 'available', label: 'Weather', detail: 'Hidden.' },
        commute: { status: 'available', label: 'Commute', detail: 'Hidden.' },
        calendar: { status: 'available', label: 'Calendar', detail: 'Hidden.' },
        todo: { status: 'unavailable', label: 'Todo', reason: 'Todo source is not connected yet.' }
      },
      todoSection
    });

    expect(rendered.html.indexOf('Buy coffee')).toBeLessThan(rendered.html.indexOf('Work'));
    expect(rendered.html.indexOf('Draft update')).toBeLessThan(rendered.html.indexOf('Send agenda'));
    expect(rendered.html).not.toContain('Empty Category');
    expect(rendered.text).toContain('Buy coffee !');
    expect(rendered.text).toContain('Send agenda !');
  });
});
