import { describe, expect, test } from 'vitest';
import {
  buildDailySummaryBlockedImageFixture,
  buildDailySummaryDenseAllActiveFixture,
  buildDailySummaryExtremeContentFixture,
  buildDailySummaryVerificationFixtures,
  measureDailySummaryEncodedSize
} from './dailySummaryFixtures';
import { renderDailySummary } from './dailySummaryRenderer';

const supportedStates = {
  weather: ['active', 'paused', 'unconfigured', 'unavailable'],
  commute: ['active', 'paused', 'unconfigured', 'empty', 'unavailable'],
  calendar: ['active', 'paused', 'unconfigured', 'empty', 'unavailable'],
  todo: ['active', 'paused', 'empty', 'unavailable']
} as const;

describe('Daily Summary email-client verification kit', () => {
  test('provides one dense all-active fixture and four rotating fixtures', () => {
    const fixtures = buildDailySummaryVerificationFixtures();

    expect(fixtures).toHaveLength(5);
    expect(fixtures.filter((fixture) => fixture.kind === 'all-active')).toHaveLength(1);
    expect(fixtures.filter((fixture) => fixture.kind === 'rotating')).toHaveLength(4);
    expect(fixtures.map((fixture) => fixture.id)).toEqual([
      'all-active',
      'rotate-01',
      'rotate-02',
      'rotate-03',
      'rotate-04'
    ]);
  });

  test('rotating fixtures cover every supported state for each Summary Section', () => {
    const rotatingFixtures = buildDailySummaryVerificationFixtures()
      .filter((fixture) => fixture.kind === 'rotating');

    for (const section of Object.keys(supportedStates) as Array<keyof typeof supportedStates>) {
      const states = new Set(rotatingFixtures.map((fixture) => fixture.input.sections[section].status));
      const expectedStates = supportedStates[section].filter((state) => state !== 'active');

      expect([...states]).toEqual(expect.arrayContaining(expectedStates));
    }
  });

  test('the dense fixture contains long non-ASCII content in every content section', () => {
    const fixture = buildDailySummaryDenseAllActiveFixture();
    const rendered = renderDailySummary(fixture);

    expect(fixture.sections.weather.status).toBe('active');
    expect(fixture.sections.commute.status).toBe('active');
    expect(fixture.sections.calendar.status).toBe('active');
    expect(fixture.sections.todo.status).toBe('active');
    expect(rendered.html).toContain('Żółć');
    expect(rendered.html).toContain('Mokotów');
    expect(rendered.html).toContain('Rondo Daszyńskiego');
    expect(rendered.html).toContain('Réunion stratégique');
    expect(rendered.html).toContain('Przygotować plan wdrożenia');
    expect(rendered.text).toContain('Żółć');
    expect(rendered.text).toContain('Réunion stratégique');
    expect(rendered.text).toContain('Przygotować plan wdrożenia');
  });

  test('the active fixture keeps meaning when images are blocked and plain text is inspected', () => {
    const active = renderDailySummary(buildDailySummaryDenseAllActiveFixture());
    const blockedImage = renderDailySummary(buildDailySummaryBlockedImageFixture());

    expect(active.html).toContain('<img');
    expect(active.html).toContain('Partly cloudy');
    expect(active.text).toContain('Partly cloudy');
    expect(blockedImage.html).not.toContain('<img');
    expect(blockedImage.html).toContain('Partly cloudy');
    expect(blockedImage.text).toContain('Partly cloudy');
  });

  test('measures the UTF-8 size of the canonical extreme fixture without a byte budget', () => {
    const rendered = renderDailySummary(buildDailySummaryExtremeContentFixture());
    const size = measureDailySummaryEncodedSize(rendered);
    const encoder = new TextEncoder();

    expect(size).toEqual({
      htmlBytes: encoder.encode(rendered.html).byteLength,
      textBytes: encoder.encode(rendered.text).byteLength,
      totalBytes: encoder.encode(rendered.html).byteLength + encoder.encode(rendered.text).byteLength
    });
    expect(size.htmlBytes).toBeGreaterThan(0);
    expect(size.textBytes).toBeGreaterThan(0);
  });
});
