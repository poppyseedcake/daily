import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { PostHog } from 'posthog-js';

interface CapturedEvent {
  event: string;
  properties: Record<string, unknown>;
}

declare global {
  interface Window {
    privacyVerification: { posthog: PostHog; events: CapturedEvent[] };
  }
}

// Inspect the compressed payload that PostHog actually captures for upload.
function decodeSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  if (!snapshot.cv) return snapshot;
  expect(snapshot.cv).toBe('2024-10');
  const decode = (value: string) => JSON.parse(gunzipSync(Buffer.from(value, 'latin1')).toString('utf8'));
  if (typeof snapshot.data === 'string') return { ...snapshot, data: decode(snapshot.data) };
  const data = { ...(snapshot.data as Record<string, unknown>) };
  for (const key of ['texts', 'attributes', 'removes', 'adds']) {
    if (typeof data[key] === 'string') data[key] = decode(data[key]);
  }
  return { ...snapshot, data };
}

test('preserves replay presentation while masking private snapshots, mutations, and autocapture', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('daily.onboarding.v1', 'seen');
    // Fake project configuration, supplied through the SDK's normal preload path.
    // Deliberately conflict with local attribute masking to exercise SDK precedence.
    (window as unknown as { _POSTHOG_REMOTE_CONFIG: unknown })._POSTHOG_REMOTE_CONFIG = {
      phc_daily_e2e_test: { config: {
        hasFeatureFlags: false,
        sessionRecording: {
          sampleRate: 1,
          minimumDurationMilliseconds: 0,
          masking: { maskAllInputs: true, maskAllElementAttributes: true }
        }
      } }
    };
  });
  await page.goto('/');
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  let resource: string | undefined;
  await expect.poll(async () => {
    resource = await page.evaluate(() => performance.getEntriesByType('resource').find(entry => entry.name.includes('/.vite/deps/posthog-js.js'))?.name);
    return resource;
  }).toBeTruthy();
  await page.addScriptTag({ type: 'module', content:
    // Only bypass automation detection; keep the application's capture and masking settings.
    'import posthog from ' + JSON.stringify(resource) + '; posthog.stopSessionRecording(); posthog.set_config({opt_out_useragent_filter:true}); window.privacyVerification={posthog,events:[]}; posthog.on("eventCaptured",event=>window.privacyVerification.events.push(event));'
  });
  await page.addScriptTag({ path: resolve('node_modules/posthog-js/dist/posthog-recorder.js') });
  const task = 'PRIVATE_TODO_7ec452';
  await page.getByLabel('New Todo Task').fill(task);
  await page.getByLabel('New Todo Task').press('Enter');
  await page.getByRole('dialog', { name: 'Add task' }).getByRole('button', { name: 'Confirm adding task' }).click();
  await page.evaluate(() => {
    const section = document.createElement('section');
    section.className = 'replay-layout-probe';
    section.style.cssText = 'display: grid; gap: 16px; --calendar-color: #123456;';
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/_app/immutable/assets/replay-layout.css';
    document.head.append(stylesheet);
    section.innerHTML = '<div aria-label="PRIVATE_CALENDAR_7ec452" data-event="PRIVATE_CALENDAR_7ec452">PRIVATE_CALENDAR_7ec452</div><label title="PRIVATE_ADDRESS_7ec452">PRIVATE_ADDRESS_7ec452<input value="PRIVATE_INPUT_7ec452"></label><a href="/PRIVATE_LINK_7ec452">PRIVATE_LINK_7ec452</a><img src="/PRIVATE_IMAGE_7ec452"><svg viewBox="0 0 24 24"><path d="M 0 0 L 24 24"></path></svg>';
    section.querySelector('div')!.setAttribute('style', 'content: "PRIVATE_CSS_TEXT_7ec452"; --private: PRIVATE_CSS_VAR_7ec452; --calendar-color: PRIVATE_CSS_COLOR_7ec452; background-image: url(/PRIVATE_CSS_URL_7ec452)');
    document.body.append(section);
    window.privacyVerification.posthog.startSessionRecording();
  });
  await expect.poll(() => page.evaluate(() => window.privacyVerification.posthog.sessionRecordingStarted())).toBe(true);
  expect(await page.evaluate(() => window.privacyVerification.posthog.config.mask_all_element_attributes)).toBe(true);
  await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>('.replay-layout-probe')!;
    section.querySelector('div')!.textContent = 'PRIVATE_MUTATION_7ec452';
    section.querySelector('div')!.setAttribute('aria-label', 'PRIVATE_MUTATION_7ec452');
    section.className = 'replay-layout-mutated';
    section.style.gap = '24px';
    section.querySelector('a')!.setAttribute('href', '/PRIVATE_MUTATED_LINK_7ec452');
    section.querySelector('img')!.setAttribute('src', '/PRIVATE_MUTATED_IMAGE_7ec452');
    section.querySelector('div')!.setAttribute('style', 'content: "PRIVATE_MUTATED_CSS_7ec452"; display: flex');
    const input = section.querySelector('input')!;
    input.value = 'PRIVATE_EDITED_INPUT_7ec452';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // A real interaction releases the SDK's idle-session buffer and completes the Task.
  await page.getByRole('checkbox', { name: `Complete ${task}`, exact: true }).click();
  const capturedSnapshots = () => page.evaluate(() => window.privacyVerification.events
    .filter(event => event.event === '$snapshot')
    .flatMap(event => event.properties.$snapshot_data as Record<string, unknown>[]));
  await expect.poll(async () => {
    const snapshots = await capturedSnapshots();
    return snapshots.some(event => event.type === 2) && snapshots.some(event => event.type === 3);
  }).toBe(true);
  await page.evaluate(() => window.privacyVerification.posthog.stopSessionRecording());
  const snapshots = (await capturedSnapshots()).map(decodeSnapshot);
  expect(snapshots).toEqual(expect.arrayContaining([expect.objectContaining({ type: 2 }), expect.objectContaining({ type: 3 })]));
  expect(snapshots).toContainEqual(expect.objectContaining({ type: 3, data: expect.objectContaining({ source: 5 }) }));
  expect(JSON.stringify(snapshots).includes('PRIVATE_')).toBe(false);
  const recording = JSON.stringify(snapshots);
  expect(recording).toContain('replay-layout-probe');
  expect(recording).toContain('display: grid');
  expect(recording).toContain('#123456');
  expect(recording).toContain('replay-layout-mutated');
  expect(recording).toContain('24px');
  expect(recording).toContain('M 0 0 L 24 24');
  expect(recording).toContain('daily-mark.svg');
  expect(recording).toContain('.daily-logo');
  expect(recording).toMatch(/\"href\":\"[^\"]+\.css/);
  const events = await page.evaluate(() => window.privacyVerification.events);
  expect(events.map(event => event.event)).toContain('todo_task_created');
  expect(events.map(event => event.event)).toContain('todo_task_completed');
  expect(events.map(event => event.event)).not.toContain('$autocapture');
  expect(JSON.stringify(events)).not.toContain(task);
});
