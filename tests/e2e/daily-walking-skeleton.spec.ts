import { expect, test } from '@playwright/test';

const dragHandleIntoList = async (
  page: import('@playwright/test').Page,
  handle: import('@playwright/test').Locator,
  list: import('@playwright/test').Locator
) => {
  const handleBox = await handle.boundingBox();
  const listBox = await list.boundingBox();

  if (!handleBox || !listBox) {
    throw new Error('Cannot drag Todo Task without visible handle and target list boxes.');
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + Math.max(12, listBox.height / 2), {
    steps: 16
  });
  await page.waitForTimeout(150);
  await page.mouse.up();
};

test('Visitor opens Daily into the usable main panel', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Daily', exact: true })).toBeVisible();
  await expect(page.getByText('Visitor mode', { exact: true })).toBeVisible();
  await expect(page.getByText('Google sign-in will be required before a Daily Summary can be sent.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview Daily Summary' })).toBeVisible();
});

test('Visitor configures Daily Summary state from the main panel', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('textbox', { name: 'Summary Time' })).toHaveValue('07:00');
  await expect(page.getByRole('radio', { name: 'UTC' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Light Theme' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Summary Delivery' })).toBeChecked();
  await expect(page.getByText('Next summary: 07:00 UTC')).toBeVisible();

  await page.getByLabel('Summary Time').fill('18:45');
  await expect(page.getByLabel('Summary Time')).toHaveValue('18:45');
  await page.getByRole('radio', { name: 'America/New_York' }).check();
  await expect(page.getByRole('radio', { name: 'America/New_York' })).toBeChecked();
  await page.getByRole('radio', { name: 'Dark Theme' }).check();
  await expect(page.getByRole('radio', { name: 'Dark Theme' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Summary Delivery' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Summary Delivery' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Weather Section' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Weather Section' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Todo Section' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Todo Section' })).not.toBeChecked();

  await expect(page.getByText('Next summary: 18:45 America/New_York')).toBeVisible();
  await expect(page.getByText('Dark preview')).toBeVisible();
  await expect(page.getByText('Mock Weather')).not.toBeVisible();
  await expect(page.getByText('Todo source is not connected yet.')).not.toBeVisible();
  await expect(page.getByText('Mock Commute')).toBeVisible();
  await expect(page.getByText('Demo Calendar - sample Calendar Events for the Week Ahead.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview Daily Summary' })).toBeDisabled();
});

test('Visitor sees Demo Calendar content for the Week Ahead and can hide it from the preview', async ({
  page
}) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Demo Calendar' }).first()).toBeVisible();
  await expect(page.getByText('Sample Calendar Events for Visitor mode')).toBeVisible();
  await expect(page.getByText('Week Ahead', { exact: true })).toBeVisible();
  await expect(page.getByText('Planning check-in', { exact: true })).toBeVisible();
  await expect(page.getByText('Design review', { exact: true })).toBeVisible();
  await expect(page.getByText('Todo source is not connected yet.')).toBeVisible();

  await page.locator('#calendar-section').uncheck();
  await expect(page.locator('#calendar-section')).not.toBeChecked();

  await expect(page.getByRole('heading', { name: 'Demo Calendar' })).toHaveCount(0);
  await expect(page.getByText('Planning check-in')).toHaveCount(0);
  await expect(page.getByText('Todo source is not connected yet.')).toBeVisible();
});

test('Visitor creates edits and completes an active uncategorized Todo Task', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('New Todo Task').fill('Buy breakfast oats');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  await expect(page.getByRole('listitem').filter({ hasText: 'Buy breakfast oats' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit Buy breakfast oats' }).click();
  await page.getByLabel('Edit Todo Task').fill('Buy breakfast oats and fruit');
  await page.getByRole('button', { name: 'Save Todo Task' }).click();

  await expect(page.getByText('Buy breakfast oats and fruit')).toBeVisible();
  await expect(page.getByText('Buy breakfast oats', { exact: true })).not.toBeVisible();

  await page.getByRole('checkbox', { name: 'Complete Buy breakfast oats and fruit' }).click();
  await expect(page.getByText('Buy breakfast oats and fruit')).not.toBeVisible();
});

test('Visitor manages Todo Categories with urgency and confirmed deletion', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');

  await page.getByLabel('New Todo Category').fill('Home');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();
  expect(pageErrors).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

  await page.getByRole('button', { name: 'Rename Home' }).click();
  await page.getByLabel('Edit Todo Category').fill('Apartment');
  await page.getByRole('button', { name: 'Save Todo Category' }).click();
  await expect(page.getByRole('heading', { name: 'Apartment' })).toBeVisible();

  await page.getByLabel('New Todo Task').fill('Call plumber');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Apartment' });
  await page.getByLabel('Urgency', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  const apartmentTasks = page.getByRole('list', { name: 'Apartment Todo Tasks' });
  await expect(apartmentTasks.getByText('Call plumber')).toBeVisible();
  await expect(apartmentTasks.getByLabel('High urgency')).toHaveText('!');

  await page.getByLabel('New Todo Task').fill('Water plants');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Apartment' });
  await page.getByLabel('Urgency', { exact: true }).selectOption('medium');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();
  await expect(apartmentTasks.getByText('Call plumber')).toBeVisible();
  await expect(apartmentTasks.getByText('Water plants')).toBeVisible();
  await expect(apartmentTasks.getByLabel('Medium urgency')).toHaveText('!');
  await expect(apartmentTasks.locator('li').nth(0)).toContainText('Call plumber');
  await expect(apartmentTasks.locator('li').nth(1)).toContainText('Water plants');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Delete Apartment and all Todo Tasks inside it?');
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Delete Apartment' }).click();
  await expect(page.getByRole('heading', { name: 'Apartment' })).toBeVisible();
  await expect(page.getByText('Call plumber')).toBeVisible();

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete Apartment' }).click();
  await expect(page.getByRole('heading', { name: 'Apartment' })).not.toBeVisible();
  await expect(page.getByText('Call plumber')).not.toBeVisible();
  await expect(page.getByText('Water plants')).not.toBeVisible();
});

test('Visitor reorders uncategorized Todo Tasks with accessible drag controls', async ({ page }) => {
  await page.goto('/');

  for (const title of ['Plan meals', 'Buy groceries', 'Cook dinner']) {
    await page.getByLabel('New Todo Task').fill(title);
    await page.getByRole('button', { name: 'Add Todo Task' }).click();
  }

  const uncategorizedTasks = page.getByRole('list', { name: 'No Category Todo Tasks' });
  await expect(uncategorizedTasks.locator('li').nth(0)).toContainText('Plan meals');
  await expect(uncategorizedTasks.locator('li').nth(1)).toContainText('Buy groceries');
  await expect(uncategorizedTasks.locator('li').nth(2)).toContainText('Cook dinner');

  await uncategorizedTasks.getByRole('button', { name: 'Move Cook dinner' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');

  await expect(uncategorizedTasks.locator('li').nth(0)).toContainText('Cook dinner');
  await expect(uncategorizedTasks.locator('li').nth(1)).toContainText('Plan meals');
  await expect(uncategorizedTasks.locator('li').nth(2)).toContainText('Buy groceries');
});

test('Visitor reorders Todo Tasks inside a category without urgency resorting', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('New Todo Category').fill('Work');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();

  for (const [title, urgency] of [
    ['Draft update', 'low'],
    ['Review launch notes', 'high'],
    ['Send agenda', 'medium']
  ] as const) {
    await page.getByLabel('New Todo Task').fill(title);
    await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Work' });
    await page.getByLabel('Urgency', { exact: true }).selectOption(urgency);
    await page.getByRole('button', { name: 'Add Todo Task' }).click();
  }

  const workTasks = page.getByRole('list', { name: 'Work Todo Tasks' });
  await expect(workTasks.locator('li').nth(0)).toContainText('Draft update');
  await expect(workTasks.locator('li').nth(1)).toContainText('Review launch notes');
  await expect(workTasks.locator('li').nth(2)).toContainText('Send agenda');

  await workTasks.getByRole('button', { name: 'Move Send agenda' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');

  await expect(workTasks.locator('li').nth(0)).toContainText('Send agenda');
  await expect(workTasks.locator('li').nth(1)).toContainText('Draft update');
  await expect(workTasks.locator('li').nth(2)).toContainText('Review launch notes');

  await page.getByRole('button', { name: 'Edit Draft update' }).click();
  await page.getByLabel('Edit Urgency').selectOption('high');
  await page.getByRole('button', { name: 'Save Todo Task' }).click();

  await expect(workTasks.locator('li').nth(0)).toContainText('Send agenda');
  await expect(workTasks.locator('li').nth(1)).toContainText('Draft update');
  await expect(workTasks.locator('li').nth(2)).toContainText('Review launch notes');
});

test('Visitor moves Todo Tasks between categories and the uncategorized list', async ({ page }) => {
  await page.goto('/');

  for (const category of ['Work', 'Home']) {
    await page.getByLabel('New Todo Category').fill(category);
    await page.getByRole('button', { name: 'Add Todo Category' }).click();
  }

  await page.getByLabel('New Todo Task').fill('File invoice');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Work' });
  await page.getByLabel('Urgency', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  await page.getByLabel('New Todo Task').fill('Wash mugs');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Home' });
  await page.getByLabel('Urgency', { exact: true }).selectOption('medium');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  const uncategorizedTasks = page.getByRole('list', { name: 'No Category Todo Tasks' });
  const workTasks = page.getByRole('list', { name: 'Work Todo Tasks' });
  const homeTasks = page.getByRole('list', { name: 'Home Todo Tasks' });

  await dragHandleIntoList(page, workTasks.getByRole('button', { name: 'Move File invoice' }), homeTasks);
  await expect(workTasks.getByText('File invoice')).toHaveCount(0);
  await expect(homeTasks.getByRole('listitem').filter({ hasText: 'File invoice' })).toBeVisible();
  await expect(homeTasks.getByRole('listitem').filter({ hasText: 'File invoice' }).getByLabel('High urgency')).toHaveText('!');

  await homeTasks.getByRole('button', { name: 'Move Wash mugs' }).focus();
  await page.keyboard.press('Space');
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Shift+Tab');
  }
  await page.keyboard.press('Space');
  await expect(homeTasks.getByText('Wash mugs')).toHaveCount(0);
  await expect(uncategorizedTasks.getByRole('listitem').filter({ hasText: 'Wash mugs' })).toBeVisible();
  await expect(
    uncategorizedTasks.getByRole('listitem').filter({ hasText: 'Wash mugs' }).getByLabel('Medium urgency')
  ).toHaveText('!');
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
