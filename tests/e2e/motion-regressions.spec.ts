import { expect } from '@playwright/test';
import { test } from './fixtures/signedInUser';
import { createDefaultLocalSetup, localSetupStorageKey } from '../../src/lib/localSetup';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('daily.onboarding.v1', 'seen'));
});

for (const remaining of [0, 1]) {
  test(`rapid completion skips leaving rows and focuses ${remaining ? 'the remaining task' : 'New Todo Task'}`, async ({ page }) => {
    const setup = createDefaultLocalSetup();
    setup.todoTasks = (remaining ? ['Remaining task', 'Second task', 'Third task'] : ['Second task', 'Third task'])
      .map((title, index) => ({ id: `rapid-${index}`, title, categoryId: null, urgency: 'low', position: index + 1, completed: false }));
    setup.nextTodoId = 10;
    await page.addInitScript(({ key, setup }) => localStorage.setItem(key, JSON.stringify(setup)), {
      key: localSetupStorageKey, setup
    });
    await page.goto('/');
    await expect(page.getByLabel('New Todo Task')).toBeEnabled();

    const result = await page.evaluate(async () => {
      const second = document.querySelector<HTMLInputElement>('[aria-label="Complete Second task"]')!;
      const third = document.querySelector<HTMLInputElement>('[aria-label="Complete Third task"]')!;
      second.focus();
      second.click();
      await new Promise(requestAnimationFrame);
      const leaving = second.closest<HTMLElement>('li')!;
      // Pin the first exit so the next completion always occurs while that row remains inert.
      for (const animation of leaving.getAnimations()) animation.pause();
      third.click();
      await new Promise(requestAnimationFrame);
      return { leavingInert: leaving.inert, leavingConnected: leaving.isConnected, focus: document.activeElement?.getAttribute('aria-label') };
    });
    expect(result.leavingInert).toBe(true);
    expect(result.leavingConnected).toBe(true);
    expect(result.focus).toBe(remaining ? 'Complete Remaining task' : 'New Todo Task');
  });
}

test('weather suggestions tolerate duplicate provider coordinates and remain selectable', async ({ page }) => {
  await page.route('**/weather-location-search?**', route => route.fulfill({ json: {
    outcome: 'found', locations: [
      { label: 'Warsaw', latitude: 52.23, longitude: 21.01 },
      { label: 'Warsaw city centre', latitude: 52.23, longitude: 21.01 }
    ]
  } }));
  await page.goto('/');
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await page.getByRole('button', { name: /Weather\./ }).click();
  const search = page.getByRole('combobox', { name: 'City Search' });
  await search.fill('War');
  const options = page.getByRole('listbox', { name: 'Weather Location search results' }).getByRole('option');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText('Warsaw');
  await search.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Choose a city' })).toBeHidden();
  await expect(page.getByRole('button', { name: /Weather\./ })).toContainText('Warsaw');
});

test('the account menu reopens on the first click after Escape interrupts its exit', async ({ page, signedInUser }) => {
  void signedInUser;
  await page.goto('/');
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  const summary = page.getByLabel('Open account menu');
  await summary.click();
  const result = await summary.evaluate(async node => {
    const menu = node.closest<HTMLDetailsElement>('details')!;
    const panel = menu.querySelector<HTMLElement>('.daily-account-menu__panel')!;
    (node as HTMLElement).click();
    const exit = panel.getAnimations().find(animation => animation.effect?.getTiming().duration === 120)!;
    exit.pause();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const closedByEscape = !menu.open;
    (node as HTMLElement).click();
    const reopenedImmediately = menu.open;
    await Promise.all(panel.getAnimations().map(animation => animation.finished.catch(() => {})));
    return { closedByEscape, reopenedImmediately, stayedOpen: menu.open };
  });
  expect(result.closedByEscape).toBe(true);
  expect(result.reopenedImmediately).toBe(true);
  expect(result.stayedOpen).toBe(true);
});
