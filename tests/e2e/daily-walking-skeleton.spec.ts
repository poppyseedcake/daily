import { expect, test } from '@playwright/test';

test('Visitor opens Daily into the usable main panel', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Daily', exact: true })).toBeVisible();
  await expect(page.getByText('Visitor mode')).toBeVisible();
  await expect(page.getByText('Google sign-in will be required before a Daily Summary can be sent.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview Daily Summary' })).toBeVisible();
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
