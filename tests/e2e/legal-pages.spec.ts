import { expect, test } from '@playwright/test';

test.describe('public legal pages', () => {
  test('serves the Privacy and Terms pages without authentication', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page).toHaveTitle(/Privacy Policy/);
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Terms' }).first()).toHaveAttribute('href', '/terms');
    await expect(page.getByRole('link', { name: 'daily@dailykickoff.eu' }).first()).toHaveAttribute(
      'href',
      'mailto:daily@dailykickoff.eu'
    );

    await page.goto('/terms');
    await expect(page).toHaveTitle(/Terms of Service/);
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy' }).first()).toHaveAttribute(
      'href',
      '/privacy'
    );
  });

  test('links public policy pages near the public Google sign-in action', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Sign in with Google' }).first()).toHaveAttribute(
      'href',
      '/auth/google'
    );
    await expect(page.getByRole('link', { name: 'Privacy' }).first()).toHaveAttribute(
      'href',
      '/privacy'
    );
    await expect(page.getByRole('link', { name: 'Terms' }).first()).toHaveAttribute(
      'href',
      '/terms'
    );

    await page.goto('/auth/google/confirm');
    await expect(page.getByRole('heading', { name: 'Continue to Daily' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /at least 16/i })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: /accept the Daily Terms/i })).not.toBeChecked();
    await expect(page.getByRole('link', { name: 'Daily Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy'
    );
  });
});
