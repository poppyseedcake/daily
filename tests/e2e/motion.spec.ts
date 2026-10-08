import { expect, test, type Page } from '@playwright/test';

async function seedWorkspace(page: Page) {
  await page.addInitScript(() => localStorage.setItem('daily.onboarding.v1', 'seen'));
  await page.goto('/');
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await page.evaluate(() => {
    const key = 'daily.visitorLocalSetup.v3';
    const setup = JSON.parse(localStorage.getItem(key)!);
    setup.summaryConfiguration.summaryTime = '23:59';
    setup.todoTasks = ['First task', 'Second task', 'Third task'].map((title, index) => ({
      id: `motion-task-${index}`, title, categoryId: null, urgency: 'low', position: index + 1, completed: false
    }));
    setup.nextTodoId = 10;
    setup.savedCommuteAddresses = [{ label: 'Home', latitude: 52.23, longitude: 21.01 }];
    localStorage.setItem(key, JSON.stringify(setup));
  });
  await page.reload();
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
}

test.beforeEach(async ({ page }) => seedWorkspace(page));

test('completion persists immediately, visibly collapses the row, and keeps keyboard focus', async ({ page }) => {
  const result = await page.getByRole('checkbox', { name: 'Complete First task' }).evaluate(async input => {
    (input as HTMLInputElement).focus();
    (input as HTMLInputElement).click();
    await new Promise(requestAnimationFrame);
    const row = document.querySelector<HTMLElement>('li[aria-label="First task"]');
    const setup = JSON.parse(localStorage.getItem('daily.visitorLocalSetup.v3')!);
    return {
      persisted: setup.todoTasks.some((task: { title: string }) => task.title === 'First task'),
      retained: Boolean(row),
      completing: row?.dataset.completing,
      checkmarkOpacity: row && getComputedStyle(row.querySelector('.daily-task-checkbox svg')!).opacity
    };
  });
  expect(result.persisted).toBe(false);
  expect(result.retained).toBe(true);
  expect(result.completing).toBe('true');
  expect(result.checkmarkOpacity).toBe('1');
  await expect(page.locator('li[aria-label="First task"]')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Complete Second task' })).toBeFocused();
  await page.reload();
  await expect(page.getByText('First task', { exact: true })).toHaveCount(0);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`clock wraps in both directions and survives interrupted changes (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await expect.poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(reducedMotion === 'reduce');
    await page.getByRole('button', { name: /Mail delivery/ }).click();
    const delivery = page.getByRole('dialog', { name: 'Delivery time' });
    const hours = delivery.getByRole('spinbutton', { name: 'Hours' });
    const minutes = delivery.getByRole('spinbutton', { name: 'Minutes' });
    await hours.press('ArrowUp');
    await expect(hours).toHaveAttribute('aria-valuenow', '0');
    await hours.press('ArrowDown');
    await expect(hours).toHaveAttribute('aria-valuenow', '23');
    await minutes.focus();
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown']) await minutes.press(key);
    await expect(minutes).toHaveAttribute('aria-valuenow', '0');
    // Both visible reels must settle on the current value, including the 59 → 00 wrap.
    await expect.poll(() => minutes.evaluate(node => [...node.querySelectorAll<HTMLElement>('.digit-reel')].map(reel => {
      const position = -new DOMMatrixReadOnly(getComputedStyle(reel).transform).m42 / parseFloat(getComputedStyle(reel).fontSize);
      return Math.round(position) % 10;
    }))).toEqual([0, 0]);
    if (reducedMotion === 'reduce') {
      expect(await minutes.evaluate(node => [...node.querySelectorAll('.digit-reel')].flatMap(reel => reel.getAnimations()).filter(animation => animation.playState === 'running').length)).toBe(0);
    }
    await delivery.getByRole('button', { name: 'Save delivery time' }).click();
    await expect(delivery).toBeHidden();
    await expect(page.getByRole('button', { name: /Mail delivery/ })).toContainText('23:00');
    await page.reload();
    await expect(page.getByRole('button', { name: /Mail delivery/ })).toContainText('23:00');
  });
}

test('new queries keep the panel mounted while stale options become unavailable', async ({ page }) => {
  await page.route('**/weather-location-search?**', async route => route.fulfill({ json: {
    outcome: 'found', locations: [{ label: 'Warsaw', latitude: 52.23, longitude: 21.01 }]
  } }));
  await page.getByRole('button', { name: /Weather\./ }).click();
  const search = page.getByRole('combobox', { name: 'City Search' });
  await search.fill('War');
  await expect(page.getByRole('option', { name: /Warsaw/ })).toBeVisible();
  await page.locator('#weather-location-suggestions').evaluate(node => { node.setAttribute('data-preserved', 'yes'); });
  await search.fill('Wars');
  await expect(page.locator('#weather-location-suggestions')).toHaveAttribute('data-preserved', 'yes');
  await expect(page.getByRole('option', { name: /Warsaw/ })).toHaveCount(0);
  await expect(page.getByRole('option', { name: /Warsaw/ })).toBeVisible();
  const star = page.getByRole('button', { name: 'Add Warsaw to Saved Weather Cities' });
  await star.click();
  await expect(page.getByRole('button', { name: 'Remove Warsaw from Saved Weather Cities' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close city picker' }).click();
  await page.getByRole('button', { name: /Weather\./ }).click();
  await page.getByRole('button', { name: 'Remove Warsaw from Saved Weather Cities' }).click();
  await expect(search).toBeFocused();
  await expect(page.getByText('No Saved Weather Cities yet')).toBeVisible();
});

test('Escape dismisses an in-flight Commute search without the late response reopening it', async ({ page }) => {
  await page.route('**/commute-point-search?**', async route => {
    await new Promise(resolve => setTimeout(resolve, 180));
    await route.fulfill({ json: { outcome: 'available', suggestions: [{ placeId: 'home', label: 'Home' }] } });
  });
  await page.getByRole('button', { name: /Commute\./ }).click();
  await page.getByRole('button', { name: 'Add route', exact: true }).click();
  const input = page.getByRole('combobox', { name: 'Commute Origin Search' });
  await input.focus();
  await expect(page.getByRole('option', { name: 'Home Saved Commute Address' })).toBeVisible();
  await input.fill('Home');
  await expect(page.locator('#commute-origin-suggestions')).toHaveCount(1);
  await page.waitForRequest('**/commute-point-search?**');
  await input.press('Escape');
  await expect(page.locator('#commute-origin-suggestions')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Add route' })).toBeHidden();
});

for (const width of [390, 1280]) {
  test(`weekday selection and the clock fit the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: /Commute\./ }).click();
    await page.getByRole('button', { name: 'Add route', exact: true }).click();
    const monday = page.getByRole('button', { name: 'Monday route day' });
    await monday.click();
    await expect(monday).toHaveAttribute('aria-pressed', 'false');
    await monday.click();
    await expect(monday).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Saturday route day' }).click();
    await expect(page.getByRole('button', { name: 'Saturday route day' })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `output/browser-verification/motion-weekdays-${width}.png` });
    await page.getByRole('button', { name: 'Close route editor' }).click();
    await page.getByRole('button', { name: /Mail delivery/ }).click();
    const hours = page.getByRole('spinbutton', { name: 'Hours' });
    await hours.press('ArrowUp');
    await expect(hours).toHaveAttribute('aria-valuenow', '0');
    await expect.poll(() => page.locator('.digit-reel').evaluateAll(nodes => nodes.every(node => node.getAnimations().every(animation => animation.playState !== 'running')))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: `output/browser-verification/motion-clock-${width}.png` });
  });
}
