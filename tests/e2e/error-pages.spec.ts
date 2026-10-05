import { expect } from '@playwright/test';
import { test } from './fixtures/signedInUser';

test('an unknown address returns the Daily 404 page and offers a route home', async ({ page }) => {
  const response = await page.goto('/this/route/does-not-exist');

  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle('Page not found · Daily');
  await expect(page.getByRole('heading', { name: 'A page out of place.' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.getByRole('link', { name: 'Daily home' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute('href', '/privacy');
  await expect(page.getByRole('link', { name: 'Terms', exact: true })).toHaveAttribute('href', '/terms');
  await expect.poll(() => page.getByRole('link', { name: 'Daily home' }).locator('img').evaluate(
    (image: HTMLImageElement) => image.complete && image.naturalWidth > 0
  )).toBe(true);

  await page.getByRole('link', { name: 'Go to Daily', exact: true }).click();
  await expect(page.getByLabel('New Todo Task')).toBeVisible();
});

test('a failed page load shows the 500 state without diagnostics and retry recovers', async ({ page }) => {
  await page.route((url) => url.pathname === '/__data.json', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify('Private server diagnostics must never appear in Daily.')
    });
  });
  await page.goto('/prototype/error-pages?status=500#ready');
  // The fragment enters this link after hydration; wait before exercising client navigation.
  await expect(page.getByRole('link', { name: 'Try again', exact: true })).toHaveAttribute(
    'href', '/prototype/error-pages?status=500#ready'
  );
  await page.getByRole('link', { name: 'Back to Daily', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Daily, on pause.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Error 500' })).toBeVisible();
  await expect(page).toHaveTitle('Something went wrong · Daily');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('body')).not.toContainText('Private server diagnostics');
  await expect(page.getByRole('link', { name: 'Back to Daily', exact: true })).toHaveAttribute('href', '/');

  await page.unrouteAll();
  const reload = page.waitForResponse((response) =>
    response.request().isNavigationRequest() && new URL(response.url()).pathname === '/'
  );
  await page.getByRole('link', { name: 'Try again', exact: true }).click();
  expect((await reload).status()).toBe(200);
  await expect(page.getByLabel('New Todo Task')).toBeVisible();
});

test('retry makes a document request and keeps the address, query and fragment', async ({ page }) => {
  const address = '/prototype/error-pages?status=500&section=weather#summary';
  await page.goto(address);
  await expect(page.getByRole('heading', { name: 'Daily, on pause.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try again', exact: true })).toHaveAttribute('href', address);
  const reload = page.waitForResponse((response) =>
    response.request().isNavigationRequest() &&
    new URL(response.url()).pathname === '/prototype/error-pages'
  );

  await page.getByRole('link', { name: 'Try again', exact: true }).click();

  expect((await reload).status()).toBe(200);
  await expect(page).toHaveURL(/status=500&section=weather#summary$/);
  await expect(page.getByRole('heading', { name: 'Daily, on pause.' })).toBeVisible();
});

test.describe('small screens', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  for (const [status, heading, action] of [
    [404, 'A page out of place.', 'Go to Daily'],
    [500, 'Daily, on pause.', 'Try again']
  ] as const) {
    test(`${status} keeps the recovery action reachable without sideways scrolling`, async ({ page }) => {
      await page.goto(`/prototype/error-pages?status=${status}`);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      const recovery = page.getByRole('link', { name: action, exact: true });
      await expect(recovery).toBeInViewport();
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.scrollWidth <= window.innerWidth
      )).toBe(true);
      await recovery.focus();
      await expect(recovery).toBeFocused();
    });
  }
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('404 remains readable and the route home works', async ({ page }) => {
    const response = await page.goto('/this-page-is-missing');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'A page out of place.' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to Daily', exact: true }).click();
    await expect(page.getByLabel('New Todo Task')).toBeVisible();
  });

  test('a real server failure returns 500 without diagnostics and retry recovers', async ({
    page, signedInUser: { database, userId }
  }) => {
    const address = '/?section=weather';
    const diagnostic = 'private-error-page-session-diagnostic';
    const trigger = `error_page_session_failure_${userId.replaceAll('-', '_')}`;
    // The fixture's session is due for renewal. Fail only this User's server-side renewal.
    database.exec(`CREATE TRIGGER "${trigger}" BEFORE UPDATE ON auth_session
      WHEN OLD.user_id = '${userId.replaceAll("'", "''")}'
      BEGIN SELECT RAISE(ABORT, '${diagnostic}'); END;`);

    try {
      const response = await page.goto(address);
      expect(response?.status()).toBe(500);
      expect(await response!.text()).not.toContain(diagnostic);
      await expect(page.getByRole('heading', { name: 'Daily, on pause.' })).toBeVisible();
      await expect(page).toHaveTitle('Something went wrong · Daily');
      const robots = page.locator('head meta[name="robots"]');
      await expect(robots).toHaveCount(1);
      await expect(robots).toHaveAttribute('content', 'noindex, nofollow');
      await expect(page.locator('body')).not.toContainText(diagnostic);
      const retry = page.getByRole('link', { name: 'Try again', exact: true });
      await expect(retry).toHaveAttribute('href', address);
      await expect(page.getByRole('link', { name: 'Back to Daily', exact: true })).toHaveAttribute('href', '/');

      database.exec(`DROP TRIGGER "${trigger}"`);
      const reload = page.waitForResponse((response) =>
        response.request().isNavigationRequest() &&
        new URL(response.url()).pathname === '/' &&
        new URL(response.url()).search === '?section=weather'
      );
      await retry.click();
      expect((await reload).status()).toBe(200);
      await expect(page).toHaveURL(/\/\?section=weather$/);
      await expect(page.getByLabel('New Todo Task')).toBeVisible();
      await expect(robots).toHaveCount(0);
    } finally {
      database.exec(`DROP TRIGGER IF EXISTS "${trigger}"`);
    }
  });
});

test('404 keeps the displaced shape clear of the logo on short mobile screens', async ({ page }) => {
  for (const viewport of [{ width: 320, height: 480 }, { width: 375, height: 400 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/prototype/error-pages?status=404');
    await expect(page.getByRole('heading', { name: 'A page out of place.' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await expect.poll(async () => {
      const logo = await page.getByRole('link', { name: 'Daily home' }).boundingBox();
      const shape = await page.locator('.error-page__visual path[transform]').boundingBox();
      return logo && shape ? shape.y >= logo.y + logo.height : false;
    }).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    const home = page.getByRole('link', { name: 'Go to Daily', exact: true });
    await home.scrollIntoViewIfNeeded();
    await expect(home).toBeInViewport();
  }
});
