import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { makeSignature } from 'better-auth/crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('Visitor lands on the production Daily workspace without the email preview in the main view', async ({
  page
}) => {
  await expect(page.getByRole('heading', { name: 'Task board' })).toHaveCount(0);
  await expect(page.locator('.daily-brand')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Primary navigation' }).getByLabel('Tasks'))
    .toHaveCount(0);
  await expect(
    page.getByRole('complementary', { name: 'Primary navigation' }).getByLabel('Daily context')
  ).toHaveCount(0);
  await expect(page.locator('.daily-visitor')).toHaveText('Visitor preview');
  await expect(page.getByRole('complementary', { name: 'Visitor preview' })).toContainText(
    'Sign in with Google to receive Daily Summaries by email.'
  );
  await expect(page.getByRole('button', { name: /Weather/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Commute/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Calendar/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daily Summary Preview' })).toHaveCount(0);
});

test('Visitor assigns a captured task to a group and urgency with the keyboard', async ({ page }) => {
  await page.getByLabel('New Todo Task').fill('Send revised proposal');
  await page.getByLabel('New Todo Task').press('Enter');

  const placement = page.getByRole('dialog', { name: 'Add task' });
  await expect(placement).toBeVisible();
  await expect(placement.getByText('Ungrouped', { exact: true })).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');

  const ungrouped = page.getByRole('list', { name: 'No Category Todo Tasks' });
  await expect(ungrouped.getByText('Send revised proposal')).toBeVisible();
  await expect(ungrouped.getByLabel('Medium urgency')).toBeVisible();
});

test('Visitor opens all Todo Tasks from the context tile and can delete one', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.getByLabel('New Todo Task').fill('Delete this task');
  await page.getByLabel('New Todo Task').press('Enter');
  await page.getByRole('dialog', { name: 'Add task' }).getByRole('button', { name: 'Confirm adding task' }).click();

  const todoTile = page.locator('[data-summary-section="todo"]');
  await todoTile.getByRole('button', { name: 'Todo. Open task list' }).dblclick();

  const todoDialog = page.getByRole('dialog', { name: 'All tasks' });
  await expect(todoDialog.getByText('Delete this task')).toBeVisible();
  expect(pageErrors).not.toContainEqual(expect.stringContaining('InvalidStateError'));
  await expect(todoDialog.getByRole('button', { name: 'Add Todo Task' })).toHaveCount(0);
  await expect(todoDialog.getByRole('button', { name: 'Delete Delete this task' })).toBeVisible();

  await todoDialog.getByRole('button', { name: 'Delete Delete this task' }).click();
  await expect(todoDialog.getByText('No tasks yet')).toBeVisible();
});

test('Visitor opens focused Weather and Commute configuration from their context tiles', async ({
  page
}) => {
  const weatherTile = page.locator('[data-summary-section="weather"]');
  const weatherToggle = weatherTile.getByRole('button', { name: 'Pause section' });
  await weatherTile.getByRole('button', { name: /Weather/ }).click();
  const weatherDialog = page.getByRole('dialog', { name: 'Choose a city' });
  await expect(weatherDialog).toBeVisible();
  await weatherDialog.getByRole('button', { name: 'Close city picker' }).click();
  await expect(weatherDialog).not.toBeVisible();
  await expect(weatherToggle).toHaveCSS('opacity', '0');

  await page.getByRole('button', { name: /Commute/ }).click();
  await expect(page.getByRole('dialog', { name: 'Your routes' })).toBeVisible();
});

test.describe('mobile context tiles', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('keep section pausing in Settings', async ({ page }) => {
    const weatherTile = page.locator('[data-summary-section="weather"]');
    await expect(weatherTile.locator('.daily-context-tile__toggle')).toHaveCSS('display', 'none');
  });
});

test('Visitor can pause and resume a Summary Section from its context tile', async ({ page }) => {
  const sections = [
    { key: 'weather', label: 'Weather', settingsId: 'weather-section-board' },
    { key: 'commute', label: 'Commute', settingsId: 'commute-section-board' },
    { key: 'calendar', label: 'Calendar', settingsId: 'calendar-section-board' },
    { key: 'todo', label: 'Todo', settingsId: 'todo-section-board' }
  ] as const;

  for (const section of sections) {
    const tile = page.locator(`[data-summary-section="${section.key}"]`);
    const arrow = tile.locator('.daily-context-tile__arrow');
    await expect(tile).toContainText(`${section.label} · Active`);
    await expect.poll(() => arrow.evaluate((element) => getComputedStyle(element).transform))
      .toBe('matrix(1, 0, 0, 1, 0, 0)');
    await tile.hover();
    await expect.poll(() => arrow.evaluate((element) => getComputedStyle(element).transform))
      .toBe('matrix(1, 0, 0, 1, -40, 0)');
    await tile.getByRole('button', { name: 'Pause section' }).click();
    await expect(tile).toContainText(`${section.label} · Paused`);
    await expect(tile.getByRole('button', { name: 'Resume section' }))
      .toHaveAttribute('aria-pressed', 'false');
  }

  await expect.poll(() => page.evaluate(() => {
    const storedSetup = localStorage.getItem('daily.visitorLocalSetup.v2');
    return storedSetup ? JSON.parse(storedSetup).summaryConfiguration.sections : null;
  })).toEqual({ weather: false, commute: false, calendar: false, todo: false });

  await page.reload();

  for (const section of sections) {
    await expect(page.locator(`[data-summary-section="${section.key}"]`))
      .toContainText(`${section.label} · Paused`);
  }

  await page.getByRole('button', { name: 'Open settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  for (const section of sections) {
    await expect(settings.locator(`#${section.settingsId}`)).not.toBeChecked();
  }
  await settings.getByRole('button', { name: 'Close panel' }).click();

  for (const section of sections) {
    const tile = page.locator(`[data-summary-section="${section.key}"]`);
    await tile.hover();
    await tile.getByRole('button', { name: 'Resume section' }).click();
    await expect(tile).toContainText(`${section.label} · Active`);
  }
});

test('secondary destinations stay outside the main view until requested', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Delivery history' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
});

test('the Settings panel closes when the user clicks outside it', async ({ page }) => {
  await page.getByRole('button', { name: 'Open settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();

  const bounds = await settings.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(Math.max(8, bounds!.x - 16), bounds!.y + bounds!.height / 2);

  await expect(settings).toBeHidden();
});

test.describe('new signed-in User time zone', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('uses and persists the browser time zone when no Summary Configuration exists', async ({
    page
  }) => {
    const port = process.env.PLAYWRIGHT_PORT ?? '5173';
    const database = new Database(join(tmpdir(), `daily-playwright-${port}.db`));
    const now = Math.floor(Date.now() / 1000);
    const userId = `timezone-board-user-${crypto.randomUUID()}`;
    const sessionToken = crypto.randomUUID();

    try {
      database.prepare('insert into auth_user values (?, ?, ?, true, null, ?, ?)')
        .run(userId, 'Timezone User', 'timezone@example.com', now, now);
      database.prepare('insert into auth_session values (?, ?, ?, ?, ?, null, null, ?)')
        .run(crypto.randomUUID(), now + 3600, sessionToken, now, now, userId);
      database.prepare(
        'insert into auth_account (id, account_id, provider_id, user_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)'
      ).run(crypto.randomUUID(), `google-${userId}`, 'google', userId, now, now);
      database.prepare('insert into users (id, google_subject, email) values (?, ?, ?)')
        .run(userId, `google-${userId}`, 'timezone@example.com');

      await page.context().addCookies([{
        name: 'better-auth.session_token',
        value: `${sessionToken}.${await makeSignature(
          sessionToken,
          'daily-playwright-auth-secret-at-least-32-characters'
        )}`,
        domain: '127.0.0.1',
        path: '/'
      }]);
      await page.goto('/');

      await expect(page.getByRole('button', { name: /Mail delivery/ })).toContainText(
        'Asia/Tokyo'
      );
      await expect.poll(() =>
        database
          .prepare('select user_time_zone from summary_configurations where user_id = ?')
          .get(userId)
      ).toEqual({ user_time_zone: 'Asia/Tokyo' });
    } finally {
      database.prepare('delete from auth_user where id = ?').run(userId);
      database.prepare('delete from users where id = ?').run(userId);
      database.close();
    }
  });
});

test('connected User sees the week agenda and can change visible Google Calendars', async ({
  page
}) => {
  const port = process.env.PLAYWRIGHT_PORT ?? '5173';
  const database = new Database(join(tmpdir(), `daily-playwright-${port}.db`));
  const now = Math.floor(Date.now() / 1000);
  const userId = `calendar-board-user-${crypto.randomUUID()}`;
  const googleSubject = `google-${userId}`;
  const sessionToken = crypto.randomUUID();

  try {
    database.prepare('insert into auth_user values (?, ?, ?, true, null, ?, ?)')
      .run(userId, 'Calendar User', 'calendar@example.com', now, now);
    database.prepare('insert into auth_session values (?, ?, ?, ?, ?, null, null, ?)')
      .run(crypto.randomUUID(), now + 3600, sessionToken, now, now, userId);
    database.prepare(`insert into auth_account (
      id, account_id, provider_id, user_id, access_token, access_token_expires_at, scope, created_at, updated_at
    ) values (?, ?, 'google', ?, 'fixture-access-token', ?, ?, ?, ?)`).run(
      crypto.randomUUID(),
      googleSubject,
      userId,
      now + 3600,
      'openid email profile https://www.googleapis.com/auth/calendar.readonly',
      now,
      now
    );
    database.prepare('insert into users (id, google_subject, email) values (?, ?, ?)')
      .run(userId, googleSubject, 'calendar@example.com');
    database.prepare('insert into summary_configurations (id, user_id) values (?, ?)')
      .run(crypto.randomUUID(), userId);
    database.prepare(`insert into calendar_connections (
      id, user_id, connection_status, provider_account_id, granted_scopes,
      access_token_available, refresh_token_available, access_token_expires_at, updated_at
    ) values (?, ?, 'connected', ?, ?, true, false, ?, ?)`).run(
      crypto.randomUUID(),
      userId,
      googleSubject,
      JSON.stringify(['https://www.googleapis.com/auth/calendar.readonly']),
      now + 3600,
      new Date().toISOString()
    );
    database.prepare(`insert into selected_calendars (
      id, user_id, calendar_id, position, summary, background_color, \`primary\`
    ) values (?, ?, 'primary', 0, 'Primary', '#3f51b5', true)`).run(
      crypto.randomUUID(),
      userId
    );

    await page.context().addCookies([{
      name: 'better-auth.session_token',
      value: `${sessionToken}.${await makeSignature(
        sessionToken,
        'daily-playwright-auth-secret-at-least-32-characters'
      )}`,
      domain: '127.0.0.1',
      path: '/'
    }]);
    await page.goto('/');

    await page.getByRole('button', { name: /Calendar\. \d+ events/ }).click();
    const agenda = page.getByRole('dialog', { name: 'Next 7 days' });
    await expect(agenda.getByText('Primary planning')).toBeVisible();
    await agenda.getByRole('button', { name: 'Calendar settings' }).click();

    const settings = page.getByRole('dialog', { name: 'Calendars' });
    await settings.locator('#selected-calendar-work').check();
    await expect(settings.getByText('Selected Calendars saved to your account.')).toBeVisible();

    await settings.getByRole('button', { name: 'Back to events' }).click();
    await expect(page.getByRole('dialog', { name: 'Next 7 days' }).getByText('Work review'))
      .toBeVisible();
  } finally {
    database.prepare('delete from auth_user where id = ?').run(userId);
    database.prepare('delete from users where id = ?').run(userId);
    database.close();
  }
});

test('signed-in User can inspect Delivery History and irreversibly delete the account', async ({
  page
}) => {
  const port = process.env.PLAYWRIGHT_PORT ?? '5173';
  const database = new Database(join(tmpdir(), `daily-playwright-${port}.db`));
  const now = Math.floor(Date.now() / 1000);
  const nowIso = new Date().toISOString();
  const userId = `account-board-user-${crypto.randomUUID()}`;
  const sessionToken = crypto.randomUUID();

  try {
    database.prepare('insert into auth_user values (?, ?, ?, true, null, ?, ?)')
      .run(userId, 'Account User', 'account@example.com', now, now);
    database.prepare('insert into auth_session values (?, ?, ?, ?, ?, null, null, ?)')
      .run(crypto.randomUUID(), now + 3600, sessionToken, now, now, userId);
    database.prepare(
      'insert into auth_account (id, account_id, provider_id, user_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), `google-${userId}`, 'google', userId, now, now);
    database.prepare('insert into users (id, google_subject, email) values (?, ?, ?)')
      .run(userId, `google-${userId}`, 'account@example.com');
    database.prepare('insert into summary_configurations (id, user_id) values (?, ?)')
      .run(crypto.randomUUID(), userId);
    database.prepare(`insert into delivery_records (
      id, user_id, attempt_type, requested_at, completed_at, delivery_status,
      provider_name, provider_message_id, provider_status_metadata, error_classification,
      scheduled_at, attempt_count, last_attempt_at, next_retry_at, claim_expires_at
    ) values (?, ?, 'scheduled', ?, ?, 'sent', 'private-provider', 'private-message', 'private-payload',
      null, ?, 1, ?, null, null)`).run(
      crypto.randomUUID(),
      userId,
      nowIso,
      nowIso,
      nowIso,
      nowIso
    );

    await page.context().addCookies([{
      name: 'better-auth.session_token',
      value: `${sessionToken}.${await makeSignature(
        sessionToken,
        'daily-playwright-auth-secret-at-least-32-characters'
      )}`,
      domain: '127.0.0.1',
      path: '/'
    }]);
    await page.goto('/');
    await expect(page.getByLabel('New Todo Task')).toBeEnabled();
    await expect(page.getByText('Todo state saved to your account.')).toHaveCount(0);

    await page.getByRole('button', { name: 'Open delivery history' }).click();
    const history = page.getByRole('dialog', { name: 'Delivery history' });
    await expect(history).toBeVisible();
    await expect(history.getByText('Scheduled Daily Summary')).toBeVisible();
    await expect(history.getByText('Sent', { exact: true })).toBeVisible();
    await expect(history).not.toContainText('private-message');
    await history.getByRole('button', { name: 'Close panel' }).click();

    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.getByLabel('Enter DELETE MY ACCOUNT exactly to confirm')
      .fill('DELETE MY ACCOUNT');
    await page.getByRole('button', { name: 'Permanently delete my account' }).click();

  await expect(page.locator('.daily-visitor')).toHaveText('Visitor preview');
    expect(database.prepare('select count(*) as count from users where id = ?').get(userId))
      .toEqual({ count: 0 });
  } finally {
    database.prepare('delete from auth_user where id = ?').run(userId);
    database.prepare('delete from users where id = ?').run(userId);
    database.close();
  }
});
