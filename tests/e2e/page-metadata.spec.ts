import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { makeSignature } from 'better-auth/crypto';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const publicPages = [
  {
    path: '/',
    title: 'Daily - your everyday kickoff',
    description:
      'Start your day with tasks, weather, commute times and Google Calendar events in one personal email, delivered at the time you choose.'
  },
  {
    path: '/privacy',
    title: 'Privacy Policy · Daily',
    description:
      'This Privacy Policy explains how Daily handles personal data when you use the free Daily service.'
  },
  {
    path: '/terms',
    title: 'Terms of Service · Daily',
    description: 'These Terms describe the free Daily service and the rules for using it.'
  }
] as const;

const prototypePaths = [
  '/prototype',
  '/prototype/',
  '/prototype/error-pages',
  '/prototype/open-graph',
  '/prototype/daily',
  '/prototype/daily-summary',
  '/prototype/context-separation',
  '/prototype/commute-email'
];

const expectPublicMetadata = async (page: Page, expected: (typeof publicPages)[number]) => {
  const canonical = `https://dailykickoff.eu${expected.path}`;
  const image = 'https://dailykickoff.eu/og/daily-kickoff.png';
  const imageAlt =
    'Daily - your everyday kickoff. Weather, commute, calendar and tasks brought together.';

  await expect(page.locator('head title')).toHaveCount(1);
  await expect(page).toHaveTitle(expected.title);
  await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', canonical);
  await expect(page.locator('head meta[name="robots"]')).toHaveCount(0);

  for (const [name, content] of Object.entries({
    description: expected.description,
    'twitter:card': 'summary_large_image',
    'twitter:title': expected.title,
    'twitter:description': expected.description,
    'twitter:image': image,
    'twitter:image:alt': imageAlt
  })) {
    const tag = page.locator(`head meta[name="${name}"]`);
    await expect(tag).toHaveCount(1);
    await expect(tag).toHaveAttribute('content', content);
  }

  for (const [property, content] of Object.entries({
    'og:type': 'website',
    'og:site_name': 'Daily',
    'og:locale': 'en_US',
    'og:title': expected.title,
    'og:description': expected.description,
    'og:url': canonical,
    'og:image': image,
    'og:image:type': 'image/png',
    'og:image:width': '1730',
    'og:image:height': '909',
    'og:image:alt': imageAlt
  })) {
    const tag = page.locator(`head meta[property="${property}"]`);
    await expect(tag).toHaveCount(1);
    await expect(tag).toHaveAttribute('content', content);
  }
};

const expectNoindex = async (page: Page) => {
  const robots = page.locator('head meta[name="robots"]');
  await expect(robots).toHaveCount(1);
  await expect(robots).toHaveAttribute('content', 'noindex, nofollow');
};

test.describe('server-rendered discovery metadata', () => {
  test.use({ javaScriptEnabled: false });

  for (const expected of publicPages) {
    test(`${expected.path} has unique public metadata and query-free canonical/social URLs`, async ({
      page
    }) => {
      for (const suffix of ['', '?auth=signin&utm_source=metadata-test']) {
        const response = await page.goto(`${expected.path}${suffix}`);
        expect(response?.status()).toBe(200);
        await expectPublicMetadata(page, expected);
      }
    });
  }

  for (const path of prototypePaths) {
    test(`${path} returns 404 before JavaScript runs`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page).toHaveTitle('Page not found · Daily');
      await expectNoindex(page);
    });
  }

  test('anonymous Admin Panel requests remain forbidden and carry noindex', async ({ page }) => {
    const response = await page.goto('/admin');
    expect(response?.status()).toBe(403);
    await expectNoindex(page);
    await expect(page.getByRole('heading', { name: 'Admin Panel', exact: true })).toHaveCount(0);
  });

  test('authorized Admin Panel responses also carry noindex', async ({ page }) => {
    const port = process.env.PLAYWRIGHT_PORT ?? '5173';
    const database = new Database(join(tmpdir(), `daily-playwright-${port}.db`));
    database.pragma('foreign_keys = ON');
    const now = Math.floor(Date.now() / 1000);
    const userId = `metadata-admin-${randomUUID()}`;
    const sessionToken = randomUUID();

    try {
      database.prepare(
        'insert into auth_user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, true, ?, ?)'
      ).run(userId, 'Metadata Admin', 'admin@example.com', now, now);
      database.prepare(
        'insert into auth_session (id, expires_at, token, created_at, updated_at, user_id) values (?, ?, ?, ?, ?, ?)'
      ).run(randomUUID(), now + 3600, sessionToken, now, now, userId);
      database.prepare(
        'insert into auth_account (id, account_id, provider_id, user_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)'
      ).run(randomUUID(), `google-${userId}`, 'google', userId, now, now);

      await page.context().addCookies([{
        name: 'better-auth.session_token',
        value: `${sessionToken}.${await makeSignature(
          sessionToken,
          'daily-playwright-auth-secret-at-least-32-characters'
        )}`,
        domain: '127.0.0.1',
        path: '/'
      }]);

      const response = await page.goto('/admin');
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Admin Panel', exact: true })).toBeVisible();
      await expectNoindex(page);
    } finally {
      database.prepare('delete from auth_user where id = ?').run(userId);
      database.close();
    }
  });
});

test('client navigation removes error noindex and updates public tags without duplicates', async ({
  page
}) => {
  await page.addInitScript(() => localStorage.setItem('daily.onboarding.v1', 'seen'));
  await page.goto('/prototype/daily-summary');
  await page.waitForLoadState('networkidle');
  await expectNoindex(page);
  await page.evaluate(() => {
    document.documentElement.dataset.metadataNavigation = 'same-document';
  });

  await page.getByRole('link', { name: 'Go to Daily', exact: true }).click();
  await expectPublicMetadata(page, publicPages[0]);
  await page.getByRole('link', { name: 'Privacy', exact: true }).first().click();
  await expectPublicMetadata(page, publicPages[1]);
  await page.getByRole('navigation', { name: 'Public pages' })
    .getByRole('link', { name: 'Terms', exact: true }).click();
  await expectPublicMetadata(page, publicPages[2]);
  await page.getByRole('link', { name: 'Back to Daily', exact: true }).click();
  await expectPublicMetadata(page, publicPages[0]);
  await expect(page.locator('html')).toHaveAttribute('data-metadata-navigation', 'same-document');
});

test('robots permits excluded pages to be fetched and the sitemap lists only public pages', async ({
  request
}) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  const directives = (await robots.text()).split('\n').map((line) => line.trim());
  expect(directives).toContain('User-agent: *');
  expect(directives).toContain('Allow: /');
  expect(directives).toContain('Sitemap: https://dailykickoff.eu/sitemap.xml');
  const disallowedPaths = directives
    .filter((line) => line.startsWith('Disallow:'))
    .map((line) => line.slice('Disallow:'.length).trim())
    .filter(Boolean);
  for (const path of [...publicPages.map((page) => page.path), '/admin', ...prototypePaths]) {
    expect(disallowedPaths.some((prefix) => path.startsWith(prefix)), path).toBe(false);
  }

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const locations = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1]);
  expect(locations).toEqual(publicPages.map((page) => `https://dailykickoff.eu${page.path}`));
});

test('the shared image matches its advertised dimensions and retained original checksum', async ({
  request
}) => {
  const response = await request.get('/og/daily-kickoff.png');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/png');
  const image = await response.body();
  expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(image.readUInt32BE(16)).toBe(1730);
  expect(image.readUInt32BE(20)).toBe(909);
  expect(createHash('sha256').update(image).digest('hex'))
    .toBe('f9763e50ac283ee6f3935464bbc9eccf10547e2619996dcd240311f46efdb213');
});
