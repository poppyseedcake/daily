import { expect, test } from '@playwright/test';

test('first visit explains Daily, then tours real features without changing setup', async ({ page }) => {
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) mutations.push(request.url());
  });
  await page.goto('/');
  const intro = page.getByRole('dialog', { name: 'Your daily summary, by email.' });
  await expect(intro).toBeVisible();
  await expect(intro.getByRole('article', { name: 'Example Daily Summary' })).toBeVisible();
  await expect(intro.locator('.welcome__intro .daily-logo img')).toHaveAttribute('src', /daily-mark\.svg$/);
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  const setup = await page.evaluate(() => localStorage.getItem('daily.visitorLocalSetup.v3'));
  await intro.getByRole('button', { name: 'Show me', exact: true }).click();
  for (const [index, title] of ['Todo', 'Weather', 'Commute', 'Calendar', 'Mail delivery'].entries()) {
    const tour = page.getByRole('dialog', { name: title, exact: true });
    await expect(tour).toBeVisible();
    await expect(tour.getByText(`${index + 1} / 5`, { exact: true })).toBeVisible();
    await tour.getByRole('button', { name: index === 4 ? 'Done' : 'Next', exact: true }).click();
  }
  await expect(page.locator('dialog.daily-onboarding')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('daily.visitorLocalSetup.v3'))).toBe(setup);
  expect(mutations).toEqual([]);
  await page.reload();
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await expect(page.locator('dialog.daily-onboarding')).toHaveCount(0);
});

test('Skip and Escape keep the intro dismissed, and Settings can replay it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('dialog', { name: 'Your daily summary, by email.' }).getByRole('button', { name: 'Skip', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await expect(page.locator('dialog.daily-onboarding')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Show me around' }).click();
  const intro = page.getByRole('dialog', { name: 'Your daily summary, by email.' });
  await expect(intro).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
  await intro.getByRole('button', { name: 'Show me', exact: true }).click();
  await page.getByRole('dialog', { name: 'Todo', exact: true }).getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('dialog', { name: 'Weather', exact: true }).getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Todo', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.daily-onboarding')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await expect(page.locator('dialog.daily-onboarding')).toHaveCount(0);
});

test.describe('mobile introduction', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('shows the actual feature above each guide without horizontal overflow', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: 'Show me', exact: true }).click();
    for (const [index, target] of ['[data-onboarding-target="todo"]', '[data-summary-section="weather"]', '[data-summary-section="commute"]', '[data-summary-section="calendar"]', '[data-onboarding-target="delivery"]'].entries()) {
      const guide = page.locator('.daily-onboarding .guide');
      await expect.poll(async () => {
        const control = await page.locator(target).boundingBox();
        const bubble = await guide.boundingBox();
        return control && bubble ? control.y >= 0 && control.y + control.height < bubble.y : false;
      }).toBe(true);
      await expect.poll(() => page.locator('dialog.daily-onboarding').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await guide.getByRole('button', { name: index === 4 ? 'Done' : 'Next', exact: true }).click();
    }
    expect(errors).toEqual([]);
  });
});

test.describe('short landscape introduction', () => {
  test.use({ viewport: { width: 844, height: 390 } });
  test('keeps each guide inside the viewport and its navigation reachable', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Show me', exact: true }).click();
    for (const [index, title] of ['Todo', 'Weather', 'Commute', 'Calendar', 'Mail delivery'].entries()) {
      const tour = page.getByRole('dialog', { name: title, exact: true });
      const guide = tour.locator('.guide');
      await expect.poll(async () => {
        const bounds = await guide.boundingBox();
        return bounds ? bounds.y >= 0 && bounds.y + bounds.height <= 390 : false;
      }).toBe(true);
      await tour.getByRole('button', { name: index === 4 ? 'Done' : 'Next', exact: true }).click();
    }
    await expect(page.locator('dialog.daily-onboarding')).toHaveCount(0);
  });
});
