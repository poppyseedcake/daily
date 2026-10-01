import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { buildDailySummaryPrototypeFixture, buildDailySummaryDenseAllActiveFixture } from '../../src/lib/dailySummaryFixtures';
import { renderDailySummary } from '../../src/lib/dailySummaryRenderer';

test('Daily Grid stays readable at Gmail widths with and without head styles', async ({ page }) => {
  await page.route('https://daily.example.test/email-icons/*.png', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)!;
    await route.fulfill({ contentType: 'image/png', body: readFileSync(`static/email-icons/${name}`) });
  });

  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const withoutHeadStyles of [false, true]) {
      for (const temperature of [18, 20.7, -20.7]) {
        const input = buildDailySummaryPrototypeFixture();
        if (input.sections.weather.status !== 'active' || !input.sections.weather.content) throw new Error('Fixture must have weather.');
        input.sections.weather.content.currentTemperatureCelsius = temperature;
        const { html } = renderDailySummary(input);
        await page.setContent(withoutHeadStyles ? html.replace(/<style>[\s\S]*?<\/style>/, '') : html);

        const geometry = await page.locator('[data-summary-section]').evaluateAll((sections) => sections.map((section) => {
          const bounds = section.getBoundingClientRect();
          return { x: bounds.x, y: bounds.y, width: bounds.width };
        }));
        expect(geometry).toHaveLength(4);
        if (width < 700) {
          expect(geometry.map((section) => section.y)).toEqual(geometry.map((section) => section.y).toSorted((a, b) => a - b));
          expect(geometry.every((section) => section.width === width)).toBe(true);
        } else {
          expect(geometry[0]!.y).toBe(geometry[1]!.y);
          expect(geometry[2]!.y).toBe(geometry[3]!.y);
          expect(geometry[0]!.width).toBe(395);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const weather = page.locator('[data-summary-section="weather"]');
        await expect(weather.locator(`[aria-label="Current ${temperature} degrees Celsius"]`)).toBeVisible();
        await expect(weather.getByText('Warsaw', { exact: true })).toBeVisible();
        await expect(page.locator('[data-urgency="high"]')).toBeVisible();
        await expect(page.locator('[aria-label="Office: 24 minutes — Light traffic"]')).toBeVisible();
        await expect(page.getByText('High urgency', { exact: true })).toBeHidden();
        await expect(page.getByText('Light traffic', { exact: true })).toBeHidden();
        await expect(page.locator('[data-calendar-date]')).toHaveCount(7);
        await expect(page.getByText('Dinner with Marta', { exact: true })).toBeVisible();
        await expect(page.getByText('Pick up the parcel', { exact: true })).toBeVisible();
      }
    }
  }
});

test('stripped styles and ARIA retain descriptions and continuous dense-grid separators', async ({ page }) => {
  const { html } = renderDailySummary(buildDailySummaryDenseAllActiveFixture());
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/\saria-[a-z-]+="[^"]*"/g, ''));

  // Borders belong to the entire row, so short and tall sections cannot put their
  // horizontal separators at different heights in the head-CSS-free fallback.
  const borders = await page.locator('.daily-grid-row').evaluateAll((rows) => rows.map((row) => ({
    bottom: getComputedStyle(row).borderBottomWidth,
    divider: getComputedStyle(row).columnRuleWidth,
    cellBottoms: [...row.querySelectorAll('.daily-grid-cell')].map((cell) => getComputedStyle(cell).borderBottomWidth)
  })));
  expect(borders).toEqual([
    { bottom: '1px', divider: '1px', cellBottoms: ['0px', '0px'] },
    { bottom: '1px', divider: '1px', cellBottoms: ['0px', '0px'] }
  ]);

  const session = await page.context().newCDPSession(page);
  const { nodes } = await session.send('Accessibility.getFullAXTree');
  const descriptions = nodes.filter((node) => !node.ignored && node.role?.value === 'StaticText').map((node) => node.name?.value);
  expect(descriptions).toEqual(expect.arrayContaining(['High urgency', 'Medium urgency', 'Low urgency', 'Moderate traffic', 'Heavy traffic', 'Light traffic', 'Celsius']));
  for (const label of ['High urgency', 'Medium urgency', 'Low urgency', 'Moderate traffic', 'Heavy traffic', 'Light traffic']) {
    const box = await page.getByText(label, { exact: true }).boundingBox();
    expect(box?.width ?? 0).toBe(0);
    expect(box?.height ?? 0).toBe(0);
  }
  await session.detach();
});
