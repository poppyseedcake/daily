import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { expect, test } from 'vitest';
import * as schema from './schema';
import { createUserNameStore } from './userNameStore';

test('loads only the active Daily User Google profile, including differing legacy auth IDs', async () => {
  const sqlite = new Database(':memory:');
  try {
    for (const migration of ['0000_bootstrap_daily.sql', '0001_add_better_auth_tables.sql', '0015_add_user_lifecycle.sql']) {
      sqlite.exec(readFileSync(`drizzle/${migration}`, 'utf8'));
    }
    sqlite.prepare('insert into users (id, google_subject, email) values (?, ?, ?)')
      .run('daily-1', 'google-1', 'user1@example.test');
    sqlite.prepare('insert into users (id, google_subject, email) values (?, ?, ?)')
      .run('daily-2', 'google-2', 'user2@example.test');
    const profile = sqlite.prepare('insert into auth_user (id, name, email, created_at, updated_at) values (?, ?, ?, 0, 0)');
    profile.run('auth-1', 'Wojtek M.', 'user1@example.test');
    profile.run('auth-2', 'Other User', 'user2@example.test');
    const account = sqlite.prepare('insert into auth_account (id, account_id, provider_id, user_id, created_at, updated_at) values (?, ?, ?, ?, 0, 0)');
    account.run('account-1', 'google-1', 'google', 'auth-1');
    account.run('account-2', 'google-2', 'google', 'auth-2');
    const store = createUserNameStore(drizzle(sqlite, { schema }));
    await expect(store.load('daily-1')).resolves.toBe('Wojtek M.');
    await expect(store.load('daily-2')).resolves.toBe('Other User');
    await expect(store.load('missing')).resolves.toBeUndefined();
    sqlite.prepare("update users set lifecycle_state = 'deleting' where id = ?").run('daily-1');
    await expect(store.load('daily-1')).resolves.toBeUndefined();
  } finally {
    sqlite.close();
  }
});
