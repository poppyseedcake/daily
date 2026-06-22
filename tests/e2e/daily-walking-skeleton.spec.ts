import { expect, test } from '@playwright/test';

test('Visitor opens Daily into the usable main panel', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Daily', exact: true })).toBeVisible();
  await expect(page.getByText('Visitor mode')).toBeVisible();
  await expect(page.getByText('Google sign-in will be required before a Daily Summary can be sent.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview Daily Summary' })).toBeVisible();
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
  await page.getByRole('radio', { name: 'Dark Theme' }).check();
  await page.getByRole('checkbox', { name: 'Summary Delivery' }).uncheck();
  await page.getByRole('checkbox', { name: 'Weather Section' }).uncheck();
  await page.getByRole('checkbox', { name: 'Todo Section' }).uncheck();

  await expect(page.getByText('Next summary: 18:45 America/New_York')).toBeVisible();
  await expect(page.getByText('Dark preview')).toBeVisible();
  await expect(page.getByText('Weather Snapshot')).not.toBeVisible();
  await expect(page.getByText('Todo Focus')).not.toBeVisible();
  await expect(page.getByText('Mock Commute')).toBeVisible();
  await expect(page.getByText('Demo Calendar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview Daily Summary' })).toBeDisabled();
});

test('Administrator route shows a minimal shell without private Visitor or User content', async ({
  page
}) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'Admin Panel' }).click();

  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
  await expect(page.getByText('Operational shell')).toBeVisible();
  await expect(page.getByText('No Visitor Local Setup or User summary content is shown here.')).toBeVisible();
  await expect(page.getByText('Demo Calendar')).not.toBeVisible();
});
