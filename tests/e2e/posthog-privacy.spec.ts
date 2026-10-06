import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('preserves replay presentation while masking private snapshots, mutations, and autocapture', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('daily.onboarding.v1', 'seen'));
  await page.goto('/');
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  let resource: string | undefined;
  await expect.poll(async () => {
    resource = await page.evaluate(() => performance.getEntriesByType('resource').find(entry => entry.name.includes('/.vite/deps/posthog-js.js'))?.name);
    return resource;
  }).toBeTruthy();
  await page.addScriptTag({ type: 'module', content:
    // Only bypass automation detection; keep the application's capture and masking settings.
    'import posthog from ' + JSON.stringify(resource) + '; posthog.set_config({opt_out_useragent_filter:true}); window.privacyVerification={posthog,events:[],snapshots:[]}; posthog.on("eventCaptured",event=>window.privacyVerification.events.push(event));'
  });
  await page.addScriptTag({ path: resolve('node_modules/posthog-js/dist/recorder.js') });
  const task = 'PRIVATE_TODO_7ec452';
  await page.getByLabel('New Todo Task').fill(task);
  await page.getByLabel('New Todo Task').press('Enter');
  await page.getByRole('dialog', { name: 'Add task' }).getByRole('button', { name: 'Confirm adding task' }).click();
  const snapshots = await page.evaluate(async () => {
    const probe = (window as unknown as { privacyVerification: {
      posthog: { config: { session_recording: Record<string, unknown> } };
      snapshots: unknown[];
    } }).privacyVerification;
    const record = (window as unknown as { __PosthogExtensions__: { rrweb: {
      record(options: Record<string, unknown>): (() => void) | undefined;
    } } }).__PosthogExtensions__.rrweb.record;
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
    const stop = record({ ...probe.posthog.config.session_recording, emit: (event: unknown) => probe.snapshots.push(event) });
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
    await new Promise(resolve => setTimeout(resolve, 50));
    stop?.();
    section.remove();
    stylesheet.remove();
    return probe.snapshots;
  });
  expect(snapshots).toEqual(expect.arrayContaining([expect.objectContaining({ type: 2 }), expect.objectContaining({ type: 3 })]));
  expect(JSON.stringify(snapshots).includes('PRIVATE_')).toBe(false);
  const recording = JSON.stringify(snapshots);
  expect(recording).toContain('replay-layout-probe');
  expect(recording).toContain('display: grid');
  expect(recording).toContain('#123456');
  expect(recording).toContain('replay-layout-mutated');
  expect(recording).toContain('24px');
  expect(recording).toContain('M 0 0 L 24 24');
  expect(recording).toContain('daily-mark.svg');
  expect(recording).toMatch(/\"href\":\"[^\"]+\.css/);
  await page.getByRole('checkbox', { name: `Complete ${task}`, exact: true }).click();
  const events = await page.evaluate(() => (window as unknown as { privacyVerification: { events: Array<{ event: string }> } }).privacyVerification.events);
  expect(events.map(event => event.event)).toContain('todo_task_created');
  expect(events.map(event => event.event)).toContain('todo_task_completed');
  expect(events.map(event => event.event)).not.toContain('$autocapture');
  expect(JSON.stringify(events)).not.toContain(task);
});
