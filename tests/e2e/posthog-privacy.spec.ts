import { expect, type Page } from '@playwright/test';
import { test } from './fixtures/signedInUser';
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

async function prepareRecorder(page: Page) {
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
          masking: { maskAllInputs: true, maskAllElementAttributes: true, maskTextSelector: '*' }
        }
      } }
    };
  });
  await page.addInitScript({
    // Keep dependent setup in one script: Playwright does not guarantee init-script order.
    content: readFileSync(resolve('node_modules/posthog-js/dist/posthog-recorder.js'), 'utf8') +
      `\n;(${observePostHogInstance.toString()})();`
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
  await prepareRecorder(page);
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
    section.setAttribute('data-private', '');
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
    added.setAttribute('data-private', '');
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
  for (const label of ['Your Tasks', 'Groups', 'Visitor preview', 'Choose a city', 'Capture a task…']) {
    expect(recording.includes(label), `Application copy should be readable: ${label}`).toBe(true);
  }
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
  await expect(replay.getByRole('heading', { name: 'Your Tasks', exact: true })).toHaveText('Your Tasks');
  await expect(replay.getByRole('heading', { name: 'Choose a city', exact: true })).toHaveText('Choose a city');
  await expect(replay.locator('.daily-task-title')).not.toContainText('PRIVATE_');
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


test('masks saved and newly rendered User content while preserving labels across workspace dialogs', async ({ page, signedInUser: { database, userId } }) => {
  const name = 'PRIVATE_NAME_7ec452';
  const email = 'private-replay-7ec452@example.com';
  database.prepare('update auth_user set name = ?, email = ? where id = ?').run(name, email, userId);
  database.prepare('update users set email = ? where id = ?').run(email, userId);
  database.prepare('insert into summary_configurations (id, user_id) values (?, ?)').run(crypto.randomUUID(), userId);
  const categoryId = crypto.randomUUID();
  database.prepare('insert into todo_categories (id, user_id, name, position) values (?, ?, ?, 1)')
    .run(categoryId, userId, 'PRIVATE_GROUP_7ec452');
  database.prepare('insert into todo_tasks (id, user_id, category_id, title, position) values (?, ?, ?, ?, 1)')
    .run(crypto.randomUUID(), userId, categoryId, 'PRIVATE_SAVED_TASK_7ec452');
  database.prepare('insert into weather_locations (id, user_id, label, latitude, longitude) values (?, ?, ?, 52, 21)')
    .run(crypto.randomUUID(), userId, 'PRIVATE_CITY_7ec452');
  database.prepare('insert into saved_weather_cities (id, user_id, label, latitude, longitude, position) values (?, ?, ?, 52, 21, 1)')
    .run(crypto.randomUUID(), userId, 'PRIVATE_SAVED_CITY_7ec452');
  database.prepare('insert into saved_commute_addresses (id, user_id, label, latitude, longitude, position) values (?, ?, ?, 52, 21, 1)')
    .run(crypto.randomUUID(), userId, 'PRIVATE_SAVED_ADDRESS_7ec452');
  database.prepare(`insert into commute_routes (id, user_id, name, origin_label, origin_latitude, origin_longitude,
    destination_label, destination_latitude, destination_longitude, position)
    values (?, ?, ?, ?, 52, 21, ?, 53, 22, 1)`)
    .run(crypto.randomUUID(), userId, 'PRIVATE_ROUTE_7ec452', 'PRIVATE_ORIGIN_7ec452', 'PRIVATE_DESTINATION_7ec452');
  const now = Math.floor(Date.now() / 1000);
  const scopes = ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly'];
  database.prepare('update auth_account set access_token = ?, access_token_expires_at = ?, scope = ? where user_id = ?')
    .run('fixture-access-token', now + 3600, scopes.join(' '), userId);
  database.prepare(`insert into calendar_connections (id, user_id, connection_status, provider_account_id,
    granted_scopes, access_token_available, access_token_expires_at) values (?, ?, 'connected', ?, ?, 1, ?)`)
    .run(crypto.randomUUID(), userId, `google-${userId}`, JSON.stringify(scopes), now + 3600);
  database.prepare(`insert into selected_calendars (id, user_id, calendar_id, summary, position, \`primary\`)
    values (?, ?, 'primary', 'Primary', 0, 1)`).run(crypto.randomUUID(), userId);
  await prepareRecorder(page);
  await page.goto('/');
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await expect(page.getByText('PRIVATE_SAVED_TASK_7ec452', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!window.privacyVerification)).toBe(true);
  await page.evaluate(() => {
    const posthog = window.privacyVerification.posthog;
    posthog.set_config({ opt_out_useragent_filter: true });
    posthog.on('eventCaptured', event => window.privacyVerification.events.push(event));
    posthog.stopSessionRecording();
    posthog.startSessionRecording();
  });
  await page.getByLabel('Move PRIVATE_SAVED_TASK_7ec452', { exact: true }).press('Space');
  await expect(page.locator('#dnd-action-aria-alert')).toContainText('PRIVATE_SAVED_TASK_7ec452');
  await page.keyboard.press('Escape');
  await page.getByLabel('Open account menu').click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toContainText(email);
  await page.getByLabel('Close panel').click();
  await page.getByRole('button', { name: /^Weather\./ }).click();
  await expect(page.getByRole('dialog', { name: 'Choose a city' })).toContainText('PRIVATE_SAVED_CITY_7ec452');
  await page.getByLabel('Close city picker').click();
  await page.getByRole('button', { name: /^Commute\./ }).click();
  await page.getByRole('button', { name: /PRIVATE_ROUTE_7ec452/ }).click();
  await expect(page.getByRole('dialog', { name: 'Edit route' })).toContainText('PRIVATE_ORIGIN_7ec452');
  await page.getByLabel('Commute Origin Search').fill('');
  await expect(page.getByRole('dialog', { name: 'Edit route' })).toContainText('PRIVATE_SAVED_ADDRESS_7ec452');
  await page.getByLabel('Close route editor').click();
  await page.getByRole('button', { name: /^Calendar\./ }).click();
  await expect(page.getByRole('dialog', { name: 'Next 7 days' })).toContainText('Primary planning');
  await page.getByLabel('Calendar settings').click();
  await expect(page.getByRole('dialog', { name: 'Calendars' })).toContainText('Primary');
  await page.getByLabel('Close calendar selection').click();
  await page.getByLabel('Todo. Open task list').click();
  await expect(page.getByRole('dialog', { name: 'All tasks' })).toContainText('PRIVATE_GROUP_7ec452');
  await page.getByLabel('Close Todo task list').click();
  await expect(page.getByRole('dialog', { name: 'All tasks' })).not.toBeVisible();
  await page.getByLabel('Delete PRIVATE_GROUP_7ec452', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Delete group?' })).toContainText('PRIVATE_GROUP_7ec452');
  await page.getByLabel('Close delete group dialog').click();
  await expect(page.getByRole('dialog', { name: 'Delete group?' })).not.toBeVisible();
  // The preview echoes unsaved input before the Task exists.
  await page.getByLabel('New Todo Task').fill('PRIVATE_UNSAVED_TASK_7ec452');
  await page.getByLabel('New Todo Task').press('Enter');
  await expect(page.getByRole('dialog', { name: 'Add task' })).toContainText('PRIVATE_UNSAVED_TASK_7ec452');
  await page.getByLabel('Previous group').click();
  await expect(page.getByRole('dialog', { name: 'Add task' })).toContainText('PRIVATE_GROUP_7ec452');
  await page.getByLabel('Cancel adding task').click();
  await expect(page.getByRole('dialog', { name: 'Add task' })).not.toBeVisible();
  // Trigger the SDK upload buffer after the final mutations.
  await page.getByLabel('Todo. Open task list').click();
  const capturedSnapshots = () => page.evaluate(() => window.privacyVerification.events
    .filter(event => event.event === '$snapshot')
    .flatMap(event => event.properties.$snapshot_data as Record<string, unknown>[]));
  await expect.poll(async () => JSON.stringify((await capturedSnapshots()).map(decodeSnapshot)).includes('Add task')).toBe(true);
  await page.evaluate(() => window.privacyVerification.posthog.stopSessionRecording());
  const recording = JSON.stringify((await capturedSnapshots()).map(decodeSnapshot));
  expect(recording.includes('"textContent":"Primary"')).toBe(false);
  for (const privateText of ['PRIVATE_', email, 'Primary planning']) {
    expect(recording.includes(privateText), `Private content must be masked: ${privateText}`).toBe(false);
  }
  for (const label of ['Your Tasks', 'Groups', 'Settings', 'Summary Recipient:', 'Choose a city',
    'Your routes', 'Edit route', 'Route name', 'Next 7 days', 'Calendars', 'All tasks', 'Add task', 'Delete group?']) {
    expect(recording.includes(label), `Application copy should be readable: ${label}`).toBe(true);
  }
});
