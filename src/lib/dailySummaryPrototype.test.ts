import { expect, test } from 'vitest';
import { buildDailySummaryDenseAllActiveFixture } from './dailySummaryFixtures';
import { dailySummarySubject, renderDailySummary, type DailySummaryInput } from './dailySummaryRenderer';

test('the delivered template preserves the Daily Grid hierarchy even without head CSS', () => {
  const { html } = renderDailySummary(buildDailySummaryDenseAllActiveFixture());
  const mail = html.replace(/<head>[\s\S]*?<\/head>/, '');

  expect(mail).toContain('data-daily-brand');
  expect(mail).toContain('max-width:790px');
  expect(mail).toContain('18°');
  expect(mail).toContain('font-size:45px');
  expect(mail).toContain('font-size:50px');
  expect(mail).toContain('data-calendar-strip');
  expect(mail.match(/data-calendar-date=/g)).toHaveLength(7);
  expect(mail).toContain('WEEK 31');
  expect(mail).not.toContain('<ul');
  expect(mail).not.toContain('<svg');
  expect(mail).not.toContain('>Generated:');
  for (const span of mail.matchAll(/<span class="daily-screen-reader-only"([^>]*)>/g)) {
    expect(span[1]).toContain('width:0;height:0');
    expect(span[1]).toContain('overflow:hidden;font-size:0');
    expect(span[1]).not.toContain('display:none');
  }
  const todo = mail.slice(mail.indexOf('data-summary-section="todo"'));
  expect(todo.indexOf('data-urgency="high"')).toBeLessThan(todo.indexOf('Przygotować plan wdrożenia'));
});

test('the date strip and ISO week follow the User Time Zone at year boundaries', () => {
  const input = buildDailySummaryDenseAllActiveFixture();
  input.generatedAt = new Date('2026-12-31T23:30:00Z');
  input.userTimeZone = 'Asia/Tokyo';
  const { html } = renderDailySummary(input);
  expect(html).toContain('data-calendar-date="2027-01-01"');
  expect(html).toContain('data-calendar-date="2027-01-07"');
  expect(html).toContain('WEEK 53');
  expect(html).toContain('Friday, 1 January');
  expect(html).toContain('>08:30</td>');
});


test.each([
  ['2026-10-01T03:00:00Z', 'Good morning, Wojtek'],
  ['2026-10-01T10:00:00Z', 'Good afternoon, Wojtek'],
  ['2026-10-01T17:06:00Z', 'Good evening, Wojtek'],
  ['2026-10-01T02:00:00Z', 'Good evening, Wojtek']
])('email greeting follows the workspace at %s', (time, greeting) => {
  const input: DailySummaryInput = buildDailySummaryDenseAllActiveFixture();
  input.generatedAt = new Date(time);
  input.userName = '  Wojtek   M. ';
  const { html, text } = renderDailySummary(input);
  expect(html).toContain(`>${greeting}</h1>`);
  expect(text.split('\n')[0]).toBe(greeting);
});

test('repeated test summaries have different subjects to avoid Gmail trimming in conversations', () => {
  const first = dailySummarySubject('test', new Date('2026-10-01T17:06:00Z'), 'Europe/Warsaw', 'attempt-1');
  const next = dailySummarySubject('test', new Date('2026-10-01T17:06:00Z'), 'Europe/Warsaw', 'attempt-2');
  expect(first).not.toBe(next);
  expect(first).toContain('19:06:00');
  expect(next).toContain('19:06:00');
  expect(first).toContain('#attempt-1');
  expect(next).toContain('#attempt-2');
});
