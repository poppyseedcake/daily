import { chromium, expect } from '@playwright/test';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDemoUser } from './demo-user.mjs';

const applicationURL = process.env.DAILY_DOCS_URL ?? 'http://127.0.0.1:5174';
const localHost = new URL(applicationURL).hostname;
if (!['localhost', '127.0.0.1'].includes(localHost)) throw new Error('Record only the local demo server.');
const project = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${project}out/recordings`, { recursive: true });
const demo = await createDemoUser({ applicationURL, databaseURL: process.env.DAILY_DOCS_DATABASE_URL, authSecret: process.env.DAILY_DOCS_AUTH_SECRET });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'Europe/Warsaw',
  recordVideo: { dir: `${project}out/recordings`, size: { width: 1280, height: 800 } } });
await context.addCookies([demo.cookie]);
await context.route(/127\.0\.0\.1:9(?:\/|$)|posthog\.com/, route => route.abort());
await context.route('**/weather-location-search?**', route => route.fulfill({ json: { outcome: 'found', locations: [{ label: 'Warsaw, Poland', latitude: 52.2297, longitude: 21.0122 }] } }));
await context.route('**/commute-point-search?**', route => {
  const destination = new URL(route.request().url()).searchParams.get('q')?.toLowerCase().includes('park');
  return route.fulfill({ json: { outcome: 'available', suggestions: [{ placeId: destination ? 'demo-office' : 'demo-home', label: destination ? 'Park Avenue, Warsaw' : 'Maple Street, Warsaw' }] } });
});
await context.route('**/commute-point-selection', route => {
  const destination = route.request().postDataJSON().placeId === 'demo-office';
  return route.fulfill({ json: { outcome: 'available', point: { label: destination ? 'Park Avenue, Warsaw' : 'Maple Street, Warsaw', latitude: destination ? 52.24 : 52.22, longitude: destination ? 21.02 : 21.01 } } });
});
await context.route('**/commute-estimate', route => route.fulfill({ json: { outcome: 'available', estimate: { durationMinutes: 26, staticDurationMinutes: 24 } } }));
await context.addInitScript(() => {
  localStorage.setItem('daily.onboarding.v1', 'seen');
  const mount = () => {
    const pointer = document.createElement('div');
    pointer.setAttribute('aria-hidden', 'true');
    pointer.style.cssText = 'position:fixed;left:0;top:0;width:24px;height:30px;z-index:2147483647;pointer-events:none;transform:translate(-50px,-50px)';
    pointer.innerHTML = '<svg viewBox="0 0 24 30"><path d="M3 2v22l6-6 5 10 4-2-5-10h8Z" fill="#172d52" stroke="white" stroke-width="2"/></svg>';
    document.documentElement.append(pointer);
    document.addEventListener('pointermove', event => {
      const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
      (dialog ?? document.documentElement).append(pointer);
      pointer.style.transform = `translate(${event.clientX}px,${event.clientY}px)`;
    }, true);
    document.addEventListener('pointerdown', () => { pointer.style.filter = 'drop-shadow(0 0 5px #618046)'; }, true);
    document.addEventListener('pointerup', () => { pointer.style.filter = ''; }, true);
  };
  document.addEventListener('DOMContentLoaded', mount, { once: true });
});
const recordingEpoch = Date.now();
const page = await context.newPage();
const video = page.video();
const chapters = [];
const pause = ms => page.waitForTimeout(ms);
const mark = title => {
  console.log(title);
  chapters.push({ title, milliseconds: Date.now() - recordingEpoch });
};
const click = async locator => {
  await locator.scrollIntoViewIfNeeded();
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error('Recording target is not visible.');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 14 });
  await pause(180);
  await page.mouse.down(); await pause(100); await page.mouse.up();
  await pause(300);
};
const type = async (locator, text) => { await click(locator); await locator.pressSequentially(text, { delay: 90 }); await pause(400); };

try {
  await page.goto(applicationURL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('New Todo Task', { exact: true })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  mark('Add a task and choose its group');
  await pause(900);
  await click(page.getByRole('button', { name: 'New group', exact: true }));
  await type(page.getByLabel('New Todo Category'), 'Work');
  await click(page.getByRole('button', { name: 'Add Todo Category', exact: true }));
  await type(page.getByLabel('New Todo Task', { exact: true }), 'Prepare the project proposal');
  await click(page.getByRole('button', { name: 'Add Todo Task', exact: true }));
  await click(page.getByRole('button', { name: 'Next group', exact: true }));
  await click(page.getByRole('button', { name: 'Next urgency', exact: true }));
  await pause(700);
  await click(page.getByRole('button', { name: 'Confirm adding task', exact: true }));
  await expect(page.getByText('Prepare the project proposal', { exact: true })).toBeVisible();
  await pause(800);

  mark('Add a driving route and choose its days');
  await click(page.getByRole('button', { name: 'Commute. 0 routes', exact: true }));
  await click(page.getByRole('button', { name: 'Add route', exact: true }));
  await type(page.getByLabel('Route Name', { exact: true }), 'Office');
  await type(page.getByLabel('Commute Origin Search', { exact: true }), 'Maple Street');
  await click(page.getByRole('option', { name: 'Select Maple Street, Warsaw', exact: true }));
  await type(page.getByLabel('Commute Destination Search', { exact: true }), 'Park Avenue');
  await click(page.getByRole('option', { name: 'Select Park Avenue, Warsaw', exact: true }));
  await click(page.getByRole('button', { name: 'Friday route day', exact: true }));
  await pause(700);
  await click(page.getByRole('button', { name: 'Save route', exact: true }));
  await expect(page.getByRole('dialog', { name: 'Your routes', exact: true }).getByText('Office', { exact: true })).toBeVisible();
  await pause(900);
  await click(page.getByRole('button', { name: 'Close commute routes', exact: true }));

  mark('Review the week and select a calendar');
  await click(page.getByRole('button', { name: /Calendar\. \d+ events/ }));
  await expect(page.getByRole('dialog', { name: 'Next 7 days', exact: true }).getByText('Primary planning', { exact: true })).toBeVisible();
  await pause(1500);
  await click(page.getByRole('button', { name: 'Calendar settings', exact: true }));
  await click(page.locator('label[for="selected-calendar-work"]'));
  await expect(page.getByText('Selected Calendars saved to your account.', { exact: true })).toBeVisible();
  await pause(800);
  await click(page.getByRole('button', { name: 'Back to events', exact: true }));
  await expect(page.getByRole('dialog', { name: 'Next 7 days', exact: true }).getByText('Work review', { exact: true })).toBeVisible();
  await pause(1800);
  await click(page.getByRole('button', { name: 'Close calendar', exact: true }));

  mark('Choose the city for your weather forecast');
  await click(page.getByRole('button', { name: 'Weather. Choose a city', exact: true }));
  await type(page.getByLabel('City Search', { exact: true }), 'Warsaw');
  await click(page.getByRole('listbox', { name: 'Weather Location search results', exact: true }).getByRole('option'));
  await expect(page.getByRole('button', { name: 'Weather. Warsaw, Poland', exact: true })).toBeVisible();
  await pause(1100);

  mark('Set the daily delivery time and time zone');
  await click(page.getByRole('button', { name: /^Mail delivery\./ }));
  await click(page.getByRole('button', { name: 'Increase hours', exact: true }));
  for (let index = 0; index < 5; index++) await click(page.getByRole('button', { name: 'Increase minutes', exact: true }));
  await click(page.getByRole('button', { name: 'Edit time zone', exact: true }));
  await page.getByLabel('User Time Zone', { exact: true }).selectOption('Europe/Warsaw');
  await pause(900);
  await click(page.getByRole('button', { name: 'Save delivery time', exact: true }));
  await expect(page.getByRole('button', { name: /^Mail delivery\./ })).toContainText('08:05');
  await pause(2400);
  const end = Date.now() - recordingEpoch;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Prepare the project proposal', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Commute. 1 route', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weather. Warsaw, Poland', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Mail delivery\./ })).toContainText('08:05');
  demo.verify();
  await context.close();
  await copyFile(await video.path(), `${project}public/daily-walkthrough.webm`);
  const start = chapters[0].milliseconds;
  const fps = 30;
  await writeFile(`${project}src/walkthrough.json`, JSON.stringify({ fps, trimBeforeFrames: Math.round(start / 1000 * fps),
    durationInFrames: Math.round((end - start) / 1000 * fps),
    chapters: chapters.map(chapter => ({ title: chapter.title, from: Math.round((chapter.milliseconds - start) / 1000 * fps) })) }, null, 2) + '\n');
  console.log(`Recorded ${((end - start) / 1000).toFixed(1)} seconds. All five flows and saved settings verified.`);
} catch (error) {
  await page.screenshot({ path: `${project}out/recording-failure.png` });
  console.log((await page.locator('body').innerText()).slice(-2500));
  throw error;
} finally {
  await browser.close();
  demo.cleanup();
}
