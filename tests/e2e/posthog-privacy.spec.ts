import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { PostHog } from 'posthog-js';
import type { Replayer } from '@posthog/rrweb-replay';

interface CapturedEvent {
  event: string;
  properties: Record<string, unknown>;
}

declare global {
  interface Window {
    privacyVerification: { posthog: PostHog; events: CapturedEvent[] };
    rrweb: { Replayer: typeof Replayer };
    __PosthogExtensions__: {
      initSessionRecording: (posthog: PostHog, documentWasVisible: boolean) => unknown;
    };
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

function observePostHogInstance() {
  // Observe the real application instance at the SDK's lazy-recorder seam.
  // Forward startup unchanged; this works with both Vite and the production bundle.
  const initialize = window.__PosthogExtensions__.initSessionRecording;
  window.__PosthogExtensions__.initSessionRecording = (posthog, documentWasVisible) => {
    if (!window.privacyVerification) window.privacyVerification = { posthog, events: [] };
    return initialize(posthog, documentWasVisible);
  };
}

function recordedCityDialogIsModal(snapshots: Record<string, unknown>[]): boolean {
  let dialog: { id: number; attributes: Record<string, string> } | undefined;
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const node = value as { tagName?: string; id: number; attributes?: Record<string, string> };
    if (node.tagName === 'dialog' && node.attributes?.class?.split(' ').includes('daily-city-dialog')) {
      dialog = { id: node.id, attributes: node.attributes };
    }
    Object.values(value).forEach(visit);
  }
  snapshots.forEach(visit);
  if (!dialog) return false;
  if (dialog.attributes.rr_open_mode === 'modal') return true;
  return snapshots.some(snapshot => {
    const data = snapshot.data as { attributes?: { id: number; attributes: Record<string, string> }[] };
    return snapshot.type === 3 && data.attributes?.some(mutation =>
      mutation.id === dialog!.id && mutation.attributes.rr_open_mode === 'modal');
  });
}

test('preserves replay presentation while masking private snapshots, mutations, and autocapture', async ({ page }, testInfo) => {
  // Production uses linked stylesheets; Vite's inline development styles miss this path.
  await page.route('**/_app/immutable/assets/replay-layout.css', route => route.fulfill({
    contentType: 'text/css',
    body: '.replay-layout-probe, .replay-layout-mutated { padding: 31px; background-color: rgb(12, 34, 56); }'
  }));
  await page.route('**/private-user-styles.css', route => route.fulfill({
    contentType: 'text/css',
    body: '.private-css-probe::before { content: "PRIVATE_STYLESHEET_7ec452"; }'
  }));
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
  await page.addInitScript({
    // Keep dependent setup in one script: Playwright does not guarantee init-script order.
    content: readFileSync(resolve('node_modules/posthog-js/dist/posthog-recorder.js'), 'utf8') +
      `\n;(${observePostHogInstance.toString()})();`
  });
  await page.goto('/');
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => !!window.privacyVerification)).toBe(true);
  await page.evaluate(() => {
    const posthog = window.privacyVerification.posthog;
    // Bypass headless/automation detection only; keep all application privacy settings.
    posthog.set_config({ opt_out_useragent_filter: true });
    posthog.on('eventCaptured', event => window.privacyVerification.events.push(event));
    posthog.stopSessionRecording();
  });
  const task = 'PRIVATE_TODO_7ec452';
  await page.getByLabel('New Todo Task').fill(task);
  await page.getByLabel('New Todo Task').press('Enter');
  await page.getByRole('dialog', { name: 'Add task' }).getByRole('button', { name: 'Confirm adding task' }).click();
  const recordingStartedAt = await page.evaluate(async () => {
    const section = document.createElement('section');
    section.className = 'replay-layout-probe';
    section.setAttribute('_cssText', 'PRIVATE_FORGED_CSS_7ec452');
    section.style.cssText = 'display: grid; gap: 16px; --calendar-color: #123456;';
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/_app/immutable/assets/replay-layout.css';
    const loaded = new Promise<void>(resolve => stylesheet.onload = () => resolve());
    document.head.append(stylesheet);
    await loaded;
    const privateStylesheet = document.createElement('link');
    privateStylesheet.rel = 'stylesheet';
    privateStylesheet.href = '/private-user-styles.css';
    const privateLoaded = new Promise<void>(resolve => privateStylesheet.onload = () => resolve());
    document.head.append(privateStylesheet);
    await privateLoaded;
    section.innerHTML = '<div aria-label="PRIVATE_CALENDAR_7ec452" data-event="PRIVATE_CALENDAR_7ec452">PRIVATE_CALENDAR_7ec452</div><label title="PRIVATE_ADDRESS_7ec452">PRIVATE_ADDRESS_7ec452<input value="PRIVATE_INPUT_7ec452"></label><a href="/PRIVATE_LINK_7ec452">PRIVATE_LINK_7ec452</a><img src="/PRIVATE_IMAGE_7ec452"><svg viewBox="0 0 24 24"><path d="M 0 0 L 24 24"></path></svg>';
    section.querySelector('div')!.setAttribute('style', 'content: "PRIVATE_CSS_TEXT_7ec452"; --private: PRIVATE_CSS_VAR_7ec452; --calendar-color: PRIVATE_CSS_COLOR_7ec452; background-image: url(/PRIVATE_CSS_URL_7ec452)');
    document.body.append(section);
    const startedAt = Date.now();
    window.privacyVerification.posthog.startSessionRecording();
    return startedAt;
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
    const added = document.createElement('div');
    added.textContent = 'PRIVATE_ADDED_CONTENT_7ec452';
    document.body.append(added);
  });
  // A real interaction releases the SDK's idle-session buffer and completes the Task.
  await page.getByRole('checkbox', { name: `Complete ${task}`, exact: true }).click();
  // Also protect private content created by Svelte while recording is already active.
  const addedTask = 'PRIVATE_ADDED_TODO_7ec452';
  await page.getByLabel('New Todo Task').fill(addedTask);
  await page.getByLabel('New Todo Task').press('Enter');
  await page.getByRole('dialog', { name: 'Add task' }).getByRole('button', { name: 'Confirm adding task' }).click();
  await page.getByRole('button', { name: 'Weather. Choose a city' }).click();
  await expect(page.getByRole('dialog', { name: 'Choose a city' })).toBeVisible();
  const capturedSnapshots = () => page.evaluate(startedAt => window.privacyVerification.events
    .filter(event => event.event === '$snapshot')
    .flatMap(event => event.properties.$snapshot_data as Record<string, unknown>[])
    .filter(event => (event.timestamp as number) >= startedAt), recordingStartedAt);
  await expect.poll(async () => {
    const snapshots = await capturedSnapshots();
    return snapshots.some(event => event.type === 2) &&
      recordedCityDialogIsModal(snapshots.map(decodeSnapshot));
  }).toBe(true);
  await page.evaluate(() => window.privacyVerification.posthog.stopSessionRecording());
  const snapshots = (await capturedSnapshots()).map(decodeSnapshot)
    .sort((first, second) => (first.timestamp as number) - (second.timestamp as number));
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
  const events = await page.evaluate(() => window.privacyVerification.events);
  expect(events.map(event => event.event)).toContain('todo_task_created');
  expect(events.map(event => event.event)).toContain('todo_task_completed');
  expect(events.map(event => event.event)).not.toContain('$autocapture');
  expect(JSON.stringify(events)).not.toContain(task);
  expect(JSON.stringify(events)).not.toContain(addedTask);

  // Use PostHog's actual replayer, with network disabled so missing embedded CSS
  // cannot be hidden by fetching the live app's stylesheets during the test.
  await page.route('**/*', route => route.abort());
  await page.route('**/daily-mark.svg', route => route.fulfill({ path: resolve('static/daily-mark.svg') }));
  await page.addScriptTag({ path: resolve('node_modules/@posthog/rrweb-replay/dist/rrweb-replay.umd.cjs') });
  await page.evaluate(events => {
    const root = document.createElement('div');
    root.id = 'privacy-replayer';
    document.body.append(root);
    const replayer = new window.rrweb.Replayer(events as ConstructorParameters<typeof Replayer>[0], { root });
    // Seek beyond the last event, so a final modal-state mutation is applied too.
    replayer.pause((events.at(-1)!.timestamp as number) - (events[0].timestamp as number) + 1);
  }, snapshots);
  const replay = page.frameLocator('#privacy-replayer iframe');
  await page.locator('#privacy-replayer iframe').screenshot({ path: testInfo.outputPath('replay.png') });
  await expect(replay.locator('.replay-layout-mutated')).toHaveCSS('padding-top', '31px');
  await expect(replay.locator('.replay-layout-mutated')).toHaveCSS('background-color', 'rgb(12, 34, 56)');
  await expect(replay.locator('.replay-layout-mutated')).toHaveCSS('display', 'grid');
  await expect(replay.locator('.replay-layout-mutated')).toHaveCSS('gap', '24px');
  // Check Daily's real stylesheet as well as the linked fixture, including its rail layout.
  await expect(replay.locator('.daily-board-shell')).toHaveCSS('display', 'grid');
  await expect(replay.locator('.daily-board-shell')).toHaveCSS('background-color', 'rgb(247, 248, 245)');
  await expect(replay.locator('.daily-rail')).toHaveCSS('display', 'flex');
  await expect(replay.locator('.daily-rail')).toHaveCSS('position', 'sticky');
  expect(await replay.locator('.daily-city-dialog').evaluate(dialog => dialog.matches('dialog:modal'))).toBe(true);
  await expect(replay.locator('.daily-city-dialog')).toHaveCSS('width', '390px');
  await expect(replay.locator('.daily-city-dialog')).toHaveCSS('position', 'fixed');
  await expect(replay.locator('.daily-city-dialog')).toHaveCSS('border-radius', '14px');
  await expect.poll(() => replay.locator('img[src$="/daily-mark.svg"]').first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.locator('#privacy-replayer iframe').screenshot({ path: testInfo.outputPath('replay.png') });
});
