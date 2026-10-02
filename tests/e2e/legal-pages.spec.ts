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
    await page.getByRole('dialog', { name: 'Your daily summary, by email.' }).getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Sign in with Google' }).first()).toHaveAttribute(
      'href',
      '/?auth=signin'
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
    const dialog = page.getByRole('dialog', { name: 'Create your Daily account' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox')).toHaveCount(1);
    await expect(dialog.getByRole('checkbox', { name: /accept the Terms/i })).not.toBeChecked();
    await expect(dialog.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });
});
