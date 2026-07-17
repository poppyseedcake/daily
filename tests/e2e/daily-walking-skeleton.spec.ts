import { expect, test, type Locator, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { makeSignature } from 'better-auth/crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tabUntilDropTargetActive = async (
  page: Page,
  target: Locator,
  options: { direction?: 'forward' | 'backward'; maxTabs?: number } = {}
) => {
  const direction = options.direction ?? 'forward';
  const maxTabs = options.maxTabs ?? 20;
  const key = direction === 'forward' ? 'Tab' : 'Shift+Tab';

  for (let index = 0; index < maxTabs; index += 1) {
    if (
      await target.evaluate(
        (element) =>
          element.getAttribute('aria-describedby') === 'dnd-zone-active' &&
          element.contains(document.activeElement)
      )
    ) {
      await expect(target).toHaveAttribute('aria-describedby', 'dnd-zone-active');
      return;
    }

    await page.keyboard.press(key);
  }

  await expect(target).toHaveAttribute('aria-describedby', 'dnd-zone-active');
};

const dragTodoHandleToTarget = async ({
  page,
  sourceHandle,
  target,
  targetPosition
}: {
  page: Page;
  sourceHandle: Locator;
  target: Locator;
  targetPosition?: { x: number; y: number };
}) => {
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await target.boundingBox();

  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  if (!sourceBox || !targetBox) {
    return;
  }

  await sourceHandle.dragTo(target, {
    force: true,
    targetPosition: targetPosition ?? {
      x: targetBox.width / 2,
      y: targetBox.height / 2
    }
  });
};

const localDateForTimeZone = (timeZone: string) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

const stubOpenMeteoForecast = async (page: Page) => {
  await page.route('https://api.open-meteo.com/v1/forecast?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        daily: {
          time: [localDateForTimeZone('Europe/Warsaw')],
          weather_code: [61],
          temperature_2m_min: [12],
          temperature_2m_max: [19],
          precipitation_probability_max: [80]
        }
      })
    });
  });
};

test('Selected Calendar changes update the signed-in User preview without a page reload', async ({ page }) => {
  const port = process.env.PLAYWRIGHT_PORT ?? '5173';
  const database = new Database(join(tmpdir(), `daily-playwright-${port}.db`));
  const now = Math.floor(Date.now() / 1000);
  const userId = `calendar-preview-user-${crypto.randomUUID()}`;
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
    ) values (?, ?, 'primary', 0, 'Primary', '#3f51b5', true)`).run(crypto.randomUUID(), userId);

    await page.context().addCookies([{
      name: 'better-auth.session_token',
      value: `${sessionToken}.${await makeSignature(sessionToken, 'daily-playwright-auth-secret-at-least-32-characters')}`,
      domain: '127.0.0.1', path: '/'
    }]);
    await page.goto('/');
    await expect(page.getByText('Primary planning')).toBeVisible();
    await expect(page.getByText('Work review')).toHaveCount(0);

    await page.locator('#selected-calendar-work').check();

    await expect(page.getByText('Selected Calendars saved to your account.')).toBeVisible();
    await expect(page.getByText('Work review')).toBeVisible();
  } finally {
    database.prepare('delete from auth_user where id = ?').run(userId);
    database.prepare('delete from users where id = ?').run(userId);
    database.close();
  }
});

test('signed-in User irreversibly deletes the account and returns to Visitor mode', async ({ page }) => {
  const port = process.env.PLAYWRIGHT_PORT ?? '5173';
  const database = new Database(join(tmpdir(), `daily-playwright-${port}.db`));
  const now = Math.floor(Date.now() / 1000);
  const userId = `deletion-user-${crypto.randomUUID()}`;
  const sessionToken = crypto.randomUUID();

  try {
    database.prepare('insert into auth_user values (?, ?, ?, true, null, ?, ?)')
      .run(userId, 'Deletion User', 'deletion@example.com', now, now);
    database.prepare('insert into auth_session values (?, ?, ?, ?, ?, null, null, ?)')
      .run(crypto.randomUUID(), now + 3600, sessionToken, now, now, userId);
    database.prepare('insert into auth_account (id, account_id, provider_id, user_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), `google-${userId}`, 'google', userId, now, now);
    database.prepare('insert into users (id, google_subject, email) values (?, ?, ?)')
      .run(userId, `google-${userId}`, 'deletion@example.com');
    database.prepare('insert into summary_configurations (id, user_id) values (?, ?)')
      .run(crypto.randomUUID(), userId);

    await page.context().addCookies([{
      name: 'better-auth.session_token',
      value: `${sessionToken}.${await makeSignature(sessionToken, 'daily-playwright-auth-secret-at-least-32-characters')}`,
      domain: '127.0.0.1', path: '/'
    }]);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Delete Daily account' })).toBeVisible();
    await page.getByLabel('Enter DELETE MY ACCOUNT exactly to confirm').fill('DELETE MY ACCOUNT');
    await page.getByRole('button', { name: 'Permanently delete my account' }).click();

    await expect(page.getByText('Your Daily account and locally held User data were deleted.')).toBeVisible();
    await expect(page.getByText('Visitor mode', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Visitor mode', { exact: true })).toBeVisible();
    expect(database.prepare('select count(*) as count from users where id = ?').get(userId)).toEqual({ count: 0 });
    expect(database.prepare('select count(*) as count from auth_user where id = ?').get(userId)).toEqual({ count: 0 });
    expect(database.prepare('select count(*) as count from auth_session where user_id = ?').get(userId)).toEqual({ count: 0 });
    expect(database.prepare('select count(*) as count from auth_account where user_id = ?').get(userId)).toEqual({ count: 0 });
    expect(database.prepare('select count(*) as count from summary_configurations where user_id = ?').get(userId)).toEqual({ count: 0 });
  } finally {
    database.prepare('delete from auth_user where id = ?').run(userId);
    database.prepare('delete from users where id = ?').run(userId);
    database.close();
  }
});

test('signed-in User sees recent Scheduled and Test Delivery Records without private operational data', async ({
  page
}) => {
  const port = process.env.PLAYWRIGHT_PORT ?? '5173';
  const database = new Database(join(tmpdir(), `daily-playwright-${port}.db`));

  const now = new Date();
  const secondsSinceEpoch = Math.floor(now.getTime() / 1000);
  const userId = `delivery-history-user-${crypto.randomUUID()}`;
  const otherUserId = `delivery-history-other-${crypto.randomUUID()}`;
  const sessionToken = crypto.randomUUID();
  const atDaysAgo = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const insertDeliveryRecordStatement = database.prepare(`
    insert into delivery_records (
      id, user_id, attempt_type, requested_at, completed_at, delivery_status,
      provider_name, provider_message_id, provider_status_metadata, error_classification,
      scheduled_at, attempt_count, last_attempt_at, next_retry_at, claim_expires_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDeliveryRecord = (record: {
    userId: string;
    attemptType: 'test' | 'scheduled';
    requestedAt: string;
    completedAt?: string | null;
    deliveryStatus: string;
    providerName?: string;
    providerMessageId?: string | null;
    providerStatusMetadata?: string | null;
    errorClassification?: string | null;
    scheduledAt?: string | null;
    attemptCount?: number | null;
    lastAttemptAt?: string | null;
    nextRetryAt?: string | null;
    claimExpiresAt?: string | null;
  }) =>
    insertDeliveryRecordStatement.run(
      crypto.randomUUID(),
      record.userId,
      record.attemptType,
      record.requestedAt,
      record.completedAt ?? null,
      record.deliveryStatus,
      record.providerName ?? 'resend',
      record.providerMessageId ?? null,
      record.providerStatusMetadata ?? null,
      record.errorClassification ?? null,
      record.scheduledAt ?? null,
      record.attemptCount ?? null,
      record.lastAttemptAt ?? null,
      record.nextRetryAt ?? null,
      record.claimExpiresAt ?? null
    );

  try {
    database
      .prepare(
        'insert into auth_user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, ?, ?, ?)'
      )
      .run(userId, 'Delivery History User', 'history@example.com', 1, secondsSinceEpoch, secondsSinceEpoch);
    database
      .prepare(
        'insert into auth_session (id, expires_at, token, created_at, updated_at, user_id) values (?, ?, ?, ?, ?, ?)'
      )
      .run(
        crypto.randomUUID(),
        secondsSinceEpoch + 60 * 60,
        sessionToken,
        secondsSinceEpoch,
        secondsSinceEpoch,
        userId
      );
    database
      .prepare('insert into users (id, google_subject, email) values (?, ?, ?)')
      .run(userId, userId, 'history@example.com');
    database
      .prepare('insert into users (id, google_subject, email) values (?, ?, ?)')
      .run(otherUserId, otherUserId, 'other-history@example.com');

    insertDeliveryRecord({
      userId,
      attemptType: 'scheduled',
      requestedAt: atDaysAgo(0.5),
      deliveryStatus: 'queued',
      scheduledAt: atDaysAgo(0.5),
      attemptCount: 1
    });
    insertDeliveryRecord({
      userId,
      attemptType: 'scheduled',
      requestedAt: atDaysAgo(1),
      completedAt: atDaysAgo(0.99),
      deliveryStatus: 'sent',
      providerMessageId: 'scheduled-message-id',
      providerStatusMetadata: 'accepted',
      scheduledAt: atDaysAgo(1),
      attemptCount: 2,
      lastAttemptAt: atDaysAgo(0.99)
    });
    insertDeliveryRecord({
      userId,
      attemptType: 'scheduled',
      requestedAt: atDaysAgo(2),
      deliveryStatus: 'retrying',
      providerStatusMetadata: 'temporarily unavailable',
      errorClassification: 'provider-unavailable',
      scheduledAt: atDaysAgo(2),
      attemptCount: 2,
      lastAttemptAt: atDaysAgo(1.99),
      nextRetryAt: atDaysAgo(1.9)
    });
    insertDeliveryRecord({
      userId,
      attemptType: 'scheduled',
      requestedAt: atDaysAgo(3),
      deliveryStatus: 'processing',
      scheduledAt: atDaysAgo(3),
      attemptCount: 1,
      lastAttemptAt: atDaysAgo(3),
      claimExpiresAt: atDaysAgo(2.99)
    });
    insertDeliveryRecord({
      userId,
      attemptType: 'scheduled',
      requestedAt: atDaysAgo(4),
      completedAt: atDaysAgo(3.99),
      deliveryStatus: 'failed',
      providerName: 'private-provider-name',
      providerMessageId: 'private-provider-message-id',
      providerStatusMetadata: 'raw payload for history@example.com with secret-token',
      errorClassification: 'unexpected',
      scheduledAt: atDaysAgo(4),
      attemptCount: 3,
      lastAttemptAt: atDaysAgo(3.99)
    });
    insertDeliveryRecord({
      userId,
      attemptType: 'test',
      requestedAt: atDaysAgo(5),
      completedAt: atDaysAgo(4.99),
      deliveryStatus: 'sent',
      providerMessageId: 'test-message-id',
      providerStatusMetadata: 'accepted'
    });
    insertDeliveryRecord({
      userId,
      attemptType: 'scheduled',
      requestedAt: atDaysAgo(31),
      completedAt: atDaysAgo(30.99),
      deliveryStatus: 'sent',
      providerName: 'outside-history-provider',
      scheduledAt: atDaysAgo(31),
      attemptCount: 99,
      lastAttemptAt: atDaysAgo(30.99)
    });
    insertDeliveryRecord({
      userId: otherUserId,
      attemptType: 'scheduled',
      requestedAt: atDaysAgo(1),
      completedAt: atDaysAgo(0.99),
      deliveryStatus: 'sent',
      providerName: 'other-user-provider',
      scheduledAt: atDaysAgo(1),
      attemptCount: 88,
      lastAttemptAt: atDaysAgo(0.99)
    });

    await page.context().addCookies([
      {
        name: 'better-auth.session_token',
        value: `${sessionToken}.${await makeSignature(
          sessionToken,
          'daily-playwright-auth-secret-at-least-32-characters'
        )}`,
        domain: '127.0.0.1',
        path: '/'
      }
    ]);
    const pageResponse = await page.goto('/');
    const pageResponseBody = await pageResponse?.text();

    expect(pageResponseBody).not.toContain('private-provider-name');
    expect(pageResponseBody).not.toContain('private-provider-message-id');
    expect(pageResponseBody).not.toMatch(/history@example\.com.*secret-token|raw payload/);

    const deliveryHistory = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Delivery History' })
    });

    await expect(deliveryHistory).toBeVisible();
    await expect(deliveryHistory.getByText('Scheduled Daily Summary', { exact: true })).toHaveCount(5);
    await expect(deliveryHistory.getByText('Test Daily Summary', { exact: true })).toHaveCount(1);
    await expect(deliveryHistory.getByText('Unknown', { exact: true })).toBeVisible();
    await expect(deliveryHistory.getByText('Sent', { exact: true })).toHaveCount(2);
    await expect(deliveryHistory.getByText('Retrying', { exact: true })).toBeVisible();
    await expect(deliveryHistory.getByText('Processing', { exact: true })).toBeVisible();
    await expect(deliveryHistory.getByText('Failed', { exact: true })).toBeVisible();
    await expect(deliveryHistory.getByText('Attempts', { exact: true })).toHaveCount(5);
    await expect(deliveryHistory.getByText('2', { exact: true })).toHaveCount(2);
    await expect(deliveryHistory.getByText('Scheduled for', { exact: true })).toHaveCount(5);
    await expect(deliveryHistory.getByText('Completed', { exact: true })).toHaveCount(6);
    await expect(deliveryHistory.getByText('test-message-id', { exact: true })).toBeVisible();
    await expect(deliveryHistory.getByText('99', { exact: true })).toHaveCount(0);
    await expect(deliveryHistory.getByText('88', { exact: true })).toHaveCount(0);
    await expect(deliveryHistory.getByText('private-provider-name', { exact: true })).toHaveCount(0);
    await expect(deliveryHistory.getByText('private-provider-message-id', { exact: true })).toHaveCount(0);
    await expect(deliveryHistory.getByText(/history@example\.com|secret-token|raw payload/)).toHaveCount(0);
  } finally {
    database.prepare('delete from auth_user where id = ?').run(userId);
    database.prepare('delete from users where id in (?, ?)').run(userId, otherUserId);
    database.close();
  }
});

test('Visitor opens Daily into the usable main panel', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Daily', exact: true })).toBeVisible();
  await expect(page.getByText('Visitor mode', { exact: true })).toBeVisible();
  await expect(page.getByText('Google sign-in will be required before a Daily Summary can be sent.')).toBeVisible();
  await expect(page.getByText('Local Setup is saved in this browser only.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in with Google' })).toHaveAttribute(
    'href',
    '/auth/google'
  );
  await expect(page.getByText('Google Calendar')).not.toBeVisible();
  await expect(page.getByText('Connect Google Calendar')).not.toBeVisible();
  await expect(page.getByText('Selected Calendar')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview Daily Summary' })).toBeVisible();
});

test('Visitor can preview but cannot send or view Delivery Records', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Preview Daily Summary' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send Test Daily Summary' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Delivery History' })).toHaveCount(0);
  await expect(page.getByText('No Delivery Records in the last 30 days.')).toHaveCount(0);
  await expect(
    page.getByText('Google sign-in is required before a test Daily Summary can be sent.')
  ).toBeVisible();
});

test('Visitor configures Daily Summary state from the main panel', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('textbox', { name: 'Summary Time' })).toHaveValue('07:00');
  await expect(page.getByRole('radio', { name: 'UTC' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Light Theme' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Summary Delivery' })).toBeChecked();
  await expect(page.getByText('Next summary: 07:00 UTC')).toBeVisible();

  await page.getByLabel('Summary Time').fill('18:45');
  await expect(page.getByLabel('Summary Time')).toHaveValue('18:45');
  await page.getByRole('radio', { name: 'America/New_York' }).check();
  await expect(page.getByRole('radio', { name: 'America/New_York' })).toBeChecked();
  await page.getByRole('radio', { name: 'Dark Theme' }).check();
  await expect(page.getByRole('radio', { name: 'Dark Theme' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Summary Delivery' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Summary Delivery' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Weather Section' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Weather Section' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Todo Section' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Todo Section' })).not.toBeChecked();

  await expect(page.getByText('Next summary: 18:45 America/New_York')).toBeVisible();
  await expect(page.getByText('Dark preview')).toBeVisible();
  await expect(page.getByText('Mock Weather')).not.toBeVisible();
  await expect(page.getByText('Todo source is not connected yet.')).not.toBeVisible();
  await expect(page.getByText('Mock Commute')).toHaveCount(0);
  await expect(page.getByText('Demo Calendar - sample Calendar Events for the Week Ahead.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview Daily Summary' })).toBeDisabled();
});

test('Visitor Summary Configuration persists after page refresh', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Summary Time').fill('18:45');
  await page.getByRole('radio', { name: 'America/New_York' }).check();
  await page.getByRole('radio', { name: 'Dark Theme' }).check();
  await page.getByRole('checkbox', { name: 'Summary Delivery' }).uncheck();
  await page.getByRole('checkbox', { name: 'Weather Section' }).uncheck();
  await page.getByRole('checkbox', { name: 'Todo Section' }).uncheck();

  await page.reload();

  await expect(page.getByLabel('Summary Time')).toHaveValue('18:45');
  await expect(page.getByRole('radio', { name: 'America/New_York' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Dark Theme' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Summary Delivery' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Weather Section' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Todo Section' })).not.toBeChecked();
  await expect(page.getByText('Next summary: 18:45 America/New_York')).toBeVisible();
  await expect(page.getByText('Dark preview')).toBeVisible();
  await expect(page.getByText('Mock Weather')).not.toBeVisible();
  await expect(page.getByText('Todo source is not connected yet.')).not.toBeVisible();
});

test('Visitor Weather Location persists after page refresh', async ({ page }) => {
  await stubOpenMeteoForecast(page);
  await page.goto('/');

  await expect(page.getByText('Choose a Weather Location to preview live weather.')).toBeVisible();
  await expect(page.getByText('Mock Weather')).not.toBeVisible();
  await expect(page.getByText('Saved in this browser only', { exact: true })).toBeVisible();
  await expect(page.getByLabel('City Search')).toBeEnabled();
  await page.getByLabel('City Search').fill('Warsaw');
  await expect(page.getByLabel('City Search')).toHaveValue('Warsaw');
  await page.getByRole('button', { name: 'Search' }).click();
  await page
    .getByRole('list', { name: 'Weather Location search results' })
    .getByRole('button', { name: 'Select' })
    .first()
    .click();

  await expect(page.getByText('Weather Location saved in this browser only.')).toBeVisible();
  await expect(page.getByText('Warsaw, Masovian Voivodeship, Poland')).toBeVisible();
  await expect(
    page.getByText('Rainy. Low 12C, high 19C. Chance of precipitation 80%.')
  ).toBeVisible();
  await expect(page.getByText('Mock Weather')).not.toBeVisible();

  await page.reload();

  await expect(page.getByText('Warsaw, Masovian Voivodeship, Poland')).toBeVisible();
  await expect(page.getByText('52.2297, 21.0122')).toBeVisible();
  await expect(
    page.getByText('Rainy. Low 12C, high 19C. Chance of precipitation 80%.')
  ).toBeVisible();
});

test('Visitor manages ordered Commute Routes and Commute Days in browser-local setup', async ({ page }) => {
  const pointSelections: Array<{ latitude: number; longitude: number }> = [];
  await page.route('/commute-point-selection', async (route) => {
    const request = route.request().postDataJSON() as { latitude: number; longitude: number };
    pointSelections.push(request);
    const origin = request.latitude === 50;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        outcome: 'available',
        point: origin
          ? {
              label: 'Origin point',
              ...request
            }
          : {
              label: 'Destination point',
              ...request
            }
      })
    });
  });
  await page.goto('/');

  await page.getByLabel('Route Name').fill('Morning commute');
  await page.getByLabel('Origin latitude').fill('50');
  await page.getByLabel('Origin longitude').fill('19');
  await page.getByLabel('Destination latitude').fill('51');
  await page.getByLabel('Destination longitude').fill('20');
  await page.getByRole('button', { name: 'Select' }).first().click();
  await page.getByRole('button', { name: 'Select' }).nth(1).click();
  await page.getByRole('button', { name: 'Add Commute Route' }).click();

  await expect(page.getByText('Commute Route saved in this browser only.')).toBeVisible();
  await expect(page.getByText('Morning commute', { exact: true })).toBeVisible();
  await expect(page.getByText('No Weather Location selected')).toBeVisible();

  await page.getByRole('button', { name: 'Disable Morning commute' }).click();
  await expect(page.getByText('Disabled', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Morning commute' }).click();
  await page.getByLabel('Route Name').fill('Evening commute');
  await page.getByRole('button', { name: 'Save Commute Route' }).click();
  await expect(page.getByText('Commute Route updated in this browser only.')).toBeVisible();
  await expect(page.getByText('Evening commute', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable Evening commute' })).toBeVisible();

  for (const routeName of ['Route two', 'Route three', 'Route four', 'Route five']) {
    await page.getByLabel('Route Name').fill(routeName);
    await page.getByLabel('Origin latitude').fill('50');
    await page.getByLabel('Origin longitude').fill('19');
    await page.getByLabel('Destination latitude').fill('51');
    await page.getByLabel('Destination longitude').fill('20');
    await page.getByRole('button', { name: 'Select' }).first().click();
    await page.getByRole('button', { name: 'Select' }).nth(1).click();
    await page.getByRole('button', { name: 'Add Commute Route' }).click();
  }

  const savedRoutes = page.locator('[aria-label="Saved Commute Routes"]');
  await expect(savedRoutes.getByText('Evening commute', { exact: true })).toBeVisible();
  await expect(savedRoutes.getByText('Route two', { exact: true })).toBeVisible();
  await expect(savedRoutes.getByText('Route five', { exact: true })).toBeVisible();
  await expect(savedRoutes.locator('> div')).toHaveCount(5);

  await page.getByLabel('Route Name').fill('Route six');
  await page.getByRole('button', { name: 'Add Commute Route' }).click();
  await expect(page.getByText('You can save at most five Commute Routes.')).toBeVisible();

  await page.getByLabel('Monday Commute Day').uncheck();
  await page.getByLabel('Sunday Commute Day').check();
  await page.getByRole('button', { name: 'Delete Route three' }).click();
  await expect(savedRoutes.getByText('Route three', { exact: true })).toHaveCount(0);

  await page.reload();

  await expect(page.getByText('Evening commute', { exact: true })).toBeVisible();
  await expect(page.getByText('Route two', { exact: true })).toBeVisible();
  await expect(page.getByText('Route three', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Route five', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable Evening commute' })).toBeVisible();
  await expect(page.getByLabel('Monday Commute Day')).not.toBeChecked();
  await expect(page.getByLabel('Sunday Commute Day')).toBeChecked();
  expect(pointSelections).toContainEqual({ latitude: 50, longitude: 19 });
  expect(pointSelections).toContainEqual({ latitude: 51, longitude: 20 });
});

test('Visitor preview renders eligible Commute estimates and local unavailable behavior without live Google calls', async ({ page }) => {
  let estimateOutcome: 'available' | 'unavailable' | 'invalid-route' = 'available';
  let estimateRequests = 0;
  const commuteDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  await page.route('/commute-point-selection', async (route) => {
    const point = route.request().postDataJSON() as { latitude: number; longitude: number };
    await route.fulfill({ json: { outcome: 'available', point: { label: 'Selected point', ...point } } });
  });
  await page.route('/commute-estimate', async (route) => {
    estimateRequests += 1;
    await route.fulfill({
      status: estimateOutcome === 'invalid-route' ? 400 : 200,
      json: estimateOutcome === 'available'
        ? { outcome: 'available', estimate: { durationMinutes: 24 } }
        : estimateOutcome === 'unavailable'
          ? { outcome: 'unavailable', reason: 'global-daily-cap' }
          : { outcome: 'invalid-route' }
    });
  });
  await page.goto('/');
  for (const day of commuteDays) {
    await page.getByLabel(`${day} Commute Day`).check();
  }
  expect(estimateRequests).toBe(0);
  await page.getByLabel('Route Name').fill('Office route');
  await page.getByRole('button', { name: 'Select' }).first().click();
  await page.getByRole('button', { name: 'Select' }).nth(1).click();
  await page.getByRole('button', { name: 'Add Commute Route' }).click();

  await expect(page.getByText('Office route: 24 minutes')).toBeVisible();
  expect(estimateRequests).toBe(1);

  const currentUtcDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long'
  }).format(new Date());
  const daysWithCurrentFirst = [currentUtcDay, ...commuteDays.filter((day) => day !== currentUtcDay)];

  for (const day of daysWithCurrentFirst) {
    await page.getByLabel(`${day} Commute Day`).uncheck();
  }
  await expect(page.getByText('Office route: 24 minutes')).toHaveCount(0);
  expect(estimateRequests).toBe(1);

  estimateOutcome = 'unavailable';
  for (const day of commuteDays) {
    await page.getByLabel(`${day} Commute Day`).check();
  }
  await expect(page.getByText('Live Commute is unavailable right now.')).toBeVisible();
  await expect(page.getByText('Demo Calendar - sample Calendar Events for the Week Ahead.')).toBeVisible();

  estimateOutcome = 'invalid-route';
  await page.getByLabel('Sunday Commute Day').uncheck();
  await page.getByLabel('Sunday Commute Day').check();
  await expect(page.getByText('Live Commute is unavailable right now.')).toBeVisible();
  await expect(page.getByText('Office route: 0 minutes')).toHaveCount(0);
});

test('Visitor sees unavailable Weather Location search reason when geocoding fails', async ({ page }) => {
  await page.route('/weather-location-search?**', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        outcome: 'unavailable',
        reason: 'Weather Location search is unavailable right now.'
      })
    });
  });

  await page.goto('/');
  await page.getByLabel('City Search').fill('Warsaw');
  await page.getByRole('button', { name: 'Search' }).click();

  await expect(page.getByText('Weather Location search is unavailable right now.')).toBeVisible();
  await expect(page.getByText('Enter a valid city search.')).toHaveCount(0);
});

test('Visitor falls back safely when browser Local Setup data is corrupt', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('daily.visitorLocalSetup.v1', '{');
  });

  await page.reload();

  await expect(page.getByText('Invalid browser data was ignored. Defaults are active.')).toBeVisible();
  await expect(page.getByLabel('Summary Time')).toHaveValue('07:00');
  await expect(page.getByRole('radio', { name: 'UTC' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Light Theme' })).toBeChecked();
  await expect(page.getByText('Next summary: 07:00 UTC')).toBeVisible();
  await expect(page.getByRole('list', { name: 'No Category Todo Tasks' }).getByRole('listitem')).toHaveCount(0);
});

test('Visitor sees Demo Calendar content for the Week Ahead and can hide it from the preview', async ({
  page
}) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Demo Calendar' }).first()).toBeVisible();
  await expect(page.getByText('Sample Calendar Events for Visitor mode')).toBeVisible();
  await expect(page.getByText('Week Ahead', { exact: true })).toBeVisible();
  await expect(page.getByText('Planning check-in', { exact: true })).toBeVisible();
  await expect(page.getByText('Design review', { exact: true })).toBeVisible();
  await expect(page.getByText('Todo source is not connected yet.')).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'Connect Google Calendar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Disconnect Google Calendar' })).toHaveCount(0);
  await expect(page.getByText('Selected Calendars', { exact: true })).toHaveCount(0);
  await expect(page.locator('input[id^="selected-calendar-"]')).toHaveCount(0);

  await page.locator('#calendar-section').uncheck();
  await expect(page.locator('#calendar-section')).not.toBeChecked();

  await expect(page.getByRole('heading', { name: 'Demo Calendar' })).toHaveCount(0);
  await expect(page.getByText('Planning check-in')).toHaveCount(0);
  await expect(page.getByText('Todo source is not connected yet.')).not.toBeVisible();
});

test('Visitor creates edits and completes an active uncategorized Todo Task', async ({ page }) => {
  await page.goto('/');

  const uncategorizedTasks = page.getByRole('list', { name: 'No Category Todo Tasks' });

  await page.getByLabel('New Todo Task').fill('Buy breakfast oats');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  await expect(uncategorizedTasks.getByRole('listitem').filter({ hasText: 'Buy breakfast oats' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit Buy breakfast oats' }).click();
  await page.getByLabel('Edit Todo Task').fill('Buy breakfast oats and fruit');
  await page.getByRole('button', { name: 'Save Todo Task' }).click();

  await expect(uncategorizedTasks.getByText('Buy breakfast oats and fruit')).toBeVisible();
  await expect(uncategorizedTasks.getByText('Buy breakfast oats', { exact: true })).not.toBeVisible();

  await page.getByRole('checkbox', { name: 'Complete Buy breakfast oats and fruit' }).click();
  await expect(page.getByText('Buy breakfast oats and fruit')).not.toBeVisible();
});

test('Visitor manages Todo Categories with urgency and confirmed deletion', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  const todoPanel = page.locator('section.rounded-lg:has(> h2:text("Todo Tasks"))');

  await page.getByLabel('New Todo Category').fill('Home');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();
  expect(pageErrors).toEqual([]);
  await expect(todoPanel.getByRole('heading', { name: 'Home' })).toBeVisible();

  await page.getByRole('button', { name: 'Rename Home' }).click();
  await page.getByLabel('Edit Todo Category').fill('Apartment');
  await page.getByRole('button', { name: 'Save Todo Category' }).click();
  await expect(todoPanel.getByRole('heading', { name: 'Apartment' })).toBeVisible();

  await page.getByLabel('New Todo Task').fill('Call plumber');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Apartment' });
  await page.getByLabel('Urgency', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  const apartmentTasks = page.getByRole('list', { name: 'Apartment Todo Tasks' });
  await expect(apartmentTasks.getByText('Call plumber')).toBeVisible();
  await expect(apartmentTasks.getByLabel('High urgency')).toHaveText('!');

  await page.getByLabel('New Todo Task').fill('Water plants');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Apartment' });
  await page.getByLabel('Urgency', { exact: true }).selectOption('medium');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();
  await expect(apartmentTasks.getByText('Call plumber')).toBeVisible();
  await expect(apartmentTasks.getByText('Water plants')).toBeVisible();
  await expect(apartmentTasks.getByLabel('Medium urgency')).toHaveText('!');
  await expect(apartmentTasks.locator('li').nth(0)).toContainText('Call plumber');
  await expect(apartmentTasks.locator('li').nth(1)).toContainText('Water plants');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Delete Apartment and all Todo Tasks inside it?');
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Delete Apartment' }).click();
  await expect(todoPanel.getByRole('heading', { name: 'Apartment' })).toBeVisible();
  await expect(apartmentTasks.getByText('Call plumber')).toBeVisible();

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete Apartment' }).click();
  await expect(todoPanel.getByRole('heading', { name: 'Apartment' })).not.toBeVisible();
  await expect(page.getByText('Call plumber')).not.toBeVisible();
  await expect(page.getByText('Water plants')).not.toBeVisible();
});

test('Visitor sees active Todo Tasks grouped in the Daily Summary preview', async ({ page }) => {
  await page.goto('/');

  const preview = page.locator('section.rounded-lg').filter({
    has: page.getByRole('heading', { name: 'Daily Summary Preview' })
  });
  await expect(preview.getByText('Todo Tasks')).toHaveCount(0);

  await page.getByLabel('New Todo Category').fill('Work');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();
  await page.getByLabel('New Todo Category').fill('Empty Category');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();

  await page.getByLabel('New Todo Task').fill('Buy coffee');
  await page.getByLabel('Urgency', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  await page.getByLabel('New Todo Task').fill('Draft update');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Work' });
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  await expect(preview.getByText('Todo Tasks')).toBeVisible();
  await expect(preview.getByText('Buy coffee')).toBeVisible();
  await expect(preview.getByText('Work')).toBeVisible();
  await expect(preview.getByText('Draft update')).toBeVisible();
  await expect(preview.getByLabel('High urgency')).toHaveText('!');
  await expect(preview.getByText('Empty Category')).toHaveCount(0);

  const previewText = await preview.textContent();
  expect(previewText?.indexOf('Buy coffee')).toBeLessThan(previewText?.indexOf('Work') ?? -1);

  await page.getByRole('checkbox', { name: 'Todo Section' }).uncheck();
  await expect(preview.getByText('Todo Tasks')).toHaveCount(0);
  await expect(preview.getByText('Buy coffee')).toHaveCount(0);
});

test('Visitor reorders uncategorized Todo Tasks with accessible drag controls', async ({ page }) => {
  await page.goto('/');

  for (const title of ['Plan meals', 'Buy groceries', 'Cook dinner']) {
    await page.getByLabel('New Todo Task').fill(title);
    await page.getByRole('button', { name: 'Add Todo Task' }).click();
  }

  const uncategorizedTasks = page.getByRole('list', { name: 'No Category Todo Tasks' });
  await expect(uncategorizedTasks.locator('li').nth(0)).toContainText('Plan meals');
  await expect(uncategorizedTasks.locator('li').nth(1)).toContainText('Buy groceries');
  await expect(uncategorizedTasks.locator('li').nth(2)).toContainText('Cook dinner');

  await uncategorizedTasks.getByRole('button', { name: 'Move Cook dinner' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');

  await expect(uncategorizedTasks.locator('li').nth(0)).toContainText('Cook dinner');
  await expect(uncategorizedTasks.locator('li').nth(1)).toContainText('Plan meals');
  await expect(uncategorizedTasks.locator('li').nth(2)).toContainText('Buy groceries');
});

test('Visitor reorders uncategorized Todo Tasks with a pointer drag without disappearing', async ({
  page
}) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  for (const title of ['Plan meals', 'Buy groceries']) {
    await page.getByLabel('New Todo Task').fill(title);
    await page.getByRole('button', { name: 'Add Todo Task' }).click();
  }

  const uncategorizedTasks = page.getByRole('list', { name: 'No Category Todo Tasks' });
  await expect(uncategorizedTasks.getByRole('listitem')).toHaveText([
    /Plan meals/,
    /Buy groceries/
  ]);

  await dragTodoHandleToTarget({
    page,
    sourceHandle: uncategorizedTasks.getByRole('button', { name: 'Move Buy groceries' }),
    target: uncategorizedTasks.getByRole('listitem').filter({ hasText: 'Plan meals' }),
    targetPosition: { x: 20, y: 4 }
  });

  await expect(uncategorizedTasks.getByRole('listitem')).toHaveText([
    /Buy groceries/,
    /Plan meals/
  ]);
});

test('Visitor moves Todo Tasks between categories with a pointer drag without disappearing', async ({
  page
}) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  for (const category of ['Work', 'Home']) {
    await page.getByLabel('New Todo Category').fill(category);
    await page.getByRole('button', { name: 'Add Todo Category' }).click();
  }

  await page.getByLabel('New Todo Task').fill('File invoice');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Work' });
  await page.getByLabel('Urgency', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  const workTasks = page.getByRole('list', { name: 'Work Todo Tasks' });
  const homeTasks = page.getByRole('list', { name: 'Home Todo Tasks' });

  await dragTodoHandleToTarget({
    page,
    sourceHandle: workTasks.getByRole('button', { name: 'Move File invoice' }),
    target: homeTasks
  });

  await expect(workTasks.getByText('File invoice')).toHaveCount(0);
  await expect(homeTasks.getByRole('listitem').filter({ hasText: 'File invoice' })).toBeVisible();
  await expect(homeTasks.getByRole('listitem').filter({ hasText: 'File invoice' }).getByLabel('High urgency')).toHaveText('!');
});

test('Visitor reorders Todo Tasks inside a category without urgency resorting', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('New Todo Category').fill('Work');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();

  for (const [title, urgency] of [
    ['Draft update', 'low'],
    ['Review launch notes', 'high'],
    ['Send agenda', 'medium']
  ] as const) {
    await page.getByLabel('New Todo Task').fill(title);
    await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Work' });
    await page.getByLabel('Urgency', { exact: true }).selectOption(urgency);
    await page.getByRole('button', { name: 'Add Todo Task' }).click();
  }

  const workTasks = page.getByRole('list', { name: 'Work Todo Tasks' });
  await expect(workTasks.locator('li').nth(0)).toContainText('Draft update');
  await expect(workTasks.locator('li').nth(1)).toContainText('Review launch notes');
  await expect(workTasks.locator('li').nth(2)).toContainText('Send agenda');

  await workTasks.getByRole('button', { name: 'Move Send agenda' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');

  await expect(workTasks.locator('li').nth(0)).toContainText('Send agenda');
  await expect(workTasks.locator('li').nth(1)).toContainText('Draft update');
  await expect(workTasks.locator('li').nth(2)).toContainText('Review launch notes');

  await page.getByRole('button', { name: 'Edit Draft update' }).click();
  await page.getByLabel('Edit Urgency').selectOption('high');
  await page.getByRole('button', { name: 'Save Todo Task' }).click();

  await expect(workTasks.locator('li').nth(0)).toContainText('Send agenda');
  await expect(workTasks.locator('li').nth(1)).toContainText('Draft update');
  await expect(workTasks.locator('li').nth(2)).toContainText('Review launch notes');
});

test('Visitor reorders Todo Categories and keeps that order after page refresh', async ({ page }) => {
  await page.goto('/');

  for (const category of ['Work', 'Home', 'Errands']) {
    await page.getByLabel('New Todo Category').fill(category);
    await page.getByRole('button', { name: 'Add Todo Category' }).click();
  }

  const todoCategories = page.getByLabel('Todo Categories');
  await expect(todoCategories.locator('section[aria-label$="Todo Category"]')).toHaveText([
    /Work/,
    /Home/,
    /Errands/
  ]);

  await todoCategories.getByRole('button', { name: 'Move category Errands' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');

  await expect(todoCategories.locator('section[aria-label$="Todo Category"]')).toHaveText([
    /Errands/,
    /Work/,
    /Home/
  ]);

  await page.reload();

  await expect(page.getByLabel('Todo Categories').locator('section[aria-label$="Todo Category"]')).toHaveText([
    /Errands/,
    /Work/,
    /Home/
  ]);
});

test('Visitor moves Todo Tasks between categories and the uncategorized list', async ({ page }) => {
  await page.goto('/');

  for (const category of ['Work', 'Home']) {
    await page.getByLabel('New Todo Category').fill(category);
    await page.getByRole('button', { name: 'Add Todo Category' }).click();
  }

  await page.getByLabel('New Todo Task').fill('File invoice');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Work' });
  await page.getByLabel('Urgency', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  const uncategorizedTasks = page.getByRole('list', { name: 'No Category Todo Tasks' });
  const workTasks = page.getByRole('list', { name: 'Work Todo Tasks' });
  const homeTasks = page.getByRole('list', { name: 'Home Todo Tasks' });

  await workTasks.getByRole('button', { name: 'Move File invoice' }).focus();
  await page.keyboard.press('Space');
  await tabUntilDropTargetActive(page, homeTasks);
  await page.keyboard.press('Space');
  await expect(workTasks.getByText('File invoice')).toHaveCount(0);
  await expect(homeTasks.getByRole('listitem').filter({ hasText: 'File invoice' })).toBeVisible();
  await expect(homeTasks.getByRole('listitem').filter({ hasText: 'File invoice' }).getByLabel('High urgency')).toHaveText('!');

  await page.getByLabel('New Todo Task').fill('Wash mugs');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Home' });
  await page.getByLabel('Urgency', { exact: true }).selectOption('medium');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  await homeTasks.getByRole('button', { name: 'Move Wash mugs' }).focus();
  await page.keyboard.press('Space');
  await tabUntilDropTargetActive(page, uncategorizedTasks, { direction: 'backward' });
  await page.keyboard.press('Space');
  await expect(homeTasks.getByText('Wash mugs')).toHaveCount(0);
  await expect(uncategorizedTasks.getByRole('listitem').filter({ hasText: 'Wash mugs' })).toBeVisible();
  await expect(
    uncategorizedTasks.getByRole('listitem').filter({ hasText: 'Wash mugs' }).getByLabel('Medium urgency')
  ).toHaveText('!');
});

test('Visitor Todo data and local-save status persist after page refresh', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Saved in this browser only')).toBeVisible();

  await page.getByLabel('New Todo Category').fill('Work');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();
  await page.getByLabel('New Todo Category').fill('Home');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();

  await page.getByLabel('New Todo Task').fill('Buy coffee');
  await page.getByLabel('Urgency', { exact: true }).selectOption('medium');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  for (const [title, category, urgency] of [
    ['Write launch note', 'Work', 'low'],
    ['Review deploy checklist', 'Work', 'high'],
    ['Water plants', 'Home', 'medium']
  ] as const) {
    await page.getByLabel('New Todo Task').fill(title);
    await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: category });
    await page.getByLabel('Urgency', { exact: true }).selectOption(urgency);
    await page.getByRole('button', { name: 'Add Todo Task' }).click();
  }

  const workTasks = page.getByRole('list', { name: 'Work Todo Tasks' });
  await workTasks.getByRole('button', { name: 'Move Review deploy checklist' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');

  await page.reload();

  const uncategorizedTasks = page.getByRole('list', { name: 'No Category Todo Tasks' });
  const restoredWorkTasks = page.getByRole('list', { name: 'Work Todo Tasks' });
  const homeTasks = page.getByRole('list', { name: 'Home Todo Tasks' });

  await expect(page.getByText('Saved in this browser only')).toBeVisible();
  await expect(uncategorizedTasks.getByRole('listitem').filter({ hasText: 'Buy coffee' })).toBeVisible();
  await expect(
    uncategorizedTasks.getByRole('listitem').filter({ hasText: 'Buy coffee' }).getByLabel('Medium urgency')
  ).toHaveText('!');
  await expect(restoredWorkTasks.locator('li').nth(0)).toContainText('Review deploy checklist');
  await expect(restoredWorkTasks.locator('li').nth(1)).toContainText('Write launch note');
  await expect(
    restoredWorkTasks.getByRole('listitem').filter({ hasText: 'Review deploy checklist' }).getByLabel('High urgency')
  ).toHaveText('!');
  await expect(homeTasks.getByRole('listitem').filter({ hasText: 'Water plants' })).toBeVisible();

  await page.getByLabel('New Todo Category').fill('Errands');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();
  await expect(page.getByRole('heading', { name: 'Errands' })).toBeVisible();

  await page.getByLabel('New Todo Task').fill('Schedule retro');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Work' });
  await page.getByRole('button', { name: 'Add Todo Task' }).click();
  await expect(restoredWorkTasks.getByRole('listitem').filter({ hasText: 'Schedule retro' })).toBeVisible();
  await expect(restoredWorkTasks.getByRole('listitem').filter({ hasText: 'Schedule retro' })).toHaveCount(1);
});

test('Visitor Todo changes from moves renames deletion and completion remain durable after refresh', async ({
  page
}) => {
  await page.goto('/');

  for (const category of ['Work', 'Home']) {
    await page.getByLabel('New Todo Category').fill(category);
    await page.getByRole('button', { name: 'Add Todo Category' }).click();
  }

  await page.getByRole('button', { name: 'Rename Home' }).click();
  await page.getByLabel('Edit Todo Category').fill('Apartment');
  await page.getByRole('button', { name: 'Save Todo Category' }).click();

  await page.getByLabel('New Todo Task').fill('Buy coffee');
  await page.getByLabel('Urgency', { exact: true }).selectOption('medium');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  await page.getByLabel('New Todo Task').fill('File invoice');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Work' });
  await page.getByLabel('Urgency', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  await page.getByLabel('New Todo Task').fill('Water plants');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Apartment' });
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  const workTasks = page.getByRole('list', { name: 'Work Todo Tasks' });
  const apartmentTasks = page.getByRole('list', { name: 'Apartment Todo Tasks' });

  await workTasks.getByRole('button', { name: 'Move File invoice' }).focus();
  await page.keyboard.press('Space');
  await tabUntilDropTargetActive(page, apartmentTasks);
  await page.keyboard.press('Space');

  await page.getByRole('checkbox', { name: 'Complete Buy coffee' }).click();

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete Work' }).click();

  await page.reload();

  const todoPanel = page.locator('section.rounded-lg:has(> h2:text("Todo Tasks"))');
  const restoredUncategorizedTasks = page.getByRole('list', { name: 'No Category Todo Tasks' });
  const restoredApartmentTasks = page.getByRole('list', { name: 'Apartment Todo Tasks' });

  await expect(todoPanel.getByRole('heading', { name: 'Apartment' })).toBeVisible();
  await expect(todoPanel.getByRole('heading', { name: 'Work' })).toHaveCount(0);
  await expect(restoredUncategorizedTasks.getByText('Buy coffee')).toHaveCount(0);
  await expect(restoredApartmentTasks.getByRole('listitem').filter({ hasText: 'File invoice' })).toBeVisible();
  await expect(
    restoredApartmentTasks.getByRole('listitem').filter({ hasText: 'File invoice' }).getByLabel('High urgency')
  ).toHaveText('!');
  await expect(restoredApartmentTasks.getByRole('listitem').filter({ hasText: 'Water plants' })).toBeVisible();
  await expect(restoredApartmentTasks.getByRole('listitem')).toHaveText([
    /File invoice/,
    /Water plants/
  ]);
  await expect(page.getByRole('list', { name: 'Work Todo Tasks' })).toHaveCount(0);
});

test('Visitor cannot access the Admin Panel and private Local Setup content is excluded', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Admin Panel' })).toHaveCount(0);
  await page.getByLabel('New Todo Task').fill('Private board review');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  const adminResponse = await page.goto('/admin');

  await expect(page).toHaveURL('/admin');
  expect(adminResponse?.status()).toBe(403);
  await expect(page.locator('body')).not.toContainText('Operational shell');
  await expect(page.locator('body')).not.toContainText('Private board review');
  await expect(page.locator('body')).not.toContainText('Demo Calendar');
});

test('authorized Administrator can inspect privacy-safe delivery health', async ({ page }) => {
  const port = process.env.PLAYWRIGHT_PORT ?? '5173';
  const database = new Database(join(tmpdir(), `daily-playwright-${port}.db`));
  const now = new Date();
  const secondsSinceEpoch = Math.floor(now.getTime() / 1000);
  const adminId = `delivery-health-admin-${crypto.randomUUID()}`;
  const sessionToken = crypto.randomUUID();
  const currentDay = now.toISOString().slice(0, 10);
  const currentMonth = now.toISOString().slice(0, 7);
  const atMinutesAgo = (minutes: number) =>
    new Date(now.getTime() - minutes * 60 * 1000).toISOString();

  try {
    database
      .prepare(
        'insert into auth_user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, ?, ?, ?)'
      )
      .run(adminId, 'Delivery Health Admin', 'admin@example.com', 1, secondsSinceEpoch, secondsSinceEpoch);
    database
      .prepare(
        'insert into auth_session (id, expires_at, token, created_at, updated_at, user_id) values (?, ?, ?, ?, ?, ?)'
      )
      .run(
        crypto.randomUUID(),
        secondsSinceEpoch + 60 * 60,
        sessionToken,
        secondsSinceEpoch,
        secondsSinceEpoch,
        adminId
      );
    database
      .prepare(
        'insert into auth_account (id, account_id, provider_id, user_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)'
      )
      .run(
        crypto.randomUUID(),
        'google-account-subject',
        'google',
        adminId,
        secondsSinceEpoch,
        secondsSinceEpoch
      );
    database
      .prepare('insert into users (id, google_subject, email) values (?, ?, ?)')
      .run(adminId, 'private-google-subject', 'admin@example.com');
    database
      .prepare(
        `insert into scheduled_worker_runs (
          id, started_at, completed_at, duration_milliseconds, outcome, failure_classification,
          due_count, sent_count, skipped_count, retrying_count, failed_count, isolated_error_count
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'private-worker-run-identity',
        atMinutesAgo(1.1),
        atMinutesAgo(1),
        42,
        'completed-with-isolated-errors',
        null,
        4,
        1,
        0,
        1,
        1,
        1
      );
    const insertDelivery = database.prepare(
      `insert into delivery_records (
        id, user_id, attempt_type, requested_at, completed_at, delivery_status,
        provider_name, provider_message_id, provider_status_metadata, error_classification,
        scheduled_at, attempt_count, last_attempt_at, next_retry_at, claim_expires_at
      ) values (?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    );
    insertDelivery.run(
      'private-sent-occurrence',
      adminId,
      atMinutesAgo(10),
      atMinutesAgo(9),
      'sent',
      'private-provider',
      'private-provider-message-id',
      'private summary payload',
      null,
      atMinutesAgo(10),
      atMinutesAgo(9),
      null,
      null
    );
    insertDelivery.run(
      'private-failed-occurrence',
      adminId,
      atMinutesAgo(20),
      atMinutesAgo(19),
      'failed',
      'private-provider',
      'private-provider-message-id',
      'recipient admin@example.com and private summary payload',
      'provider-rejected',
      atMinutesAgo(20),
      atMinutesAgo(19),
      null,
      null
    );
    insertDelivery.run(
      'private-expired-occurrence',
      adminId,
      atMinutesAgo(30),
      null,
      'processing',
      'private-provider',
      null,
      null,
      null,
      atMinutesAgo(30),
      atMinutesAgo(30),
      null,
      atMinutesAgo(1)
    );
    const insertCapAlert = database.prepare(
      `insert or replace into google_maps_cap_alerts (
        cap_type, period_start_utc, delivery_status, claimed_at, completed_at, failure_code
      ) values (?, ?, ?, ?, ?, ?)`
    );
    insertCapAlert.run('daily', currentDay, 'delivered', atMinutesAgo(3), atMinutesAgo(2), null);
    insertCapAlert.run(
      'monthly',
      currentMonth,
      'failed',
      atMinutesAgo(3),
      atMinutesAgo(2),
      'delivery-failed'
    );

    await page.context().addCookies([
      {
        name: 'better-auth.session_token',
        value: `${sessionToken}.${await makeSignature(
          sessionToken,
          'daily-playwright-auth-secret-at-least-32-characters'
        )}`,
        domain: '127.0.0.1',
        path: '/'
      }
    ]);

    const response = await page.goto('/admin');
    const responseBody = await response?.text();
    const last24Hours = page.getByRole('region', { name: 'Last 24 hours' });
    const capAlerts = page.getByRole('region', { name: 'Operator cap alerts' });

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Delivery Health' })).toBeVisible();
    await expect(page.getByText('Healthy', { exact: true })).toBeVisible();
    await expect(page.getByText('Overdue after 5 minutes. Times and windows use UTC.')).toBeVisible();
    await expect(page.getByText('Latest run: Completed with isolated errors')).toBeVisible();
    await expect(last24Hours.getByText('Sent').locator('..')).toContainText('1');
    await expect(last24Hours.getByText('Failed', { exact: true }).locator('..')).toContainText('1');
    await expect(last24Hours.getByText('Expired claims').locator('..')).toContainText('1');
    await expect(last24Hours.getByText('provider-rejected')).toBeVisible();
    await expect(capAlerts.getByText(`Daily · ${currentDay}`)).toBeVisible();
    await expect(capAlerts.getByText('Delivered', { exact: true })).toBeVisible();
    await expect(capAlerts.getByText(`Monthly · ${currentMonth}`)).toBeVisible();
    await expect(capAlerts.getByText('Failed', { exact: true })).toBeVisible();
    await expect(capAlerts.getByText('Failure classification: delivery-failed')).toBeVisible();
    expect(responseBody).not.toMatch(
      /private-worker-run-identity|private-(?:sent|failed|expired)-occurrence|(?:private-google|google-account)-subject|private-provider-message-id|private summary payload|admin@example\.com/
    );
  } finally {
    database.close();
  }
});

test('authorized Administrator filters paged Technical Logs and audits the Maps control', async ({
  page
}) => {
  const port = process.env.PLAYWRIGHT_PORT ?? '5173';
  const database = new Database(join(tmpdir(), `daily-playwright-${port}.db`));
  const now = new Date();
  const secondsSinceEpoch = Math.floor(now.getTime() / 1000);
  const newAdminId = `technical-log-admin-${crypto.randomUUID()}`;
  const sessionToken = crypto.randomUUID();

  try {
    const existingAdmin = database
      .prepare('select id from auth_user where email = ?')
      .get('admin@example.com') as { id: string } | undefined;
    const adminId = existingAdmin?.id ?? newAdminId;

    if (!existingAdmin) {
      database
        .prepare(
          'insert into auth_user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, ?, ?, ?)'
        )
        .run(adminId, 'Technical Log Admin', 'admin@example.com', 1, secondsSinceEpoch, secondsSinceEpoch);
      database
        .prepare(
          'insert into auth_account (id, account_id, provider_id, user_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)'
        )
        .run(crypto.randomUUID(), 'google-technical-log-admin', 'google', adminId, secondsSinceEpoch, secondsSinceEpoch);
      database
        .prepare('insert into users (id, google_subject, email) values (?, ?, ?)')
        .run(adminId, 'private-technical-log-google-subject', 'admin@example.com');
    }

    database
      .prepare(
        'insert into auth_session (id, expires_at, token, created_at, updated_at, user_id) values (?, ?, ?, ?, ?, ?)'
      )
      .run(
        crypto.randomUUID(),
        secondsSinceEpoch + 60 * 60,
        sessionToken,
        secondsSinceEpoch,
        secondsSinceEpoch,
        adminId
      );
    database
      .prepare("delete from google_maps_control where control_key = 'admin-kill-switch'")
      .run();

    const insertLog = database.prepare(
      `insert into technical_log_records (
        id, occurred_at, event_code, severity, subsystem, outcome,
        failure_classification, correlation_id, duration_milliseconds, metadata
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (let index = 0; index < 27; index += 1) {
      insertLog.run(
        `private-log-row-${index}`,
        new Date(now.getTime() - index * 60_000).toISOString(),
        'scheduled-daily-summary-worker-completed',
        'info',
        'scheduled-delivery',
        'succeeded',
        null,
        null,
        index,
        JSON.stringify({
          dueCount: index,
          sentCount: index,
          skippedCount: 0,
          retryingCount: 0,
          failedCount: 0,
          isolatedErrorCount: 0,
          recipientEmail: 'private-recipient@example.com'
        })
      );
    }
    insertLog.run(
      'private-error-row',
      new Date(now.getTime() + 60_000).toISOString(),
      'scheduled-daily-summary-worker-failed',
      'error',
      'scheduled-delivery',
      'failed',
      'unexpected',
      null,
      5,
      JSON.stringify({
        dueCount: 1,
        sentCount: 0,
        skippedCount: 0,
        retryingCount: 0,
        failedCount: 1,
        isolatedErrorCount: 1
      })
    );

    await page.context().addCookies([
      {
        name: 'better-auth.session_token',
        value: `${sessionToken}.${await makeSignature(
          sessionToken,
          'daily-playwright-auth-secret-at-least-32-characters'
        )}`,
        domain: '127.0.0.1',
        path: '/'
      }
    ]);

    const response = await page.goto('/admin');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Technical Logs' })).toBeVisible();
    await expect(
      page.locator('article code').filter({ hasText: 'scheduled-daily-summary-worker-failed' })
    ).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(25);
    expect(await response?.text()).not.toMatch(
      /private-log-row|private-error-row|private-recipient@example\.com|private-technical-log-google-subject|admin@example\.com/
    );

    await page.getByRole('link', { name: 'Next page' }).click();
    await expect(page.getByRole('article')).toHaveCount(3);

    await page.goto('/admin');
    await page.getByLabel('Severity').selectOption('error');
    await page.getByLabel('Subsystem').selectOption('scheduled-delivery');
    await page.getByLabel('Event code').selectOption('scheduled-daily-summary-worker-failed');
    await page.getByLabel('From UTC').fill(new Date(now.getTime() + 30_000).toISOString());
    await page.getByLabel('To UTC').fill(new Date(now.getTime() + 90_000).toISOString());
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('severity') === 'error'),
      page.getByRole('button', { name: 'Apply filters' }).click()
    ]);
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(
      page.locator('article code').filter({ hasText: 'scheduled-daily-summary-worker-failed' })
    ).toBeVisible();

    await page.goto('/admin');
    await page.getByRole('button', { name: 'Enable Admin Panel kill switch' }).click();
    const repeatedSubmissionStatus = await page.evaluate(async () => {
      const form = new FormData();
      form.set('enabled', 'true');
      return (await fetch('/admin?/setGoogleMapsKillSwitch', { method: 'POST', body: form })).status;
    });
    expect(repeatedSubmissionStatus).toBe(200);
    const auditRecordCount = database
      .prepare(
        "select count(*) as count from technical_log_records where event_code = 'admin-google-maps-kill-switch-changed'"
      )
      .get() as { count: number };
    expect(auditRecordCount.count).toBe(1);

    await page.goto('/admin?subsystem=admin-controls');
    await expect(
      page.locator('article code').filter({ hasText: 'admin-google-maps-kill-switch-changed' })
    ).toBeVisible();
    await expect(page.getByText('Previous enabled: false')).toBeVisible();
    await expect(page.getByText('New enabled: true')).toBeVisible();
    await expect(page.getByText('Google Maps is suspended.')).toBeVisible();
  } finally {
    database.close();
  }
});
