import { expect, test, type Page } from '@playwright/test';

const openSettings = async (page: Page) => {
  const settings = page.getByRole('button', { name: 'Open settings' });
  await expect(settings).toBeEnabled();
  await settings.click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
};

const closePanel = async (page: Page) => {
  await page.getByRole('button', { name: 'Close panel' }).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
});

test('Visitor Summary Configuration persists through the secondary Settings panel', async ({
  page
}) => {
  await openSettings(page);

  await page.getByLabel('Summary Time').fill('18:45');
  await page.getByLabel('User Time Zone').selectOption('America/New_York');
  await page.getByRole('radio', { name: 'Dark Theme' }).check();
  await page.getByRole('checkbox', { name: 'Weather Section' }).uncheck();
  await closePanel(page);

  await page.getByRole('checkbox', { name: /Preview only/ }).uncheck();
  await expect(page.getByText('Delivery paused', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await expect(page.getByText('Delivery paused', { exact: true })).toBeVisible();
  await openSettings(page);

  await expect(page.getByLabel('Summary Time')).toHaveValue('18:45');
  await expect(page.getByLabel('User Time Zone')).toHaveValue('America/New_York');
  await expect(page.getByRole('radio', { name: 'Dark Theme' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Weather Section' })).not.toBeChecked();
});

test('Visitor chooses a Weather Location in the focused city dialog and keeps it after refresh', async ({
  page
}) => {
  await page.route('/weather-location-search?**', async (route) => {
    await route.fulfill({
      json: {
        outcome: 'found',
        locations: [
          {
            label: 'Warsaw, Masovian Voivodeship, Poland',
            latitude: 52.2297,
            longitude: 21.0122
          }
        ]
      }
    });
  });

  await page.getByRole('button', { name: 'Weather. Choose a city' }).click();
  await page.getByLabel('City Search').fill('Warsaw');
  const option = page
    .getByRole('listbox', { name: 'Weather Location search results' })
    .getByRole('option');
  await expect(option).toBeVisible();
  await option.click();

  await expect(
    page.getByRole('button', { name: 'Weather. Warsaw, Masovian Voivodeship, Poland' })
  ).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Weather. Warsaw, Masovian Voivodeship, Poland' })
  ).toBeVisible();
});

test('Visitor keeps saved Weather Cities separate from saved Commute Addresses', async ({
  page
}) => {
  await page.route('/weather-location-search?**', async (route) => {
    await route.fulfill({
      json: {
        outcome: 'found',
        locations: [
          {
            label: 'Warsaw, Masovian Voivodeship, Poland',
            latitude: 52.2297,
            longitude: 21.0122
          }
        ]
      }
    });
  });
  await page.route('/commute-point-search?**', async (route) => {
    await route.fulfill({
      json: {
        outcome: 'available',
        suggestions: [{ placeId: 'origin-place', label: 'Origin point' }]
      }
    });
  });
  await page.route('/commute-point-selection', async (route) => {
    await route.fulfill({
      json: {
        outcome: 'available',
        point: { label: 'Origin point', latitude: 52.2285, longitude: 21.0037 }
      }
    });
  });

  await page.getByRole('button', { name: 'Weather. Choose a city' }).click();
  await page.getByLabel('City Search').fill('Warsaw');
  await expect(
    page.getByRole('button', {
      name: 'Add Warsaw, Masovian Voivodeship, Poland to Saved Weather Cities'
    })
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Add Warsaw, Masovian Voivodeship, Poland to Saved Weather Cities'
    })
    .click();
  await expect.poll(() => page.evaluate(() => {
    const setup = localStorage.getItem('daily.visitorLocalSetup.v2');
    return setup
      ? {
          savedWeatherCities: JSON.parse(setup).savedWeatherCities,
          savedCommuteAddresses: JSON.parse(setup).savedCommuteAddresses
        }
      : null;
  })).toEqual({
    savedWeatherCities: [
      {
        label: 'Warsaw, Masovian Voivodeship, Poland',
        latitude: 52.2297,
        longitude: 21.0122
      }
    ],
    savedCommuteAddresses: []
  });
  await page.getByLabel('City Search').fill('');
  const savedWeatherOption = page
    .getByRole('listbox', { name: 'Weather Location search results' })
    .getByRole('option');
  await expect(savedWeatherOption).toHaveText('Warsaw, Masovian Voivodeship, Poland');
  await expect(savedWeatherOption).not.toContainText('52.2297, 21.0122');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Commute. 0 routes' }).click();
  await page.getByRole('button', { name: 'Add route' }).click();
  await page.getByLabel('Commute Origin Search').focus();
  await expect(
    page.getByRole('option', {
      name: /Warsaw, Masovian Voivodeship, Poland Saved Commute Address/
    })
  ).toHaveCount(0);

  await page.getByLabel('Commute Origin Search').fill('Origin address');
  await expect(page.getByRole('option', { name: 'Select Origin point' })).toBeVisible();
  await page.getByLabel('Commute Origin Search').press('Enter');
  await expect(
    page.getByRole('button', { name: 'Add Origin point to Saved Commute Addresses' })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Add Origin point to Saved Commute Addresses' })
    .click();
  await expect.poll(() => page.evaluate(() => {
    const setup = localStorage.getItem('daily.visitorLocalSetup.v2');
    return setup ? JSON.parse(setup).savedCommuteAddresses : null;
  })).toEqual([
    { label: 'Origin point', latitude: 52.2285, longitude: 21.0037 }
  ]);

  await page.getByLabel('Commute Destination Search').focus();
  await expect(
    page.getByRole('option', { name: 'Origin point Saved Commute Address' })
  ).toBeVisible();
});

test('Visitor creates and keeps a Commute Route from the minimalist route dialog', async ({
  page
}) => {
  await page.route('/commute-point-search?**', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') ?? '';
    const destination = query.toLowerCase().includes('destination');
    await route.fulfill({
      json: {
        outcome: 'available',
        suggestions: [
          {
            placeId: destination ? 'destination-place' : 'origin-place',
            label: destination ? 'Destination point' : 'Origin point'
          }
        ]
      }
    });
  });
  await page.route('/commute-point-selection', async (route) => {
    const { placeId } = route.request().postDataJSON() as { placeId: string };
    const destination = placeId === 'destination-place';
    await route.fulfill({
      json: {
        outcome: 'available',
        point: {
          label: destination ? 'Destination point' : 'Origin point',
          latitude: destination ? 51 : 50,
          longitude: destination ? 20 : 19
        }
      }
    });
  });
  await page.route('/commute-estimate', async (route) => {
    await route.fulfill({ json: { outcome: 'available', estimate: { durationMinutes: 26, staticDurationMinutes: 24 } } });
  });

  await page.getByRole('button', { name: 'Commute. 0 routes' }).click();
  await page.getByRole('button', { name: 'Add route' }).click();
  await page.getByLabel('Route Name').fill('Office');

  await page.getByLabel('Commute Origin Search').fill('Origin address');
  await expect(page.getByRole('option', { name: 'Select Origin point' })).toBeVisible();
  await page.getByLabel('Commute Origin Search').press('Enter');
  await page.getByLabel('Commute Destination Search').fill('Destination address');
  await expect(page.getByRole('option', { name: 'Select Destination point' })).toBeVisible();
  await page.getByLabel('Commute Destination Search').press('Enter');
  await page.getByRole('button', { name: 'Save route' }).click();

  await expect(page.getByRole('dialog', { name: 'Your routes' }).getByText('Office')).toBeVisible();
  await page.getByRole('button', { name: 'Close commute routes' }).click();
  await expect(page.getByRole('button', { name: 'Commute. 1 route' })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('New Todo Task')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Commute. 1 route' })).toBeVisible();
});

test('Visitor manages Todo Groups and compact task rows through the Task Board', async ({ page }) => {
  await page.getByRole('button', { name: 'New group' }).click();
  await expect(page.getByLabel('New Todo Category')).toBeFocused();
  await page.getByLabel('New Todo Category').fill('Work');
  await page.getByRole('button', { name: 'Add Todo Category' }).click();

  await page.getByLabel('New Todo Task').fill('Send revised proposal');
  await page.getByLabel('New Todo Task').press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');

  const workTasks = page.getByRole('list', { name: 'Work Todo Tasks' });
  await expect(workTasks.getByText('Send revised proposal')).toBeVisible();
  await expect(workTasks.getByLabel('Medium urgency')).toBeVisible();

  await workTasks.getByRole('button', { name: 'Edit Send revised proposal' }).click();
  await page.getByLabel('Edit Todo Task').fill('Send final proposal');
  await page.getByRole('button', { name: 'High urgency' }).click();
  await page.getByRole('button', { name: 'Save Todo Task' }).click();
  await expect(workTasks.getByText('Send final proposal')).toBeVisible();
  await expect(workTasks.getByLabel('High urgency')).toBeVisible();

  await page.getByRole('checkbox', { name: 'Complete Send final proposal' }).click();
  await expect(workTasks.getByText('Send final proposal')).toHaveCount(0);

  await page.getByRole('button', { name: 'Delete Work' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete group?' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByText('Todo', { exact: true })).toHaveCount(0);
  await expect(confirmation.getByRole('button', { name: 'Close delete group dialog' }))
    .toBeVisible();
  await confirmation.getByRole('button', { name: 'Delete group', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Work' })).toHaveCount(0);
});

test('Visitor configures Commute Days independently for each route', async ({ page }) => {
  await page.getByRole('button', { name: 'Commute. 0 routes' }).click();
  await page.getByRole('button', { name: 'Add route' }).click();

  await expect(page.getByRole('group', { name: 'Route days' })).toBeVisible();
  await page.getByRole('button', { name: 'Monday route day' }).click();
  await expect(page.getByRole('button', { name: 'Monday route day' })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await page.getByRole('button', { name: 'Friday route day' }).click();
  await expect(page.getByRole('button', { name: 'Friday route day' })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
});

test('Visitor edits Mail Delivery time with the keyboard and mouse', async ({ page }) => {
  await page.getByRole('button', { name: /Mail delivery/ }).click();

  const delivery = page.getByRole('dialog', { name: 'Delivery time' });
  await expect(delivery).toBeVisible();
  await expect(delivery.getByRole('spinbutton', { name: 'Hours' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(delivery.getByRole('spinbutton', { name: 'Hours' })).toHaveText('08');
  await page.keyboard.press('ArrowRight');
  await expect(delivery.getByRole('spinbutton', { name: 'Minutes' }))
    .toHaveAttribute('data-active', 'true');
  await delivery.getByRole('button', { name: 'Increase minutes' }).click();
  await expect(delivery.getByRole('spinbutton', { name: 'Minutes' })).toHaveText('01');
  await expect(delivery.getByRole('spinbutton', { name: 'Minutes' }))
    .toHaveAttribute('data-active', 'true');
  await delivery.getByRole('button', { name: 'Edit time zone' }).click();
  await delivery.getByLabel('User Time Zone').selectOption('Asia/Tokyo');
  await delivery.getByRole('button', { name: 'Save delivery time' }).click();

  await expect(page.getByRole('button', { name: /Mail delivery/ })).toContainText('08:01');
  await expect(page.getByRole('button', { name: /Mail delivery/ })).toContainText('Asia/Tokyo');
});

test.describe('Visitor system time zone', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('uses the browser time zone for a new Local Setup', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Mail delivery/ })).toContainText(
      'Asia/Tokyo'
    );
  });
});

test('bottom rail offers sign-in in Visitor mode', async ({ page }) => {
  await expect(page.locator('.daily-rail').getByRole('link', { name: 'Sign in with Google' }))
    .toHaveAttribute('href', '/auth/google');
});

test('Todo board omits redundant persistence and Ungrouped helper copy', async ({ page }) => {
  await expect(page.getByText('Todo state saved to your account.')).toHaveCount(0);
  await expect(page.getByText('Tasks waiting for a home')).toHaveCount(0);
});

test('Visitor reorders Todo Tasks with the keyboard and keeps the order after refresh', async ({
  page
}) => {
  for (const title of ['Plan meals', 'Buy groceries', 'Cook dinner']) {
    await page.getByLabel('New Todo Task').fill(title);
    await page.getByLabel('New Todo Task').press('Enter');
    await page.keyboard.press('Enter');
  }

  const ungrouped = page.getByRole('list', { name: 'No Category Todo Tasks' });
  await ungrouped.getByRole('button', { name: 'Move Cook dinner' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');

  await expect(ungrouped.getByRole('listitem')).toHaveText([
    /Cook dinner/,
    /Plan meals/,
    /Buy groceries/
  ]);

  await page.reload();
  await expect(page.getByRole('list', { name: 'No Category Todo Tasks' }).getByRole('listitem'))
    .toHaveText([/Cook dinner/, /Plan meals/, /Buy groceries/]);
});

test('Visitor can drop a Todo Task anywhere in an empty stretched group', async ({ page }) => {
  const addGroup = async (name: string) => {
    await page.getByRole('button', { name: 'New group' }).click();
    await page.getByLabel('New Todo Category').fill(name);
    await page.getByRole('button', { name: 'Add Todo Category' }).click();
  };
  const addTaskToGroup = async (title: string, groupName: string) => {
    await page.getByLabel('New Todo Task').fill(title);
    await page.getByLabel('New Todo Task').press('Enter');
    await expect(page.getByRole('dialog', { name: 'Add task' })).toBeVisible();

    const groups = page.getByRole('dialog', { name: 'Add task' });
    const groupNames = ['Target', 'Source'];
    const targetIndex = groupNames.indexOf(groupName);
    for (let index = 0; index <= targetIndex; index += 1) {
      await groups.getByRole('button', { name: 'Next group' }).click();
    }
    await groups.getByRole('button', { name: 'Confirm adding task' }).click();
  };

  await addGroup('Target');
  await addGroup('Source');
  await addTaskToGroup('Source task one', 'Source');
  await addTaskToGroup('Source task two', 'Source');

  const sourceList = page.getByRole('list', { name: 'Source Todo Tasks' });
  const targetList = page.getByRole('list', { name: 'Target Todo Tasks' });
  const targetColumn = page.locator('section.daily-column').first();
  const sourceHandle = sourceList.getByRole('button', { name: 'Move Source task one' });
  const sourceHandleBox = await sourceHandle.boundingBox();
  const targetListBox = await targetList.boundingBox();
  const targetColumnBox = await targetColumn.boundingBox();

  expect(sourceHandleBox).not.toBeNull();
  expect(targetListBox?.height).toBeGreaterThan(80);
  expect(targetColumnBox).not.toBeNull();
  if (!sourceHandleBox || !targetColumnBox) return;

  await page.mouse.move(
    sourceHandleBox.x + sourceHandleBox.width / 2,
    sourceHandleBox.y + sourceHandleBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    targetColumnBox.x + targetColumnBox.width / 2,
    targetColumnBox.y + targetColumnBox.height - 18,
    { steps: 12 }
  );
  await page.waitForTimeout(250);
  await expect(targetList).toHaveClass(/daily-task-list--drop-target/);
  await expect(targetList.locator('li.daily-task--drop-placeholder')).toHaveCount(1);
  await page.mouse.up();

  await expect(targetList.getByText('Source task one')).toBeVisible();
  await expect(sourceList.getByText('Source task one')).toHaveCount(0);
});

test('Visitor Calendar tile explains the Google handoff without exposing a main-view preview', async ({
  page
}) => {
  await expect(page.getByRole('heading', { name: 'Daily Summary Preview' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Calendar. Connect Google Calendar' }).click();

  const calendarDialog = page.getByRole('dialog', { name: 'Connect your calendar' });
  await expect(calendarDialog).toBeVisible();
  await expect(calendarDialog.getByText('Daily cannot create, edit or delete events.')).toBeVisible();
  await expect(calendarDialog.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
    'href',
    '/auth/google'
  );
});

test('Visitor cannot access the Admin Panel or leak private local Todo data there', async ({
  page
}) => {
  await page.getByLabel('New Todo Task').fill('Private board review');
  await page.getByLabel('New Todo Task').press('Enter');
  await page.keyboard.press('Enter');

  const response = await page.goto('/admin');
  expect(response?.status()).toBe(403);
  await expect(page.locator('body')).not.toContainText('Private board review');
});
