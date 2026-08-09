import { createHash } from 'node:crypto';
import {
  buildDailySummaryVerificationFixtures,
  measureDailySummaryEncodedSize
} from '$lib/dailySummaryFixtures';
import { createDailySummaryGenerator } from '$lib/server/scheduledDailySummaryGeneration';

const releaseSha = process.env.DAILY_RELEASE_SHA ?? null;
const fixtures = await Promise.all(buildDailySummaryVerificationFixtures().map(async (fixture) => {
  const generated = await createDailySummaryGenerator({
    userLifecycleStore: { isActive: async () => true },
    configurationStore: { load: async () => fixture.input.configuration },
    todoStore: { load: async () => ({ todoCategories: [], todoTasks: [] }) },
    weatherLocationStore: { load: async () => null },
    commuteSetupStore: { load: async () => ({ routes: [], days: [] }) },
    calendarConnectionStore: {
      load: async () => ({ status: 'not-connected' }),
      loadSelectedCalendars: async () => []
    },
    loadCalendarAccessToken: async () => null,
    calendarEventProvider: () => ({
      fetchEvents: async () => ({ outcome: 'unavailable', reason: 'fixture provider unused' })
    }),
    weatherProvider: {
      fetchDailyForecast: async () => ({
        outcome: 'unavailable',
        reason: 'fixture provider unused'
      })
    },
    commuteEstimateProvider: () => undefined,
    buildInput: async () => fixture.input,
    now: () => fixture.input.generatedAt ?? new Date('2026-07-31T05:00:00.000Z')
  }).generate('verification-user', {
    configuration: fixture.input.configuration,
    openDailyUrl: fixture.input.openDailyUrl,
    now: fixture.input.generatedAt
  });
  const rendered = generated.rendered;
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
}));

console.log(JSON.stringify({ releaseSha, fixtures }, null, 2));
