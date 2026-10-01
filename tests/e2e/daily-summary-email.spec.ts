import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { buildDailySummaryPrototypeFixture, buildDailySummaryDenseAllActiveFixture } from '../../src/lib/dailySummaryFixtures';
import { renderDailySummary } from '../../src/lib/dailySummaryRenderer';

test('commute direction is one continuous arrow at narrow and desktop widths', async ({ page }) => {
  await page.route('https://daily.example.test/email-icons/*.png', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)!;
    await route.fulfill({ contentType: 'image/png', body: readFileSync(`static/email-icons/${name}`) });
  });
  const { html } = renderDailySummary(buildDailySummaryPrototypeFixture());
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const withoutHeadStyles of [false, true]) {
      await page.setContent(withoutHeadStyles ? html.replace(/<style>[\s\S]*?<\/style>/, '') : html);
      const route = page.locator('[data-summary-section="commute"] [role="group"]');
      const arrow = route.locator('img[src$="/commute-arrow.png"]');
      await expect(arrow).toHaveCount(1);
      await expect(arrow).toBeVisible();
      expect(await arrow.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      const box = await arrow.boundingBox();
      expect(box!.width).toBeGreaterThan(44);
      expect(box!.width / box!.height).toBeCloseTo(128 / 24, 1);
      const cell = arrow.locator('..');
      expect(await cell.locator('table,div').count()).toBe(0);
      expect(await cell.textContent()).not.toContain('→');
      const bounds = await cell.boundingBox();
      expect(Math.abs(box!.y + box!.height / 2 - (bounds!.y + bounds!.height / 2))).toBeLessThan(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

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
        input.userName = 'Wojtek M.';
        if (input.sections.weather.status !== 'active' || !input.sections.weather.content) throw new Error('Fixture must have weather.');
        input.sections.weather.content.currentTemperatureCelsius = temperature;
        const { html } = renderDailySummary(input);
        await page.setContent(withoutHeadStyles ? html.replace(/<style>[\s\S]*?<\/style>/, '') : html);

        const geometry = await page.locator('[data-summary-section]').evaluateAll((sections) => sections.map((section) => {
          const bounds = section.getBoundingClientRect();
          return { x: bounds.x, y: bounds.y, width: bounds.width };
        }));
        await expect(page.getByRole('heading', { level: 1, name: 'Good morning, Wojtek' })).toBeVisible();
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


test('Gmail-safe selectors keep the center divider and precipitation beside weather details', async ({ page }) => {
  const input = buildDailySummaryPrototypeFixture();
  if (input.sections.weather.status !== 'active' || !input.sections.weather.content) throw new Error('Fixture must have weather.');
  input.sections.weather.content.dailyWeatherCode = 63;
  input.sections.weather.content.maximumPrecipitationProbabilityPercent = 30;
  const { html } = renderDailySummary(input);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(html);
  // Gmail only supports a subset of CSS selectors. Drop pseudo-class rules,
  // just as the delivered message does, rather than testing full browser CSS.
  await page.evaluate(() => {
    const sanitize = (sheet: CSSStyleSheet | CSSGroupingRule) => {
      for (let index = sheet.cssRules.length - 1; index >= 0; index--) {
        const rule = sheet.cssRules[index]!;
        if (rule instanceof CSSStyleRule && rule.selectorText.includes(':')) sheet.deleteRule(index);
        else if (rule instanceof CSSGroupingRule) sanitize(rule);
      }
    };
    for (const sheet of document.styleSheets) sanitize(sheet);
  });
  const dividers = await page.locator('.daily-grid-row').evaluateAll((rows) => rows.map((row) => {
    const cells = row.querySelectorAll('.daily-grid-cell');
    return { left: getComputedStyle(cells[0]!).borderRightWidth, right: getComputedStyle(cells[1]!).borderRightWidth };
  }));
  expect(dividers).toEqual([{ left: '1px', right: '0px' }, { left: '1px', right: '0px' }]);
  const weatherDetails = page.getByText('Wind 6 km/h', { exact: true }).locator('..');
  await expect(weatherDetails).toContainText('Precip. 30% (Moderate)');
  expect(await weatherDetails.locator('p').allTextContents()).toEqual(['Warsaw', 'Wind 6 km/h', 'Partly cloudy', 'Precip. 30% (Moderate)']);
});


test('long first names wrap using properties that Gmail preserves', async ({ page }) => {
  const input = buildDailySummaryPrototypeFixture();
  input.userName = 'Alexandertheverylongfirstnamewithmanycharacterswithoutspaces';
  const { html } = renderDailySummary(input);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.setContent(html.replace(/overflow-wrap:anywhere;?/g, ''));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
