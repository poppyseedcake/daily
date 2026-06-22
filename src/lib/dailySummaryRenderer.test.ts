import { describe, expect, test } from 'vitest';
import { defaultSummaryConfiguration } from './summaryConfiguration';
import { renderDailySummary } from './dailySummaryRenderer';

describe('Daily Summary renderer', () => {
  test('returns HTML and plain text from the same Daily Summary input in section order', () => {
    const rendered = renderDailySummary({
      configuration: defaultSummaryConfiguration,
      sections: {
        weather: { status: 'available', label: 'Mock Weather', detail: 'Mock: 18C and clear.' },
        commute: { status: 'available', label: 'Mock Commute', detail: 'Mock: 24 minutes by tram.' },
        calendar: { status: 'available', label: 'Calendar', detail: 'Design review at 10:00.' },
        todo: { status: 'available', label: 'Todo', detail: 'Ship the summary renderer.' }
      }
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
      }
    });

    expect(rendered.html).toContain('background-color:#111827');
    expect(rendered.html).toContain('Calendar is not connected yet.');
    expect(rendered.text).toContain('Calendar is not connected yet.');
    expect(rendered.html).not.toContain('Mock Commute');
    expect(rendered.text).not.toContain('Mock Commute');
  });
});
