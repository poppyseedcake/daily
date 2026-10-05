import { test as base } from '@playwright/test';
import Database from 'better-sqlite3';
import { makeSignature } from 'better-auth/crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const test = base.extend<{ signedInUser: { database: Database.Database; userId: string } }>({
  signedInUser: async ({ page }, use) => {
    const port = process.env.PLAYWRIGHT_PORT ?? '5173';
    const database = new Database(join(tmpdir(), `daily-playwright-${port}.db`));
    database.pragma('foreign_keys = ON');
    const now = Math.floor(Date.now() / 1000);
    const userId = `setup-user-${crypto.randomUUID()}`;
    const email = `${userId}@example.com`;
    const token = crypto.randomUUID();
    try {
      database.prepare('insert into auth_user values (?, ?, ?, true, null, ?, ?)')
        .run(userId, 'Handoff User', email, now, now);
      database.prepare('insert into auth_session values (?, ?, ?, ?, ?, null, null, ?)')
        .run(crypto.randomUUID(), now + 3600, token, now, now, userId);
      database.prepare('insert into auth_account (id, account_id, provider_id, user_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), `google-${userId}`, 'google', userId, now, now);
      database.prepare('insert into users (id, google_subject, email, terms_version, terms_accepted_at) values (?, ?, ?, ?, ?)')
        .run(userId, `google-${userId}`, email, '2026-09-21', '2026-09-21T00:00:00.000Z');
      await page.context().addCookies([{
        name: 'better-auth.session_token',
        value: `${token}.${await makeSignature(token, 'daily-playwright-auth-secret-at-least-32-characters')}`,
        domain: '127.0.0.1',
        path: '/'
      }]);
      await page.addInitScript(() => localStorage.setItem('daily.onboarding.v1', 'seen'));
      await use({ database, userId });
    } finally {
      database.prepare('delete from users where id = ?').run(userId);
      database.prepare('delete from auth_user where id = ?').run(userId);
      database.close();
    }
  }
});

