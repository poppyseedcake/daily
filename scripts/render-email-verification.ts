import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDailySummaryPrototypeFixture,
  buildDailySummaryExtremeContentFixture,
  buildDailySummaryVerificationFixtures
} from '../src/lib/dailySummaryFixtures';
import { renderDailySummary } from '../src/lib/dailySummaryRenderer';

const directory = process.argv[2];
if (!directory) throw new Error('Provide an output directory for synthetic email previews.');
mkdirSync(directory, { recursive: true });
const fixtures = [
  { id: 'prototype-b', input: buildDailySummaryPrototypeFixture() },
  { id: 'extreme', input: buildDailySummaryExtremeContentFixture() },
  ...buildDailySummaryVerificationFixtures()
];
for (const { id, input } of fixtures) {
  const rendered = renderDailySummary(input);
  // Serve the directory with static/email-icons copied into it to inspect the icons.
  const html = rendered.html.replaceAll('https://daily.example.test/email-icons/', '/email-icons/');
  writeFileSync(join(directory, `${id}.html`), html);
  writeFileSync(join(directory, `${id}-without-head-css.html`), html.replace(/<style>[\s\S]*?<\/style>/, ''));
  writeFileSync(join(directory, `${id}.txt`), rendered.text);
}
console.log(`Rendered ${fixtures.length} synthetic fixtures in ${directory}. No email sent.`);
