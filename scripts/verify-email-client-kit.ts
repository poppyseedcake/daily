import { createHash } from 'node:crypto';
import {
  buildDailySummaryVerificationFixtures,
  measureDailySummaryEncodedSize
} from '$lib/dailySummaryFixtures';
import { renderDailySummary } from '$lib/dailySummaryRenderer';

const releaseSha = process.env.DAILY_RELEASE_SHA ?? null;
const fixtures = buildDailySummaryVerificationFixtures().map((fixture) => {
  const rendered = renderDailySummary(fixture.input);
  const size = measureDailySummaryEncodedSize(rendered);
  const artifactSha256 = createHash('sha256')
    .update(rendered.html)
    .update('\0')
    .update(rendered.text)
    .digest('hex');

  return {
    id: fixture.id,
    kind: fixture.kind,
    description: fixture.description,
    states: Object.fromEntries(
      Object.entries(fixture.input.sections).map(([section, state]) => [section, state.status])
    ),
    ...size,
    artifactSha256
  };
});

console.log(JSON.stringify({ releaseSha, fixtures }, null, 2));
