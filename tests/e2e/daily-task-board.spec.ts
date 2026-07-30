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

test('Visitor lands on the production Task Board without the email preview in the main view', async ({
  page
}) => {
  await expect(page.getByRole('heading', { name: 'Task board' })).toBeVisible();
  await expect(page.getByText('Visitor · local setup')).toBeVisible();
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

test('Visitor opens focused Weather and Commute configuration from their context tiles', async ({
  page
}) => {
  await page.getByRole('button', { name: /Weather/ }).click();
  await expect(page.getByRole('dialog', { name: 'Choose a city' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /Commute/ }).click();
  await expect(page.getByRole('dialog', { name: 'Your routes' })).toBeVisible();
});

test('secondary destinations stay outside the main view until requested', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Delivery history' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
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

      await expect(page.getByRole('button', { name: /Summary delivery/ })).toContainText(
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

    await expect(page.getByText('Visitor · local setup')).toBeVisible();
    expect(database.prepare('select count(*) as count from users where id = ?').get(userId))
      .toEqual({ count: 0 });
  } finally {
    database.prepare('delete from auth_user where id = ?').run(userId);
    database.prepare('delete from users where id = ?').run(userId);
    database.close();
  }
});
