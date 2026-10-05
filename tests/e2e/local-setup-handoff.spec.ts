import { expect, test as base } from '@playwright/test';
import Database from 'better-sqlite3';
import { makeSignature } from 'better-auth/crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultLocalSetup } from '../../src/lib/localSetup';

const visitorSetup = () => ({
  ...createDefaultLocalSetup(),
  todoTasks: [{ id: 'visitor-task', title: 'Visitor task', categoryId: null, urgency: 'high' as const, position: 1 }],
  nextTodoId: 10,
  commuteRoutes: [{
    id: 'visitor-route',
    name: 'Visitor office',
    origin: { label: 'Home', latitude: 52.2297, longitude: 21.0122 },
    destination: { label: 'Office', latitude: 52.2318, longitude: 21.0067 },
    days: ['monday' as const],
    enabled: true
  }]
});

const test = base.extend<{ signedInUser: { database: Database.Database; userId: string } }>({
  signedInUser: async ({ page }, use) => {
    const port = process.env.PLAYWRIGHT_PORT ?? '5173';
    const database = new Database(join(tmpdir(), `daily-playwright-${port}.db`));
    database.pragma('foreign_keys = ON');
    const now = Math.floor(Date.now() / 1000);
    const userId = `handoff-user-${crypto.randomUUID()}`;
    const email = `${userId}@example.com`;
    const token = crypto.randomUUID();
    try {
      database.prepare('insert into auth_user values (?, ?, ?, true, null, ?, ?)')
        .run(userId, 'Handoff User', email, now, now);
      database.prepare('insert into auth_session values (?, ?, ?, ?, ?, null, null, ?)')
        .run(crypto.randomUUID(), now + 3600, token, now, now, userId);
      database.prepare('insert into auth_account (id, account_id, provider_id, user_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), `google-${userId}`, 'google', userId, now, now);
      database.prepare('insert into users (id, google_subject, email, terms_version, terms_accepted_at) values (?, ?, ?, ?, ?)')
        .run(userId, `google-${userId}`, email, '2026-09-21', '2026-09-21T00:00:00.000Z');
      await page.context().addCookies([{
        name: 'better-auth.session_token',
        value: `${token}.${await makeSignature(token, 'daily-playwright-auth-secret-at-least-32-characters')}`,
        domain: '127.0.0.1',
        path: '/'
      }]);
      await page.addInitScript((setup) => {
        localStorage.setItem('daily.onboarding.v1', 'seen');
        localStorage.setItem('daily.visitorLocalSetup.v3', JSON.stringify(setup));
      }, visitorSetup());
      await use({ database, userId });
    } finally {
      database.prepare('delete from users where id = ?').run(userId);
      database.prepare('delete from auth_user where id = ?').run(userId);
      database.close();
    }
  }
});

test('Visitor hydration restores existing Local Setup without writing to browser storage', async ({ page }) => {
  await page.addInitScript((setup) => {
    localStorage.setItem('daily.onboarding.v1', 'seen');
    localStorage.setItem('daily.visitorLocalSetup.v3', JSON.stringify(setup));
    const writes: string[] = [];
    (window as Window & { handoffWrites?: string[] }).handoffWrites = writes;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'daily.visitorLocalSetup.v3') writes.push(value);
      setItem.call(this, key, value);
    };
  }, visitorSetup());
  await page.goto('/');
  await expect(page.getByRole('list', { name: 'No Category Todo Tasks' }).getByText('Visitor task')).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { handoffWrites?: string[] }).handoffWrites)).toEqual([]);
});

test('User can delete an imported Commute Route before a manual refresh', async ({ page, signedInUser }) => {
  await page.goto('/?localSetupImport=1');
  await page.getByRole('button', { name: 'Commute. 1 route' }).click();
  const routes = page.getByRole('dialog', { name: 'Your routes' });
  await expect(routes.getByText('Visitor office', { exact: true })).toBeVisible();
  await routes.getByRole('button', { name: /Visitor office/ }).click();
  await page.getByRole('dialog', { name: 'Edit route' }).getByRole('button', { name: 'Delete Visitor office' }).click();
  await expect(routes).toBeVisible();
  await expect(routes.getByText('Visitor office', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Commute. 0 routes' })).toBeEnabled();
});

test('User sees preserved Commute Routes when the remaining Local Setup is imported', async ({ page, signedInUser: { database, userId } }) => {
  database.prepare(`insert into commute_routes (
    id, user_id, name, origin_label, origin_latitude, origin_longitude,
    destination_label, destination_latitude, destination_longitude, days, enabled, position
  ) values (?, ?, 'Saved office', 'Home', 52.2297, 21.0122, 'Saved office address', 52.2318, 21.0067, '["tuesday"]', 1, 1)`)
    .run(`saved-route-${userId}`, userId);
  await page.goto('/?localSetupImport=1');
  await expect(page.getByRole('list', { name: 'No Category Todo Tasks' }).getByText('Visitor task')).toBeVisible();
  await page.getByRole('button', { name: 'Commute. 1 route' }).click();
  const routes = page.getByRole('dialog', { name: 'Your routes' });
  await expect(routes.getByText('Saved office', { exact: true })).toBeVisible();
  await expect(routes.getByText('Visitor office', { exact: true })).toHaveCount(0);
});

test('handoff initializes saved baselines without writes and keeps imported Todo Tasks after the next edit', async ({ page, signedInUser }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && ['/todo-state', '/summary-configuration', '/saved-weather-cities', '/saved-commute-addresses'].includes(new URL(request.url()).pathname)) {
      writes.push(new URL(request.url()).pathname);
    }
  });
  await page.goto('/?localSetupImport=1&other=keep#todo-section');
  const tasks = page.getByRole('list', { name: 'No Category Todo Tasks' });
  await expect(tasks.getByText('Visitor task')).toBeVisible();
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await expect(page).toHaveURL(/\?other=keep#todo-section$/);
  expect(writes).toEqual([]);
  const saved = page.waitForResponse((response) => new URL(response.url()).pathname === '/todo-state' && response.request().method() === 'PUT');
  await page.getByLabel('New Todo Task').fill('After handoff');
  await page.getByLabel('New Todo Task').press('Enter');
  await page.getByRole('dialog', { name: 'Add task' }).getByRole('button', { name: 'Confirm adding task' }).click();
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(tasks.getByText('Visitor task')).toBeVisible();
  await expect(tasks.getByText('After handoff')).toBeVisible();
});

test('User editing stays blocked while Local Setup import is pending', async ({ page, signedInUser }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/local-setup-import', async (route) => {
    await pending;
    await route.continue();
  });
  const importing = page.waitForRequest((request) => new URL(request.url()).pathname === '/local-setup-import');
  try {
    await page.goto('/?localSetupImport=1');
    await importing;
    const newGroup = page.getByRole('button', { name: 'New group', includeHidden: true });
    await newGroup.evaluate((button: HTMLButtonElement) => button.focus());
    await expect(newGroup).not.toBeFocused();
    await expect(page.locator('[aria-label="New Todo Task"]')).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await expect(page.getByRole('list', { name: 'No Category Todo Tasks' }).getByText('Visitor task')).toBeVisible();
});

test('User can sign out while Local Setup import remains pending', async ({ page, signedInUser }) => {
  await page.route('**/local-setup-import', () => {});
  const importing = page.waitForRequest((request) => new URL(request.url()).pathname === '/local-setup-import');
  await page.goto('/?localSetupImport=1');
  await importing;

  const accountMenu = page.getByLabel('Open account menu');
  await accountMenu.evaluate((control: HTMLElement) => control.focus());
  await expect(accountMenu).toBeFocused();
  await accountMenu.press('Enter');
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeDisabled();
  await expect(page.locator('[aria-label="New Todo Task"]')).toBeDisabled();

  const signedOut = page.waitForResponse((response) => new URL(response.url()).pathname === '/auth/sign-out' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  expect((await signedOut).status()).toBe(303);
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Sign in with Google', exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Open account menu')).toHaveCount(0);
});

test('Administrator stays in the Admin Panel when an import response arrives after leaving the workspace', async ({ page, signedInUser: { database, userId } }) => {
  database.prepare('update auth_user set email = ? where id = ?').run('handoff-admin@example.com', userId);
  database.prepare('update users set email = ? where id = ?').run('handoff-admin@example.com', userId);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/local-setup-import', async (route) => {
    const response = await route.fetch();
    expect(await response.json()).toMatchObject({ outcome: 'imported' });
    await pending;
    await route.fulfill({ response });
  });
  const importing = page.waitForRequest((request) => new URL(request.url()).pathname === '/local-setup-import');
  try {
    await page.goto('/?localSetupImport=1');
    await importing;
    await page.evaluate(() => { document.documentElement.dataset.handoffDocument = 'original'; });
    await page.getByLabel('Open account menu').click();
    await page.getByRole('link', { name: 'Admin Panel', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Admin Panel', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-handoff-document', 'original');

    const imported = page.waitForResponse((response) => new URL(response.url()).pathname === '/local-setup-import');
    release();
    const response = await imported;
    expect(response.ok()).toBe(true);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL('/admin');
    await expect(page.getByRole('heading', { name: 'Admin Panel', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-handoff-document', 'original');
  } finally {
    release();
  }
});
