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

test('failed Saved Weather Cities reads prevent replacement saves and retain cities after recovery', async ({ page, signedInUser: { database, userId } }) => {
  database.prepare('insert into summary_configurations (id, user_id) values (?, ?)')
    .run(`configuration-${userId}`, userId);
  const insertCity = database.prepare(`insert into saved_weather_cities
    (id, user_id, label, latitude, longitude, position) values (?, ?, ?, ?, ?, ?)`);
  insertCity.run(`saved-${userId}`, userId, 'Saved city', 52.2297, 21.0122, 1);
  insertCity.run(`recoverable-${userId}`, userId, 'Recoverable city', 999, 21.0067, 2);
  await page.route('/weather-location-search?**', (route) => route.fulfill({
    json: { outcome: 'found', locations: [{ label: 'New city', latitude: 50.0614, longitude: 19.9383 }] }
  }));
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname === '/saved-weather-cities') {
      writes.push(request.url());
    }
  });

  await page.goto('/');
  const notice = page.getByRole('status').filter({ hasText: 'could not be loaded' });
  await expect(notice).toContainText('Saved Weather Cities');
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await page.getByRole('button', { name: 'Weather. Choose a city' }).click();
  await page.getByLabel('City Search').fill('New city');
  const addCity = page.getByRole('button', { name: 'Add New city to Saved Weather Cities' });
  await expect(addCity).toBeDisabled();
  await expect(page.getByRole('option', { name: /New city/ })).toBeEnabled();
  // Exercise the save guard too, as if a control had accidentally been enabled.
  await addCity.evaluate((button: HTMLButtonElement) => { button.disabled = false; });
  await addCity.click();
  await page.waitForLoadState('networkidle');
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Close city picker' }).click();

  database.prepare('update saved_weather_cities set latitude = ? where id = ?')
    .run(52.2318, `recoverable-${userId}`);
  await page.getByRole('button', { name: 'Retry loading', exact: true }).click();
  await expect(notice).toHaveCount(0);
  await page.getByRole('button', { name: 'Weather. Choose a city' }).click();
  await page.getByLabel('City Search').fill('New city');
  await expect(addCity).toBeEnabled();
  expect(writes).toEqual([]);
  const saved = page.waitForResponse((response) => new URL(response.url()).pathname === '/saved-weather-cities' && response.request().method() === 'PUT');
  await addCity.click();
  expect((await saved).ok()).toBe(true);

  await page.reload();
  await page.getByRole('button', { name: 'Weather. Choose a city' }).click();
  const cities = page.getByRole('listbox', { name: 'Weather Location search results' });
  await expect(cities.getByRole('option', { name: 'Saved city', exact: true })).toBeVisible();
  await expect(cities.getByRole('option', { name: 'Recoverable city', exact: true })).toBeVisible();
  await expect(cities.getByRole('option', { name: 'New city', exact: true })).toBeVisible();
});

test('failed Saved Commute Addresses reads prevent replacement saves and retain addresses after recovery', async ({ page, signedInUser: { database, userId } }) => {
  database.prepare('insert into summary_configurations (id, user_id) values (?, ?)')
    .run(`configuration-${userId}`, userId);
  const insertAddress = database.prepare(`insert into saved_commute_addresses
    (id, user_id, label, latitude, longitude, position) values (?, ?, ?, ?, ?, ?)`);
  insertAddress.run(`saved-${userId}`, userId, 'Saved address', 52.2297, 21.0122, 1);
  insertAddress.run(`recoverable-${userId}`, userId, 'Recoverable address', 999, 21.0067, 2);
  database.prepare(`insert into commute_routes (
    id, user_id, name, origin_label, origin_latitude, origin_longitude,
    destination_label, destination_latitude, destination_longitude, days, enabled, position
  ) values (?, ?, 'Saved office', 'New address', 50.0614, 19.9383, 'Office', 52.2318, 21.0067, '["monday"]', 1, 1)`)
    .run(`route-${userId}`, userId);
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname === '/saved-commute-addresses') {
      writes.push(request.url());
    }
  });

  await page.goto('/');
  const notice = page.getByRole('status').filter({ hasText: 'could not be loaded' });
  await expect(notice).toContainText('Saved Commute Addresses');
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await page.getByRole('button', { name: 'Commute. 1 route' }).click();
  await page.getByRole('dialog', { name: 'Your routes' }).getByRole('button', { name: /Saved office/ }).click();
  await expect(page.getByLabel('Route Name')).toBeEnabled();
  const addAddress = page.getByRole('button', { name: 'Add New address to Saved Commute Addresses' });
  await expect(addAddress).toBeDisabled();
  // Exercise the save guard too, as if a control had accidentally been enabled.
  await addAddress.evaluate((button: HTMLButtonElement) => { button.disabled = false; });
  await addAddress.click();
  await page.waitForLoadState('networkidle');
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Close route editor' }).click();

  database.prepare('update saved_commute_addresses set latitude = ? where id = ?')
    .run(52.2318, `recoverable-${userId}`);
  await page.getByRole('button', { name: 'Retry loading', exact: true }).click();
  await expect(notice).toHaveCount(0);
  await page.getByRole('button', { name: 'Commute. 1 route' }).click();
  await page.getByRole('dialog', { name: 'Your routes' }).getByRole('button', { name: /Saved office/ }).click();
  await expect(addAddress).toBeEnabled();
  expect(writes).toEqual([]);
  const saved = page.waitForResponse((response) => new URL(response.url()).pathname === '/saved-commute-addresses' && response.request().method() === 'PUT');
  await addAddress.click();
  expect((await saved).ok()).toBe(true);

  await page.reload();
  await page.getByRole('button', { name: 'Commute. 1 route' }).click();
  await page.getByRole('dialog', { name: 'Your routes' }).getByRole('button', { name: /Saved office/ }).click();
  await page.getByLabel('Commute Destination Search').fill('');
  const addresses = page.getByRole('listbox', { name: 'Commute Destination Saved Commute Addresses' });
  await expect(addresses.getByRole('option', { name: 'Saved address Saved Commute Address', exact: true })).toBeVisible();
  await expect(addresses.getByRole('option', { name: 'Recoverable address Saved Commute Address', exact: true })).toBeVisible();
  await expect(addresses.getByRole('option', { name: 'New address Saved Commute Address', exact: true })).toBeVisible();
});
