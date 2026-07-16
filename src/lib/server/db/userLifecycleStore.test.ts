import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as schema from './schema';
import { createUserLifecycleStore } from './userLifecycleStore';

describe('SQLite User lifecycle boundary', () => {
  let sqlite: Database.Database;
  let store: ReturnType<typeof createUserLifecycleStore>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    for (const migration of [
      '0000_bootstrap_daily.sql',
      '0002_add_delivery_records.sql',
      '0011_add_next_summary_at.sql',
      '0012_add_scheduled_delivery_claims.sql',
      '0015_add_user_lifecycle.sql'
    ]) {
      sqlite.exec(readFileSync(`drizzle/${migration}`, 'utf8'));
    }
    store = createUserLifecycleStore(drizzle(sqlite, { schema }));
  });

  afterEach(() => sqlite.close());

  test('commits deleting, clears scheduling, and disables Summary Delivery atomically', async () => {
    sqlite.prepare(
      'insert into users (id, google_subject, email, next_summary_at) values (?, ?, ?, ?)'
    ).run('user-1', 'google-1', 'private@example.com', '2026-07-16T07:00:00Z');
    sqlite.prepare(
      'insert into summary_configurations (id, user_id, summary_delivery_enabled) values (?, ?, true)'
    ).run('configuration-1', 'user-1');

    await expect(store.startDeleting('user-1')).resolves.toBe(true);

    expect(sqlite.prepare(
      'select lifecycle_state, next_summary_at from users where id = ?'
    ).get('user-1')).toEqual({ lifecycle_state: 'deleting', next_summary_at: null });
    expect(sqlite.prepare(
      'select summary_delivery_enabled from summary_configurations where user_id = ?'
    ).get('user-1')).toEqual({ summary_delivery_enabled: 0 });
    await expect(store.isActive('user-1')).resolves.toBe(false);
  });

  test('repeated deletion cannot restore scheduling or Summary Delivery', async () => {
    sqlite.prepare(
      "insert into users (id, google_subject, email, lifecycle_state) values (?, ?, ?, 'deleting')"
    ).run('user-1', 'google-1', 'private@example.com');
    sqlite.prepare(
      'insert into summary_configurations (id, user_id, summary_delivery_enabled) values (?, ?, false)'
    ).run('configuration-1', 'user-1');

    await expect(store.startDeleting('user-1')).resolves.toBe(false);

    expect(sqlite.prepare(
      'select lifecycle_state, next_summary_at from users where id = ?'
    ).get('user-1')).toEqual({ lifecycle_state: 'deleting', next_summary_at: null });
    expect(sqlite.prepare(
      'select summary_delivery_enabled from summary_configurations where user_id = ?'
    ).get('user-1')).toEqual({ summary_delivery_enabled: 0 });
  });

  test('begins provider submission inside the active User transaction boundary', async () => {
    sqlite.prepare(
      'insert into users (id, google_subject, email) values (?, ?, ?)'
    ).run('user-1', 'google-1', 'private@example.com');
    const observedStates: string[] = [];

    await expect(
      store.beginProviderSubmission('user-1', async () => {
        const row = sqlite.prepare(
          'select lifecycle_state from users where id = ?'
        ).get('user-1') as { lifecycle_state: string };
        observedStates.push(row.lifecycle_state);
        return 'accepted';
      })
    ).resolves.toBe('accepted');
    expect(observedStates).toEqual(['active']);
  });

  test('does not begin provider submission after deleting is committed', async () => {
    sqlite.prepare(
      "insert into users (id, google_subject, email, lifecycle_state) values (?, ?, ?, 'deleting')"
    ).run('user-1', 'google-1', 'private@example.com');
    const submit = vi.fn();

    await expect(store.beginProviderSubmission('user-1', submit)).resolves.toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });
});
