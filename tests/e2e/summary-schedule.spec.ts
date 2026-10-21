import { expect } from '@playwright/test';
import { test } from './fixtures/signedInUser';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('daily.onboarding.v1', 'seen');
  });
  await page.reload();
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
});

test('Visitor can save weekday times, cancel edits, and return to a shared time', async ({ page }) => {
  await page.getByRole('button', { name: /Mail delivery/ }).click();
  const delivery = page.getByRole('dialog', { name: 'Delivery time' });
  const perDay = delivery.getByRole('checkbox', { name: 'Set a different time for each day' });
  await expect(perDay).toBeVisible({ timeout: 3000 });
  await expect(perDay).not.toBeChecked();
  await delivery.getByRole('spinbutton', { name: 'Hours' }).press('ArrowUp');
  await perDay.check();
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    await expect(delivery.getByLabel(`${day} delivery time`)).toHaveValue('08:00');
  }
  await delivery.getByLabel('Monday delivery time').fill('06:30');
  await delivery.getByLabel('Saturday delivery time').fill('10:15');
  await delivery.getByRole('button', { name: 'Save delivery time' }).click();
  await expect(delivery).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Mail delivery/ })).toContainText('Varies by day');

  await page.reload();
  await page.getByRole('button', { name: /Mail delivery/ }).click();
  await expect(perDay).toBeChecked();
  await expect(delivery.getByLabel('Monday delivery time')).toHaveValue('06:30');
  await expect(delivery.getByLabel('Saturday delivery time')).toHaveValue('10:15');
  await delivery.getByLabel('Monday delivery time').fill('12:00');
  await delivery.getByRole('button', { name: 'Cancel delivery time' }).click();
  await page.getByRole('button', { name: /Mail delivery/ }).click();
  await expect(delivery.getByLabel('Monday delivery time')).toHaveValue('06:30');

  await perDay.uncheck();
  await expect(delivery.getByRole('spinbutton', { name: 'Hours' })).toHaveAttribute('aria-valuenow', '8');
  await delivery.getByRole('button', { name: 'Save delivery time' }).click();
  await page.reload();
  await page.getByRole('button', { name: /Mail delivery/ }).click();
  await expect(perDay).not.toBeChecked();
  await expect(delivery.getByRole('spinbutton', { name: 'Hours' })).toHaveAttribute('aria-valuenow', '8');
});

test('User saves weekday times on the server and keeps them after a reload', async ({ page, signedInUser }) => {
  await page.goto('/');
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await page.getByRole('button', { name: /Mail delivery/ }).click();
  const delivery = page.getByRole('dialog', { name: 'Delivery time' });
  await delivery.getByRole('checkbox', { name: 'Set a different time for each day' }).check();
  await delivery.getByLabel('Sunday delivery time').fill('11:45');
  await delivery.getByRole('button', { name: 'Edit time zone' }).click();
  await delivery.getByLabel('User Time Zone').selectOption('America/New_York');
  const saved = page.waitForResponse((response) =>
    response.url().endsWith('/summary-configuration') && response.request().method() === 'PUT'
  );
  await delivery.getByRole('button', { name: 'Save delivery time' }).click();
  expect((await saved).status()).toBe(200);

  await page.evaluate(() => localStorage.removeItem('daily.visitorLocalSetup.v3'));
  await page.reload();
  await page.getByRole('button', { name: /Mail delivery/ }).click();
  await expect(delivery.getByRole('checkbox', { name: 'Set a different time for each day' })).toBeChecked();
  await expect(delivery.getByLabel('Sunday delivery time')).toHaveValue('11:45');
  await expect(delivery).toContainText('America/New_York');
});

test('weekday times remain usable on a narrow screen and reject an empty time', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole('button', { name: /Mail delivery/ }).click();
  const delivery = page.getByRole('dialog', { name: 'Delivery time' });
  await delivery.getByRole('checkbox', { name: 'Set a different time for each day' }).check();
  await delivery.getByLabel('Sunday delivery time').fill('');
  await expect(delivery.getByRole('button', { name: 'Save delivery time' })).toBeDisabled();
  await delivery.getByLabel('Sunday delivery time').fill('23:59');
  await delivery.getByRole('button', { name: 'Save delivery time' }).click();
  await page.getByRole('button', { name: /Mail delivery/ }).click();
  await expect(delivery.getByLabel('Sunday delivery time')).toHaveValue('23:59');
  await expect(delivery.getByLabel('Monday delivery time')).toBeFocused();
  const bounds = await delivery.boundingBox();
  expect(bounds).toMatchObject({ width: expect.any(Number) });
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
});
