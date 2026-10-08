import { expect, test } from '@playwright/test';

const consentKey = 'daily.cookieConsent.v1';

// Exercise collection as a normal browser while keeping PostHog's bot filtering enabled.
test.use({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('daily.onboarding.v1', 'seen');
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
  });
});

test('analytics stays off before a choice, after rejection, and on later visits', async ({ page }) => {
  const analyticsRequests: string[] = [];
  page.on('request', request => {
    if (request.url().startsWith('http://127.0.0.1:9/')) analyticsRequests.push(request.url());
  });
  await page.goto('/');
  const banner = page.getByRole('region', { name: 'Your privacy, your choice' });
  await expect(banner).toBeVisible();
  await page.getByLabel('New Todo Task').fill('Private task without analytics');
  await page.getByLabel('New Todo Task').press('Enter');
  await expect(page.getByText('Private task without analytics', { exact: true })).toBeVisible();
  await banner.getByRole('button', { name: 'Reject analytics' }).click();
  await expect(banner).toBeHidden();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).analytics, consentKey)).toBe('rejected');
  await page.reload();
  await expect(banner).toBeHidden();
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  expect(await page.context().cookies()).toEqual(expect.not.arrayContaining([expect.objectContaining({ name: expect.stringMatching(/^ph_/) })]));
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('ph_')))).toEqual([]);
  expect(analyticsRequests).toEqual([]);
});

test('accepting starts analytics, settings withdraw it, and another acceptance works', async ({ page }) => {
  const analyticsRequests: string[] = [];
  await page.route('http://127.0.0.1:9/**', async route => {
    analyticsRequests.push(route.request().url());
    if (route.request().url().endsWith('.js')) {
      await route.fulfill({ contentType: 'text/javascript', body: '' });
    } else {
      await route.fulfill({ contentType: 'application/json', body: '{"status":1,"config":{}}' });
    }
  });
  await page.goto('/privacy?code=private-oauth-code#cookies');
  const banner = page.getByRole('region', { name: 'Your privacy, your choice' });
  await banner.getByRole('button', { name: 'Accept analytics' }).click();
  await expect(banner).toBeHidden();
  await expect.poll(async () => (await page.context().cookies()).some(cookie => cookie.name.startsWith('ph_'))).toBe(true);
  await expect.poll(() => analyticsRequests.some(url => new URL(url).pathname === '/e/')).toBe(true);

  await page.getByRole('contentinfo').getByRole('button', { name: 'Cookie settings' }).click();
  await expect(banner).toContainText('Analytics is currently on.');
  await banner.getByRole('button', { name: 'Reject analytics' }).click();
  await expect(banner).toBeHidden();
  await expect.poll(async () => (await page.context().cookies()).some(cookie => cookie.name.startsWith('ph_'))).toBe(false);
  const requestsAfterRejection = analyticsRequests.length;
  await page.getByRole('navigation').getByRole('link', { name: 'Terms', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Terms of Service', exact: true })).toBeVisible();
  expect(analyticsRequests).toHaveLength(requestsAfterRejection);
  await page.reload();
  await expect(banner).toBeHidden();
  expect(analyticsRequests).toHaveLength(requestsAfterRejection);

  await page.getByRole('contentinfo').getByRole('button', { name: 'Cookie settings' }).click();
  await expect(banner).toContainText('Analytics is currently off.');
  await banner.getByRole('button', { name: 'Accept analytics' }).click();
  await expect.poll(async () => (await page.context().cookies()).some(cookie => cookie.name.startsWith('ph_'))).toBe(true);
});

test('a choice in another tab updates this tab', async ({ page, context }) => {
  await page.goto('/terms');
  const other = await context.newPage();
  await other.goto('/privacy');
  await other.getByRole('button', { name: 'Reject analytics' }).click();
  await expect(page.getByRole('region', { name: 'Your privacy, your choice' })).toBeHidden();
});

test('expired consent asks again and does not start tracking', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({
    analytics: 'accepted', updatedAt: Date.now() - 181 * 24 * 60 * 60 * 1000
  })), consentKey);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().startsWith('http://127.0.0.1:9/')) requests.push(request.url()); });
  await page.goto('/terms');
  await expect(page.getByRole('region', { name: 'Your privacy, your choice' })).toBeVisible();
  expect(requests).toEqual([]);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`cookie controls fit and work at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/terms');
    const banner = page.getByRole('region', { name: 'Your privacy, your choice' });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Accept analytics' })).toBeInViewport({ ratio: 1 });
    await expect(banner.getByRole('button', { name: 'Reject analytics' })).toBeInViewport({ ratio: 1 });
    expect(await banner.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await banner.getByRole('button', { name: 'Reject analytics' }).click();
    await page.getByRole('contentinfo').getByRole('button', { name: 'Cookie settings' }).click();
    await expect(banner).toBeFocused();
    await banner.getByRole('button', { name: 'Keep current choice' }).click();
    await expect(page.getByRole('contentinfo').getByRole('button', { name: 'Cookie settings' })).toBeFocused();
  });
}
