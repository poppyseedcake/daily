import { chromium } from '@playwright/test';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const images = fileURLToPath(new URL('../../images/', import.meta.url));
const assets = fileURLToPath(new URL('../public/', import.meta.url));
await mkdir(images, { recursive: true });
await mkdir(assets, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Warsaw' });
await context.route(/127\.0\.0\.1:9|posthog\.com/, route => route.abort());
const page = await context.newPage();
const capture = async (name, fullPage = false) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(images, name), animations: 'disabled', fullPage });
  await copyFile(resolve(images, name), resolve(assets, name));
};

try {
  await page.goto(process.env.DAILY_DOCS_URL ?? 'http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show me', exact: true }).waitFor();
  await capture('daily-introduction.png');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.getByLabel('New Todo Task', { exact: true }).waitFor();
  // Fictional Local Setup in this isolated browser context. No User data or email delivery.
  await page.evaluate(() => {
    localStorage.setItem('daily.visitorLocalSetup.v3', JSON.stringify({
      version: 3,
      summaryConfiguration: { summaryTime: '07:00', userTimeZone: 'Europe/Warsaw', summaryDeliveryEnabled: true,
        sectionPauses: { weather: false, commute: false, calendar: false, todo: false } },
      weatherLocation: null, savedWeatherCities: [], savedCommuteAddresses: [], commuteRoutes: [],
      todoCategories: [
        { id: 'docs-work', name: 'Work', position: 1 },
        { id: 'docs-home', name: 'Home', position: 2 },
        { id: 'docs-personal', name: 'Personal', position: 3 }
      ],
      todoTasks: [
        { id: 'docs-1', title: 'Send the project proposal', categoryId: 'docs-work', urgency: 'high', position: 1 },
        { id: 'docs-2', title: 'Review the budget', categoryId: 'docs-work', urgency: 'medium', position: 2 },
        { id: 'docs-3', title: 'Water the plants', categoryId: 'docs-home', urgency: 'low', position: 1 },
        { id: 'docs-4', title: 'Order a desk lamp', categoryId: 'docs-home', urgency: 'medium', position: 2 },
        { id: 'docs-5', title: 'Book a dentist visit', categoryId: 'docs-personal', urgency: 'medium', position: 1 },
        { id: 'docs-6', title: 'Call the bike repair shop', categoryId: null, urgency: 'low', position: 1 }
      ], nextTodoId: 20
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Send the project proposal', { exact: true }).waitFor();
  await capture('daily-workspace.png');
  await page.getByLabel('New Todo Task', { exact: true }).fill('Prepare the meeting notes');
  await page.getByRole('button', { name: 'Add Todo Task', exact: true }).click();
  await page.getByRole('dialog', { name: 'Add task', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next group', exact: true }).click();
  await page.getByRole('button', { name: 'Next urgency', exact: true }).click();
  await capture('daily-add-task.png');
  await page.getByRole('button', { name: 'Confirm adding task', exact: true }).click();
  await page.getByText('Prepare the meeting notes', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^Mail delivery\./ }).click();
  await page.getByRole('dialog', { name: 'Delivery time', exact: true }).waitFor();
  await capture('daily-delivery-time.png');
  await page.getByRole('button', { name: 'Cancel delivery time', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('daily-mobile.png', true);
  console.log('Saved five screenshots with fictional Visitor data. Task creation verified.');
} finally {
  await browser.close();
}
