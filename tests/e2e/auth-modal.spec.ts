import { expect, test } from '@playwright/test';

test('sign-in stays above the workspace and preserves an unfinished task', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('New Todo Task').fill('Unfinished draft');
  const trigger = page.locator('.daily-visitor-banner__action');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Welcome back' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
  await expect(dialog.locator('.daily-logo__mark')).toHaveAttribute('src', /daily-mark\.svg$/);
  await expect(dialog).not.toContainText('Google is currently the only sign-in method.');
  await expect(dialog).not.toContainText('Calendar access is optional.');
  await expect(dialog).not.toContainText('I already use Daily');
  await expect(dialog).not.toContainText('I’m new here');
  await expect(dialog).not.toContainText('Keep your setup.');
  for (let count = 0; count < 7; count++) {
    await page.keyboard.press('Tab');
    // Native dialogs may focus browser chrome at the end of the tab sequence.
    expect(await page.evaluate(() => document.activeElement === document.body || Boolean(document.activeElement?.closest('dialog:modal')))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.getByLabel('New Todo Task')).toHaveValue('Unfinished draft');
});

test('registration alone requires Terms and the native form submits the chosen intention', async ({ page }) => {
  await page.goto('/?auth=signup');
  const dialog = page.getByRole('dialog', { name: 'Create your Daily account' });
  const submit = dialog.getByRole('button', { name: 'Sign up with Google' });
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog.getByRole('checkbox')).toHaveCount(1);
  await expect(submit).toBeDisabled();
  const consent = dialog.getByRole('checkbox', { name: /accept the Terms/i });
  await consent.check();
  await expect(submit).toBeEnabled();
  let submitted: URLSearchParams | undefined;
  await page.route('**/auth/google', async route => {
    submitted = new URLSearchParams(route.request().postData() ?? '');
    await route.fulfill({ status: 303, headers: { location: '/?auth=signup&error=provider' } });
  });
  await submit.click();
  await expect(dialog.getByRole('alert')).toContainText('Try again.');
  await expect(page).toHaveURL(/\/$/);
  expect(submitted?.get('intent')).toBe('signup');
  expect(submitted?.get('termsAccepted')).toBe('on');
  expect(submitted?.has('ageConfirmed')).toBe(false);
  await expect(consent).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  const signIn = page.getByRole('dialog', { name: 'Welcome back' });
  await expect(signIn.getByRole('checkbox')).toHaveCount(0);
  await expect(signIn.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
});

test('a new identity arriving through Sign in is directed to registration', async ({ page }) => {
  await page.goto('/?auth=signin&error=signup_disabled');
  const dialog = page.getByRole('dialog', { name: 'Create your Daily account' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('No Daily account was found.');
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Sign up with Google' })).toBeDisabled();
});

test('cancelled Google sign-in returns to a usable sign-in modal', async ({ page }) => {
  await page.goto('/?auth=signin&error=access_denied');
  const dialog = page.getByRole('dialog', { name: 'Welcome back' });
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog.getByRole('alert')).toContainText('was cancelled');
  await expect(dialog.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close sign-in' }).click();
  await page.reload();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('Calendar and Settings handoffs close their previous dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Calendar. Connect Google Calendar' }).click();
  await page.getByRole('dialog', { name: 'Connect your calendar' }).getByRole('link', { name: 'Continue with Google' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Welcome back' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('link', { name: 'Sign in with Google' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Welcome back' })).toBeVisible();
});

test('registration fits a narrow screen without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/?auth=signup');
  const dialog = page.getByRole('dialog', { name: 'Create your Daily account' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Sign up with Google' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('registration remains available without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  try {
    await page.goto('/?auth=signup');
    const dialog = page.getByRole('dialog', { name: 'Create your Daily account' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('checkbox', { name: /accept the Terms/i }).check();
    await expect(dialog.getByRole('button', { name: 'Sign up with Google' })).toBeEnabled();
    await expect(dialog.locator('form')).toHaveAttribute('action', /(?:^|\/)auth\/google$/);
  } finally {
    await context.close();
  }
});
