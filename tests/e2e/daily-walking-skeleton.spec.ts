import { expect, test, type Locator, type Page } from '@playwright/test';

const tabUntilDropTargetActive = async (
  page: Page,
  target: Locator,
  options: { direction?: 'forward' | 'backward'; maxTabs?: number } = {}
) => {
  const direction = options.direction ?? 'forward';
  const maxTabs = options.maxTabs ?? 20;
  const key = direction === 'forward' ? 'Tab' : 'Shift+Tab';

  for (let index = 0; index < maxTabs; index += 1) {
    if (
      await target.evaluate(
        (element) =>
          element.getAttribute('aria-describedby') === 'dnd-zone-active' &&
          element.contains(document.activeElement)
      )
    ) {
      await expect(target).toHaveAttribute('aria-describedby', 'dnd-zone-active');
      return;
    }

    await page.keyboard.press(key);
  }

  await expect(target).toHaveAttribute('aria-describedby', 'dnd-zone-active');
};

const dragTodoHandleToTarget = async ({
  page,
  sourceHandle,
  target,
  targetPosition
}: {
  page: Page;
  sourceHandle: Locator;
  target: Locator;
  targetPosition?: { x: number; y: number };
}) => {
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await target.boundingBox();

  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  if (!sourceBox || !targetBox) {
    return;
  }

  await sourceHandle.dragTo(target, {
    force: true,
    targetPosition: targetPosition ?? {
      x: targetBox.width / 2,
      y: targetBox.height / 2
    }
  });
};

const localDateForTimeZone = (timeZone: string) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

const stubOpenMeteoForecast = async (page: Page) => {
  await page.route('https://api.open-meteo.com/v1/forecast?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        daily: {
          time: [localDateForTimeZone('Europe/Warsaw')],
          weather_code: [61],
          temperature_2m_min: [12],
          temperature_2m_max: [19],
          precipitation_probability_max: [80]
        }
      })
    });
  });
};

test('Visitor opens Daily into the usable main panel', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Daily', exact: true })).toBeVisible();
  await expect(page.getByText('Visitor mode', { exact: true })).toBeVisible();
  await expect(page.getByText('Google sign-in will be required before a Daily Summary can be sent.')).toBeVisible();
  await expect(page.getByText('Local Setup is saved in this browser only.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in with Google' })).toHaveAttribute(
    'href',
    '/auth/google'
  );
  await expect(page.getByText('Google Calendar')).not.toBeVisible();
  await expect(page.getByText('Connect Google Calendar')).not.toBeVisible();
  await expect(page.getByText('Selected Calendar')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview Daily Summary' })).toBeVisible();
});

test('Visitor can preview but cannot send or view Delivery Records', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Preview Daily Summary' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send Test Daily Summary' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Delivery History' })).toHaveCount(0);
  await expect(page.getByText('No Delivery Records in the last 30 days.')).toHaveCount(0);
  await expect(
    page.getByText('Google sign-in is required before a test Daily Summary can be sent.')
  ).toBeVisible();
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
  await expect(page.getByText('Mock Commute')).toHaveCount(0);
  await expect(page.getByText('Demo Calendar - sample Calendar Events for the Week Ahead.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview Daily Summary' })).toBeDisabled();
});

test('Visitor Summary Configuration persists after page refresh', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Summary Time').fill('18:45');
  await page.getByRole('radio', { name: 'America/New_York' }).check();
  await page.getByRole('radio', { name: 'Dark Theme' }).check();
  await page.getByRole('checkbox', { name: 'Summary Delivery' }).uncheck();
  await page.getByRole('checkbox', { name: 'Weather Section' }).uncheck();
  await page.getByRole('checkbox', { name: 'Todo Section' }).uncheck();

  await page.reload();

  await expect(page.getByLabel('Summary Time')).toHaveValue('18:45');
  await expect(page.getByRole('radio', { name: 'America/New_York' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Dark Theme' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Summary Delivery' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Weather Section' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Todo Section' })).not.toBeChecked();
  await expect(page.getByText('Next summary: 18:45 America/New_York')).toBeVisible();
  await expect(page.getByText('Dark preview')).toBeVisible();
  await expect(page.getByText('Mock Weather')).not.toBeVisible();
  await expect(page.getByText('Todo source is not connected yet.')).not.toBeVisible();
});

test('Visitor Weather Location persists after page refresh', async ({ page }) => {
  await stubOpenMeteoForecast(page);
  await page.goto('/');

  await expect(page.getByText('Choose a Weather Location to preview live weather.')).toBeVisible();
  await expect(page.getByText('Mock Weather')).not.toBeVisible();
  await expect(page.getByText('Saved in this browser only', { exact: true })).toBeVisible();
  await expect(page.getByLabel('City Search')).toBeEnabled();
  await page.getByLabel('City Search').fill('Warsaw');
  await expect(page.getByLabel('City Search')).toHaveValue('Warsaw');
  await page.getByRole('button', { name: 'Search' }).click();
  await page
    .getByRole('list', { name: 'Weather Location search results' })
    .getByRole('button', { name: 'Select' })
    .first()
    .click();

  await expect(page.getByText('Weather Location saved in this browser only.')).toBeVisible();
  await expect(page.getByText('Warsaw, Masovian Voivodeship, Poland')).toBeVisible();
  await expect(
    page.getByText('Rainy. Low 12C, high 19C. Chance of precipitation 80%.')
  ).toBeVisible();
  await expect(page.getByText('Mock Weather')).not.toBeVisible();

  await page.reload();

  await expect(page.getByText('Warsaw, Masovian Voivodeship, Poland')).toBeVisible();
  await expect(page.getByText('52.2297, 21.0122')).toBeVisible();
  await expect(
    page.getByText('Rainy. Low 12C, high 19C. Chance of precipitation 80%.')
  ).toBeVisible();
});

test('Visitor manages ordered Commute Routes and Commute Days in browser-local setup', async ({ page }) => {
  const pointSelections: Array<{ latitude: number; longitude: number }> = [];
  await page.route('/commute-point-selection', async (route) => {
    const request = route.request().postDataJSON() as { latitude: number; longitude: number };
    pointSelections.push(request);
    const origin = request.latitude === 50;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        outcome: 'available',
        point: origin
          ? {
              label: 'Origin point',
              ...request
            }
          : {
              label: 'Destination point',
              ...request
            }
      })
    });
  });
  await page.goto('/');

  await page.getByLabel('Route Name').fill('Morning commute');
  await page.getByLabel('Origin latitude').fill('50');
  await page.getByLabel('Origin longitude').fill('19');
  await page.getByLabel('Destination latitude').fill('51');
  await page.getByLabel('Destination longitude').fill('20');
  await page.getByRole('button', { name: 'Select' }).first().click();
  await page.getByRole('button', { name: 'Select' }).nth(1).click();
  await page.getByRole('button', { name: 'Add Commute Route' }).click();

  await expect(page.getByText('Commute Route saved in this browser only.')).toBeVisible();
  await expect(page.getByText('Morning commute', { exact: true })).toBeVisible();
  await expect(page.getByText('No Weather Location selected')).toBeVisible();

  await page.getByRole('button', { name: 'Disable Morning commute' }).click();
  await expect(page.getByText('Disabled', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Morning commute' }).click();
  await page.getByLabel('Route Name').fill('Evening commute');
  await page.getByRole('button', { name: 'Save Commute Route' }).click();
  await expect(page.getByText('Commute Route updated in this browser only.')).toBeVisible();
  await expect(page.getByText('Evening commute', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable Evening commute' })).toBeVisible();

  for (const routeName of ['Route two', 'Route three', 'Route four', 'Route five']) {
    await page.getByLabel('Route Name').fill(routeName);
    await page.getByLabel('Origin latitude').fill('50');
    await page.getByLabel('Origin longitude').fill('19');
    await page.getByLabel('Destination latitude').fill('51');
    await page.getByLabel('Destination longitude').fill('20');
    await page.getByRole('button', { name: 'Select' }).first().click();
    await page.getByRole('button', { name: 'Select' }).nth(1).click();
    await page.getByRole('button', { name: 'Add Commute Route' }).click();
  }

  const savedRoutes = page.locator('[aria-label="Saved Commute Routes"]');
  await expect(savedRoutes.getByText('Evening commute', { exact: true })).toBeVisible();
  await expect(savedRoutes.getByText('Route two', { exact: true })).toBeVisible();
  await expect(savedRoutes.getByText('Route five', { exact: true })).toBeVisible();
  await expect(savedRoutes.locator('> div')).toHaveCount(5);

  await page.getByLabel('Route Name').fill('Route six');
  await page.getByRole('button', { name: 'Add Commute Route' }).click();
  await expect(page.getByText('You can save at most five Commute Routes.')).toBeVisible();

  await page.getByLabel('Monday Commute Day').uncheck();
  await page.getByLabel('Sunday Commute Day').check();
  await page.getByRole('button', { name: 'Delete Route three' }).click();
  await expect(savedRoutes.getByText('Route three', { exact: true })).toHaveCount(0);

  await page.reload();

  await expect(page.getByText('Evening commute', { exact: true })).toBeVisible();
  await expect(page.getByText('Route two', { exact: true })).toBeVisible();
  await expect(page.getByText('Route three', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Route five', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable Evening commute' })).toBeVisible();
  await expect(page.getByLabel('Monday Commute Day')).not.toBeChecked();
  await expect(page.getByLabel('Sunday Commute Day')).toBeChecked();
  expect(pointSelections).toContainEqual({ latitude: 50, longitude: 19 });
  expect(pointSelections).toContainEqual({ latitude: 51, longitude: 20 });
});

test('Visitor preview renders eligible Commute estimates and local unavailable behavior without live Google calls', async ({ page }) => {
  let estimateOutcome: 'available' | 'unavailable' = 'available';
  let estimateRequests = 0;
  await page.route('/commute-point-selection', async (route) => {
    const point = route.request().postDataJSON() as { latitude: number; longitude: number };
    await route.fulfill({ json: { outcome: 'available', point: { label: 'Selected point', ...point } } });
  });
  await page.route('/commute-estimate', async (route) => {
    estimateRequests += 1;
    await route.fulfill({ json: estimateOutcome === 'available'
      ? { outcome: 'available', estimate: { durationMinutes: 24 } }
      : { outcome: 'unavailable', reason: 'global-daily-cap' } });
  });
  await page.goto('/');
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    await page.getByLabel(`${day} Commute Day`).check();
  }
  expect(estimateRequests).toBe(0);
  await page.getByLabel('Route Name').fill('Office route');
  await page.getByRole('button', { name: 'Select' }).first().click();
  await page.getByRole('button', { name: 'Select' }).nth(1).click();
  await page.getByRole('button', { name: 'Add Commute Route' }).click();

  await expect(page.getByText('Office route: 24 minutes')).toBeVisible();
  expect(estimateRequests).toBe(1);

  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    await page.getByLabel(`${day} Commute Day`).uncheck();
  }
  await expect(page.getByText('Office route: 24 minutes')).toHaveCount(0);
  expect(estimateRequests).toBe(1);

  estimateOutcome = 'unavailable';
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    await page.getByLabel(`${day} Commute Day`).check();
  }
  await expect(page.getByText('Live Commute is unavailable right now.')).toBeVisible();
  await expect(page.getByText('Demo Calendar - sample Calendar Events for the Week Ahead.')).toBeVisible();
});

test('Visitor sees unavailable Weather Location search reason when geocoding fails', async ({ page }) => {
  await page.route('/weather-location-search?**', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        outcome: 'unavailable',
        reason: 'Weather Location search is unavailable right now.'
      })
    });
  });

  await page.goto('/');
  await page.getByLabel('City Search').fill('Warsaw');
  await page.getByRole('button', { name: 'Search' }).click();

  await expect(page.getByText('Weather Location search is unavailable right now.')).toBeVisible();
  await expect(page.getByText('Enter a valid city search.')).toHaveCount(0);
});

test('Visitor falls back safely when browser Local Setup data is corrupt', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('daily.visitorLocalSetup.v1', '{');
  });

  await page.reload();

  await expect(page.getByText('Invalid browser data was ignored. Defaults are active.')).toBeVisible();
  await expect(page.getByLabel('Summary Time')).toHaveValue('07:00');
  await expect(page.getByRole('radio', { name: 'UTC' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Light Theme' })).toBeChecked();
  await expect(page.getByText('Next summary: 07:00 UTC')).toBeVisible();
  await expect(page.getByRole('list', { name: 'No Category Todo Tasks' }).getByRole('listitem')).toHaveCount(0);
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
  await expect(page.getByText('Todo source is not connected yet.')).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'Connect Google Calendar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Disconnect Google Calendar' })).toHaveCount(0);
  await expect(page.getByText('Selected Calendars', { exact: true })).toHaveCount(0);
  await expect(page.locator('input[id^="selected-calendar-"]')).toHaveCount(0);

  await page.locator('#calendar-section').uncheck();
  await expect(page.locator('#calendar-section')).not.toBeChecked();

  await expect(page.getByRole('heading', { name: 'Demo Calendar' })).toHaveCount(0);
  await expect(page.getByText('Planning check-in')).toHaveCount(0);
  await expect(page.getByText('Todo source is not connected yet.')).not.toBeVisible();
});

test('Visitor creates edits and completes an active uncategorized Todo Task', async ({ page }) => {
  await page.goto('/');

  const uncategorizedTasks = page.getByRole('list', { name: 'No Category Todo Tasks' });

  await page.getByLabel('New Todo Task').fill('Buy breakfast oats');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  await expect(uncategorizedTasks.getByRole('listitem').filter({ hasText: 'Buy breakfast oats' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit Buy breakfast oats' }).click();
  await page.getByLabel('Edit Todo Task').fill('Buy breakfast oats and fruit');
  await page.getByRole('button', { name: 'Save Todo Task' }).click();

  await expect(uncategorizedTasks.getByText('Buy breakfast oats and fruit')).toBeVisible();
  await expect(uncategorizedTasks.getByText('Buy breakfast oats', { exact: true })).not.toBeVisible();

  await page.getByRole('checkbox', { name: 'Complete Buy breakfast oats and fruit' }).click();
  await expect(page.getByText('Buy breakfast oats and fruit')).not.toBeVisible();
});

test('Visitor manages Todo Categories with urgency and confirmed deletion', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  const todoPanel = page.locator('section.rounded-lg:has(> h2:text("Todo Tasks"))');

  await page.getByLabel('New Todo Category').fill('Home');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();
  expect(pageErrors).toEqual([]);
  await expect(todoPanel.getByRole('heading', { name: 'Home' })).toBeVisible();

  await page.getByRole('button', { name: 'Rename Home' }).click();
  await page.getByLabel('Edit Todo Category').fill('Apartment');
  await page.getByRole('button', { name: 'Save Todo Category' }).click();
  await expect(todoPanel.getByRole('heading', { name: 'Apartment' })).toBeVisible();

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
  await expect(todoPanel.getByRole('heading', { name: 'Apartment' })).toBeVisible();
  await expect(apartmentTasks.getByText('Call plumber')).toBeVisible();

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete Apartment' }).click();
  await expect(todoPanel.getByRole('heading', { name: 'Apartment' })).not.toBeVisible();
  await expect(page.getByText('Call plumber')).not.toBeVisible();
  await expect(page.getByText('Water plants')).not.toBeVisible();
});

test('Visitor sees active Todo Tasks grouped in the Daily Summary preview', async ({ page }) => {
  await page.goto('/');

  const preview = page.locator('section.rounded-lg').filter({
    has: page.getByRole('heading', { name: 'Daily Summary Preview' })
  });
  await expect(preview.getByText('Todo Tasks')).toHaveCount(0);

  await page.getByLabel('New Todo Category').fill('Work');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();
  await page.getByLabel('New Todo Category').fill('Empty Category');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();

  await page.getByLabel('New Todo Task').fill('Buy coffee');
  await page.getByLabel('Urgency', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  await page.getByLabel('New Todo Task').fill('Draft update');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Work' });
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  await expect(preview.getByText('Todo Tasks')).toBeVisible();
  await expect(preview.getByText('Buy coffee')).toBeVisible();
  await expect(preview.getByText('Work')).toBeVisible();
  await expect(preview.getByText('Draft update')).toBeVisible();
  await expect(preview.getByLabel('High urgency')).toHaveText('!');
  await expect(preview.getByText('Empty Category')).toHaveCount(0);

  const previewText = await preview.textContent();
  expect(previewText?.indexOf('Buy coffee')).toBeLessThan(previewText?.indexOf('Work') ?? -1);

  await page.getByRole('checkbox', { name: 'Todo Section' }).uncheck();
  await expect(preview.getByText('Todo Tasks')).toHaveCount(0);
  await expect(preview.getByText('Buy coffee')).toHaveCount(0);
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

test('Visitor reorders uncategorized Todo Tasks with a pointer drag without disappearing', async ({
  page
}) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  for (const title of ['Plan meals', 'Buy groceries']) {
    await page.getByLabel('New Todo Task').fill(title);
    await page.getByRole('button', { name: 'Add Todo Task' }).click();
  }

  const uncategorizedTasks = page.getByRole('list', { name: 'No Category Todo Tasks' });
  await expect(uncategorizedTasks.getByRole('listitem')).toHaveText([
    /Plan meals/,
    /Buy groceries/
  ]);

  await dragTodoHandleToTarget({
    page,
    sourceHandle: uncategorizedTasks.getByRole('button', { name: 'Move Buy groceries' }),
    target: uncategorizedTasks.getByRole('listitem').filter({ hasText: 'Plan meals' }),
    targetPosition: { x: 20, y: 4 }
  });

  await expect(uncategorizedTasks.getByRole('listitem')).toHaveText([
    /Buy groceries/,
    /Plan meals/
  ]);
});

test('Visitor moves Todo Tasks between categories with a pointer drag without disappearing', async ({
  page
}) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  for (const category of ['Work', 'Home']) {
    await page.getByLabel('New Todo Category').fill(category);
    await page.getByRole('button', { name: 'Add Todo Category' }).click();
  }

  await page.getByLabel('New Todo Task').fill('File invoice');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Work' });
  await page.getByLabel('Urgency', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  const workTasks = page.getByRole('list', { name: 'Work Todo Tasks' });
  const homeTasks = page.getByRole('list', { name: 'Home Todo Tasks' });

  await dragTodoHandleToTarget({
    page,
    sourceHandle: workTasks.getByRole('button', { name: 'Move File invoice' }),
    target: homeTasks
  });

  await expect(workTasks.getByText('File invoice')).toHaveCount(0);
  await expect(homeTasks.getByRole('listitem').filter({ hasText: 'File invoice' })).toBeVisible();
  await expect(homeTasks.getByRole('listitem').filter({ hasText: 'File invoice' }).getByLabel('High urgency')).toHaveText('!');
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

test('Visitor reorders Todo Categories and keeps that order after page refresh', async ({ page }) => {
  await page.goto('/');

  for (const category of ['Work', 'Home', 'Errands']) {
    await page.getByLabel('New Todo Category').fill(category);
    await page.getByRole('button', { name: 'Add Todo Category' }).click();
  }

  const todoCategories = page.getByLabel('Todo Categories');
  await expect(todoCategories.locator('section[aria-label$="Todo Category"]')).toHaveText([
    /Work/,
    /Home/,
    /Errands/
  ]);

  await todoCategories.getByRole('button', { name: 'Move category Errands' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');

  await expect(todoCategories.locator('section[aria-label$="Todo Category"]')).toHaveText([
    /Errands/,
    /Work/,
    /Home/
  ]);

  await page.reload();

  await expect(page.getByLabel('Todo Categories').locator('section[aria-label$="Todo Category"]')).toHaveText([
    /Errands/,
    /Work/,
    /Home/
  ]);
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

  const uncategorizedTasks = page.getByRole('list', { name: 'No Category Todo Tasks' });
  const workTasks = page.getByRole('list', { name: 'Work Todo Tasks' });
  const homeTasks = page.getByRole('list', { name: 'Home Todo Tasks' });

  await workTasks.getByRole('button', { name: 'Move File invoice' }).focus();
  await page.keyboard.press('Space');
  await tabUntilDropTargetActive(page, homeTasks);
  await page.keyboard.press('Space');
  await expect(workTasks.getByText('File invoice')).toHaveCount(0);
  await expect(homeTasks.getByRole('listitem').filter({ hasText: 'File invoice' })).toBeVisible();
  await expect(homeTasks.getByRole('listitem').filter({ hasText: 'File invoice' }).getByLabel('High urgency')).toHaveText('!');

  await page.getByLabel('New Todo Task').fill('Wash mugs');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Home' });
  await page.getByLabel('Urgency', { exact: true }).selectOption('medium');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  await homeTasks.getByRole('button', { name: 'Move Wash mugs' }).focus();
  await page.keyboard.press('Space');
  await tabUntilDropTargetActive(page, uncategorizedTasks, { direction: 'backward' });
  await page.keyboard.press('Space');
  await expect(homeTasks.getByText('Wash mugs')).toHaveCount(0);
  await expect(uncategorizedTasks.getByRole('listitem').filter({ hasText: 'Wash mugs' })).toBeVisible();
  await expect(
    uncategorizedTasks.getByRole('listitem').filter({ hasText: 'Wash mugs' }).getByLabel('Medium urgency')
  ).toHaveText('!');
});

test('Visitor Todo data and local-save status persist after page refresh', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Saved in this browser only')).toBeVisible();

  await page.getByLabel('New Todo Category').fill('Work');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();
  await page.getByLabel('New Todo Category').fill('Home');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();

  await page.getByLabel('New Todo Task').fill('Buy coffee');
  await page.getByLabel('Urgency', { exact: true }).selectOption('medium');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  for (const [title, category, urgency] of [
    ['Write launch note', 'Work', 'low'],
    ['Review deploy checklist', 'Work', 'high'],
    ['Water plants', 'Home', 'medium']
  ] as const) {
    await page.getByLabel('New Todo Task').fill(title);
    await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: category });
    await page.getByLabel('Urgency', { exact: true }).selectOption(urgency);
    await page.getByRole('button', { name: 'Add Todo Task' }).click();
  }

  const workTasks = page.getByRole('list', { name: 'Work Todo Tasks' });
  await workTasks.getByRole('button', { name: 'Move Review deploy checklist' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');

  await page.reload();

  const uncategorizedTasks = page.getByRole('list', { name: 'No Category Todo Tasks' });
  const restoredWorkTasks = page.getByRole('list', { name: 'Work Todo Tasks' });
  const homeTasks = page.getByRole('list', { name: 'Home Todo Tasks' });

  await expect(page.getByText('Saved in this browser only')).toBeVisible();
  await expect(uncategorizedTasks.getByRole('listitem').filter({ hasText: 'Buy coffee' })).toBeVisible();
  await expect(
    uncategorizedTasks.getByRole('listitem').filter({ hasText: 'Buy coffee' }).getByLabel('Medium urgency')
  ).toHaveText('!');
  await expect(restoredWorkTasks.locator('li').nth(0)).toContainText('Review deploy checklist');
  await expect(restoredWorkTasks.locator('li').nth(1)).toContainText('Write launch note');
  await expect(
    restoredWorkTasks.getByRole('listitem').filter({ hasText: 'Review deploy checklist' }).getByLabel('High urgency')
  ).toHaveText('!');
  await expect(homeTasks.getByRole('listitem').filter({ hasText: 'Water plants' })).toBeVisible();

  await page.getByLabel('New Todo Category').fill('Errands');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();
  await expect(page.getByRole('heading', { name: 'Errands' })).toBeVisible();

  await page.getByLabel('New Todo Task').fill('Schedule retro');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Work' });
  await page.getByRole('button', { name: 'Add Todo Task' }).click();
  await expect(restoredWorkTasks.getByRole('listitem').filter({ hasText: 'Schedule retro' })).toBeVisible();
  await expect(restoredWorkTasks.getByRole('listitem').filter({ hasText: 'Schedule retro' })).toHaveCount(1);
});

test('Visitor Todo changes from moves renames deletion and completion remain durable after refresh', async ({
  page
}) => {
  await page.goto('/');

  for (const category of ['Work', 'Home']) {
    await page.getByLabel('New Todo Category').fill(category);
    await page.getByRole('button', { name: 'Add Todo Category' }).click();
  }

  await page.getByRole('button', { name: 'Rename Home' }).click();
  await page.getByLabel('Edit Todo Category').fill('Apartment');
  await page.getByRole('button', { name: 'Save Todo Category' }).click();

  await page.getByLabel('New Todo Task').fill('Buy coffee');
  await page.getByLabel('Urgency', { exact: true }).selectOption('medium');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  await page.getByLabel('New Todo Task').fill('File invoice');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Work' });
  await page.getByLabel('Urgency', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  await page.getByLabel('New Todo Task').fill('Water plants');
  await page.getByLabel('Todo Category', { exact: true }).selectOption({ label: 'Apartment' });
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  const workTasks = page.getByRole('list', { name: 'Work Todo Tasks' });
  const apartmentTasks = page.getByRole('list', { name: 'Apartment Todo Tasks' });

  await workTasks.getByRole('button', { name: 'Move File invoice' }).focus();
  await page.keyboard.press('Space');
  await tabUntilDropTargetActive(page, apartmentTasks);
  await page.keyboard.press('Space');

  await page.getByRole('checkbox', { name: 'Complete Buy coffee' }).click();

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete Work' }).click();

  await page.reload();

  const todoPanel = page.locator('section.rounded-lg:has(> h2:text("Todo Tasks"))');
  const restoredUncategorizedTasks = page.getByRole('list', { name: 'No Category Todo Tasks' });
  const restoredApartmentTasks = page.getByRole('list', { name: 'Apartment Todo Tasks' });

  await expect(todoPanel.getByRole('heading', { name: 'Apartment' })).toBeVisible();
  await expect(todoPanel.getByRole('heading', { name: 'Work' })).toHaveCount(0);
  await expect(restoredUncategorizedTasks.getByText('Buy coffee')).toHaveCount(0);
  await expect(restoredApartmentTasks.getByRole('listitem').filter({ hasText: 'File invoice' })).toBeVisible();
  await expect(
    restoredApartmentTasks.getByRole('listitem').filter({ hasText: 'File invoice' }).getByLabel('High urgency')
  ).toHaveText('!');
  await expect(restoredApartmentTasks.getByRole('listitem').filter({ hasText: 'Water plants' })).toBeVisible();
  await expect(restoredApartmentTasks.getByRole('listitem')).toHaveText([
    /File invoice/,
    /Water plants/
  ]);
  await expect(page.getByRole('list', { name: 'Work Todo Tasks' })).toHaveCount(0);
});

test('Visitor cannot access the Admin Panel and private Local Setup content is excluded', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Admin Panel' })).toHaveCount(0);
  await page.getByLabel('New Todo Task').fill('Private board review');
  await page.getByRole('button', { name: 'Add Todo Task' }).click();

  const adminResponse = await page.goto('/admin');

  await expect(page).toHaveURL('/admin');
  expect(adminResponse?.status()).toBe(403);
  await expect(page.locator('body')).not.toContainText('Operational shell');
  await expect(page.locator('body')).not.toContainText('Private board review');
  await expect(page.locator('body')).not.toContainText('Demo Calendar');
});
