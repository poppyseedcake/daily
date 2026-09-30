import {
  buildDailySummaryVerificationFixtures,
  measureDailySummaryEncodedSize
} from '$lib/dailySummaryFixtures';
import { renderDailySummary } from '$lib/dailySummaryRenderer';

const releaseSha = process.env.DAILY_RELEASE_SHA ?? null;
const fixtures = buildDailySummaryVerificationFixtures().map((fixture) => {
  const rendered = renderDailySummary(fixture.input);
  const size = measureDailySummaryEncodedSize(rendered);

  return {
    id: fixture.id,
    kind: fixture.kind,
    description: fixture.description,
    states: Object.fromEntries(
      Object.entries(fixture.input.sections).map(([section, state]) => [section, state.status])
    ),
    ...size
  };
});

console.log(JSON.stringify({ releaseSha, fixtures }, null, 2));
