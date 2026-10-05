import { expect } from '@playwright/test';
import { test } from './fixtures/signedInUser';

test('failed Todo reads block edits until recovery, then edits retain saved tasks', async ({ page, signedInUser: { database, userId } }) => {
  database.prepare('insert into summary_configurations (id, user_id) values (?, ?)')
    .run(`configuration-${userId}`, userId);
  database.prepare(`insert into todo_tasks (id, user_id, title, urgency, position)
    values (?, ?, 'Saved task', 'unreadable', 1)`).run(`${userId}:todo-7`, userId);
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT') writes.push(new URL(request.url()).pathname);
  });

  await page.goto('/');
  const notice = page.getByRole('status').filter({ hasText: 'could not be loaded' });
  await expect(notice).toContainText('Todo');
  await expect(page.getByLabel('New Todo Task')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'New group', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Weather\./ })).toBeEnabled();
  await page.getByLabel('Open account menu').click();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled();
  await page.getByLabel('Open account menu').click();
  expect(writes).toEqual([]);

  await page.getByRole('button', { name: 'Retry loading', exact: true }).click();
  await expect(notice).toBeVisible();
  await expect(page.getByLabel('New Todo Task')).toBeDisabled();
  database.prepare('update todo_tasks set urgency = ? where user_id = ?').run('high', userId);
  await page.getByRole('button', { name: 'Retry loading', exact: true }).click();
  const tasks = page.getByRole('list', { name: 'No Category Todo Tasks' });
  await expect(tasks.getByText('Saved task', { exact: true })).toBeVisible();
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  expect(writes).toEqual([]);

  const saved = page.waitForResponse((response) => new URL(response.url()).pathname === '/todo-state' && response.request().method() === 'PUT');
  await page.getByLabel('New Todo Task').fill('After recovery');
  await page.getByLabel('New Todo Task').press('Enter');
  await page.getByRole('dialog', { name: 'Add task' }).getByRole('button', { name: 'Confirm adding task' }).click();
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(tasks.getByText('Saved task', { exact: true })).toBeVisible();
  await expect(tasks.getByText('After recovery', { exact: true })).toBeVisible();
});
