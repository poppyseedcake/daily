import { describe, expect, test } from 'vitest';
import {
  buildDailySummaryBlockedImageFixture,
  buildDailySummaryFixture,
  buildDailySummaryExtremeContentFixture,
  buildDailySummaryNarrowFixture,
  buildDailySummaryStateMatrixFixtures
} from './dailySummaryFixtures';
import { renderDailySummary } from './dailySummaryRenderer';

const sectionKeys = ['weather', 'commute', 'calendar', 'todo'] as const;

describe('Daily Grid renderer', () => {
  test('renders one fixed four-section presentation table in source and text order', () => {
    const rendered = renderDailySummary(buildDailySummaryFixture());

    expect(rendered.html).toContain('max-width:680px');
    expect(rendered.html).toContain('role="presentation"');
    expect(rendered.html).toContain('class="daily-grid-cell"');
    expect(rendered.html).not.toMatch(/display\s*:\s*(grid|flex)/i);
    expect(rendered.html).not.toContain('border-radius');

    for (const output of [rendered.html, rendered.text]) {
      const positions = sectionKeys.map((section) => output.indexOf(sectionLabel(section)));

      expect(positions.every((position) => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].toSorted((left, right) => left - right));
    }

    expect(rendered.html.match(/data-summary-section="/g)).toHaveLength(4);
    expect(rendered.text.match(/^Weather$/gm)).toHaveLength(1);
    expect(rendered.text.match(/^Commute$/gm)).toHaveLength(1);
    expect(rendered.text.match(/^Calendar$/gm)).toHaveLength(1);
    expect(rendered.text.match(/^Todo$/gm)).toHaveLength(1);
  });

  test('includes the actual local generation timestamp, timezone, and canonical Open Daily link', () => {
    const rendered = renderDailySummary(buildDailySummaryFixture());

    expect(rendered.html).toContain('Good morning');
    expect(rendered.html).not.toContain('Good morning,');
    expect(rendered.html).toContain('Friday, July 31, 2026 at 07:00');
    expect(rendered.html).toContain('Daily · Europe/Warsaw');
    expect(rendered.html).toContain('href="https://daily.example.test/"');
    expect(rendered.html).not.toContain('utm_');
    expect(rendered.html).not.toContain('#fixture');

    expect(rendered.text).toContain('Good morning');
    expect(rendered.text).toContain('Generated: Friday, July 31, 2026 at 07:00 (Europe/Warsaw)');
    expect(rendered.text).toContain('Daily · Europe/Warsaw');
    expect(rendered.text).toContain('Open Daily: https://daily.example.test/');
  });

  test('keeps every supported state combination visible in the fixed hierarchy', () => {
    const fixtures = buildDailySummaryStateMatrixFixtures();

    expect(fixtures).toHaveLength(400);

    for (const fixture of fixtures) {
      const rendered = renderDailySummary(fixture);

      expect(rendered.html.match(/data-summary-section="/g)).toHaveLength(4);
      expect(rendered.text.match(/^Weather$/gm)).toHaveLength(1);
      expect(rendered.text.match(/^Commute$/gm)).toHaveLength(1);
      expect(rendered.text.match(/^Calendar$/gm)).toHaveLength(1);
      expect(rendered.text.match(/^Todo$/gm)).toHaveLength(1);

      for (const section of sectionKeys) {
        const sectionFixture = fixture.sections[section];
        const detail = 'reason' in sectionFixture ? sectionFixture.reason : sectionFixture.detail;

        expect(rendered.text).toContain(detail ?? stateCopy(section, sectionFixture.status));
      }
    }
  });

  test('defines the narrow-client stack without changing source order or adding horizontal scrolling', () => {
    const rendered = renderDailySummary(buildDailySummaryNarrowFixture());

    expect(rendered.html).toContain('@media only screen and (max-width: 620px)');
    expect(rendered.html).toContain('.daily-grid-cell { display: block !important; width: 100% !important; }');
    expect(rendered.html).not.toMatch(/overflow-x\s*:\s*(auto|scroll)/i);
    expect(rendered.html.indexOf('>Weather</h2>')).toBeLessThan(rendered.html.indexOf('>Commute</h2>'));
    expect(rendered.html.indexOf('>Commute</h2>')).toBeLessThan(rendered.html.indexOf('>Calendar</h2>'));
    expect(rendered.html.indexOf('>Calendar</h2>')).toBeLessThan(rendered.html.indexOf('>Todo</h2>'));
  });

  test('authors plain text independently and preserves long non-ASCII values', () => {
    const fixture = buildDailySummaryExtremeContentFixture();
    const rendered = renderDailySummary(fixture);
    const longTitle = fixture.todoSection?.uncategorizedTasks[0]?.title ?? '';
    const calendarTitle = fixture.calendarSection?.today?.timedEvents[0]?.title ?? '';

    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('Żółć');
    expect(rendered.text).toContain(longTitle);
    expect(rendered.text).toContain(calendarTitle);
    expect(rendered.text).toContain('High urgency');
    expect(rendered.text).toContain('Heavy traffic');
    expect(rendered.text).not.toContain('&lt;script&gt;');
  });

  test('keeps meaning when decorative images are unavailable', () => {
    const rendered = renderDailySummary(buildDailySummaryBlockedImageFixture());

    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).toContain('Partly cloudy');
    expect(rendered.text).toContain('Partly cloudy');
    expect(rendered.html).toContain('Light traffic');
    expect(rendered.text).toContain('Light traffic');
  });

  test('keeps traffic descriptions hidden in HTML while stating them in plain text', () => {
    const fixture = buildDailySummaryFixture();
    const rendered = renderDailySummary({
      ...fixture,
      commuteSection: {
        ...fixture.commuteSection!,
        estimates: [{
          ...fixture.commuteSection!.estimates[0]!,
          originLabel: 'Mokotów',
          destinationLabel: 'Rondo Daszyńskiego'
        }]
      }
    });

    expect(rendered.html).toContain('class="daily-screen-reader-only">Light traffic</span>');
    expect(rendered.html).toContain('color:#4d7a53');
    expect(rendered.html).not.toContain(' — Light traffic');
    expect(rendered.html).toContain('Home: Mokotów');
    expect(rendered.html).toContain('Office: Rondo Daszyńskiego');
    expect(rendered.text).toContain('Office: 24 minutes — Light traffic');
    expect(rendered.text).toContain('Home: Mokotów\n→\nOffice\nRondo Daszyńskiego');
  });
});

const sectionLabel = (section: (typeof sectionKeys)[number]) =>
  section[0].toUpperCase() + section.slice(1);

const stateCopy = (
  section: (typeof sectionKeys)[number],
  status: string
) => `${sectionLabel(section)} ${status}`;
