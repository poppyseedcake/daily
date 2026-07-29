import { expect, test } from '@playwright/test';

test('opens the Task Board inline editor with a real pointer click', async ({ page }) => {
  await page.goto('/prototype/daily?variant=c&tasks=b');
  await page.waitForTimeout(500);

  const editButton = page.getByRole('button', { name: 'Edit Send revised proposal' });
  const editButtonBox = await editButton.boundingBox();

  expect(editButtonBox).not.toBeNull();
  if (!editButtonBox) return;

  await page.mouse.move(
    editButtonBox.x + editButtonBox.width / 2,
    editButtonBox.y + editButtonBox.height / 2
  );
  await expect(editButton).toHaveCSS('opacity', '1');
  await page.mouse.click(
    editButtonBox.x + editButtonBox.width / 2,
    editButtonBox.y + editButtonBox.height / 2
  );

  const titleInput = page.getByRole('textbox', { name: 'Edit Send revised proposal' });
  await expect(titleInput).toBeVisible();

  const editingRow = page.locator('.board-task--editing');
  const priorityDot = editingRow.locator('.board-ledger-priority');
  const titleInputBox = await titleInput.boundingBox();
  const priorityDotBox = await priorityDot.boundingBox();

  expect(titleInputBox).not.toBeNull();
  expect(priorityDotBox).not.toBeNull();
  if (!titleInputBox || !priorityDotBox) return;

  expect(
    Math.abs(
      titleInputBox.y +
        titleInputBox.height / 2 -
        (priorityDotBox.y + priorityDotBox.height / 2)
    )
  ).toBeLessThanOrEqual(1);
});
