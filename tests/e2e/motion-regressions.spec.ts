import { expect } from '@playwright/test';
import { test } from './fixtures/signedInUser';
import { createDefaultLocalSetup, localSetupStorageKey } from '../../src/lib/localSetup';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    localStorage.setItem('daily.onboarding.v1', 'seen');
    localStorage.setItem(
      'daily.cookieConsent.v1', JSON.stringify({ analytics: 'rejected', updatedAt: Date.now() })
    );
  });
});

for (const remaining of [0, 1]) {
  test(`rapid completion skips leaving rows and focuses ${remaining ? 'the remaining task' : 'New Todo Task'}`, async ({ page }) => {
    const setup = createDefaultLocalSetup();
    setup.todoTasks = (remaining ? ['Remaining task', 'Second task', 'Third task'] : ['Second task', 'Third task'])
      .map((title, index) => ({ id: `rapid-${index}`, title, categoryId: null, urgency: 'low', position: index + 1, completed: false }));
    setup.nextTodoId = 10;
    await page.addInitScript(({ key, setup }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(setup));
    }, {
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

for (const { input, exits } of [
  { input: 'pointer', exits: 1 },
  { input: 'keyboard', exits: 1 },
  { input: 'keyboard', exits: 2 }
] as const) {
  test(`task dragging waits for completion exits and resumes afterward (${input}, ${exits} exits)`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const setup = createDefaultLocalSetup();
    setup.todoTasks = ['First task', ...(exits === 2 ? ['Another task'] : []), 'Second task', 'Third task'].map((title, index) => ({
      id: `drag-${index}`, title, categoryId: null, urgency: 'low', position: index + 1, completed: false
    }));
    setup.nextTodoId = 10;
    await page.addInitScript(({ key, setup }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(setup));
    }, {
      key: localSetupStorageKey, setup
    });
    await page.goto('/');
    await expect(page.getByLabel('New Todo Task')).toBeEnabled();
    const list = page.getByRole('list', { name: 'No Category Todo Tasks' });
    const completeAndPause = async (title: string) => page.getByRole('checkbox', { name: `Complete ${title}` }).evaluate(async checkbox => {
      (checkbox as HTMLInputElement).click();
      await new Promise(requestAnimationFrame);
      // Keep the DOM/items mismatch present for the entire attempted drag.
      const leaving = checkbox.closest('li')!;
      for (const animation of leaving.getAnimations()) animation.pause();
      for (const row of leaving.parentElement!.children) {
        if (row !== leaving && !row.hasAttribute('inert')) for (const animation of row.getAnimations()) animation.finish();
      }
    });
    await completeAndPause('First task');
    if (exits === 2) await completeAndPause('Another task');
    const handle = list.getByRole('button', { name: 'Move Third task' });
    const dragLastTaskUp = async (enabled = false) => {
      if (input === 'keyboard') {
        await handle.focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('Space');
      } else {
        const from = (await handle.boundingBox())!;
        const to = (await list.getByRole('listitem', { name: 'Second task' }).boundingBox())!;
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + from.width / 2, to.y + 2, { steps: 8 });
        if (enabled) await expect(list.locator('li').first()).toHaveClass(/daily-task--drop-placeholder/);
        // Drop only after the library has had a frame to process the pointer position.
        await page.evaluate(() => new Promise(requestAnimationFrame));
        await page.mouse.up();
      }
    };
    await dragLastTaskUp();
    expect(errors).toEqual([]);
    await expect(list.locator('li:not([inert])')).toHaveText([/Second task/, /Third task/]);
    await list.locator('li[aria-label="First task"]').evaluate(node => {
      for (const animation of node.getAnimations()) animation.play();
    });
    await expect(list.locator('li[aria-label="First task"]')).toHaveCount(0);
    if (exits === 2) {
      // One completed exit must not enable dragging while another row is still leaving.
      await dragLastTaskUp();
      expect(errors).toEqual([]);
      await expect(list.locator('li:not([inert])')).toHaveText([/Second task/, /Third task/]);
      await list.locator('li[aria-label="Another task"]').evaluate(node => {
        for (const animation of node.getAnimations()) animation.play();
      });
      await expect(list.locator('li[aria-label="Another task"]')).toHaveCount(0);
    }
    await dragLastTaskUp(true);
    await expect(list.getByRole('listitem')).toHaveText([/Third task/, /Second task/]);
    expect(errors).toEqual([]);
    await page.reload();
    await expect(list.getByRole('listitem')).toHaveText([/Third task/, /Second task/]);
  });
}
