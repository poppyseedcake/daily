import { expect, test } from '@playwright/test';

for (const width of [390, 1280]) {
  for (const taskCount of [0, 30]) {
    test(`navigation and footer stay visible at the page bottom at ${width}px with ${taskCount} tasks`, async ({ page }) => {
      const height = 1080;
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await expect(page.getByLabel('New Todo Task')).toBeEnabled();
      await page.evaluate((count) => {
        const key = 'daily.visitorLocalSetup.v3';
        const setup = JSON.parse(localStorage.getItem(key)!);
        setup.todoTasks = Array.from({ length: count }, (_, index) => ({
          id: `layout-task-${index}`, title: `Task ${index + 1}`, categoryId: null,
          urgency: 'low', position: index + 1, completed: false
        }));
        setup.nextTodoId = count + 1;
        localStorage.setItem(key, JSON.stringify(setup));
      }, taskCount);
      await page.reload();
      await expect(page.getByLabel('New Todo Task')).toBeEnabled();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

      const rail = await page.locator('.daily-rail').boundingBox();
      expect(rail).not.toBeNull();
      expect(rail!.y + rail!.height).toBeGreaterThanOrEqual(height - 1);
      expect(rail!.y + rail!.height).toBeLessThanOrEqual(height + 1);
      await expect(page.getByRole('link', { name: 'Privacy Policy', exact: true }).last()).toBeVisible();
      const footer = await page.getByRole('contentinfo').boundingBox();
      expect(footer).not.toBeNull();
      if (width < 820) {
        expect(footer!.y + footer!.height).toBeLessThanOrEqual(rail!.y);
        if (taskCount === 0) {
          expect(footer!.y + footer!.height).toBeCloseTo(height - 100, 0);
        }
      } else {
        expect(footer!.y + footer!.height).toBeCloseTo(height - 24, 0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    });
  }
}
