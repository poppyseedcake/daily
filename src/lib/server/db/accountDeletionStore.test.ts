import { readFileSync, readdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as schema from './schema';
import { createAccountDeletionStore } from './accountDeletionStore';

describe('SQLite account deletion boundary', () => {
  let sqlite: Database.Database;
  let store: ReturnType<typeof createAccountDeletionStore>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    for (const file of readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort()) {
      sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''));
    }
    store = createAccountDeletionStore(drizzle(sqlite, { schema }));
    seedUserData(sqlite);
  });

  afterEach(() => sqlite.close());

  test('first commits a resumable non-deliverable deleting state', async () => {
    await expect(store.startDeleting('user-1')).resolves.toBe('started');
    expect(sqlite.prepare('select lifecycle_state, next_summary_at from users').get()).toEqual({
      lifecycle_state: 'deleting', next_summary_at: null
    });
    expect(sqlite.prepare('select summary_delivery_enabled from summary_configurations').get())
      .toEqual({ summary_delivery_enabled: 0 });
    await expect(store.startDeleting('user-1')).resolves.toBe('resuming');
  });

  test('loads local Google credentials for best-effort revocation', async () => {
    await expect(store.loadGoogleTokens('user-1')).resolves.toEqual([
      'access-canary', 'refresh-canary', 'id-canary'
    ]);
  });

  test('transaction and cascades remove every User-owned and authentication table', async () => {
    await store.startDeleting('user-1');
    await expect(store.finishDeleting('user-1', 'person-1')).resolves.toBe(true);

    for (const table of [
      'summary_configurations', 'todo_tasks', 'todo_categories', 'weather_locations',
      'commute_routes', 'commute_days', 'calendar_connections', 'selected_calendars',
      'delivery_records', 'auth_session', 'auth_account', 'auth_user', 'users'
    ]) {
      expect(sqlite.prepare(`select count(*) as count from ${table}`).get(), table).toEqual({ count: 0 });
    }
    expect(sqlite.prepare('select count(*) as count from google_maps_person_usage').get())
      .toEqual({ count: 0 });
  });

  test('preserves anonymous Maps operations and aggregate Worker Runs', async () => {
    await store.startDeleting('user-1');
    await store.finishDeleting('user-1', 'person-1');
    for (const table of ['google_maps_usage', 'google_maps_control', 'google_maps_cap_alerts', 'scheduled_worker_runs']) {
      expect(sqlite.prepare(`select count(*) as count from ${table}`).get(), table).toEqual({ count: 1 });
    }
  });
});

const seedUserData = (sqlite: Database.Database) => {
  sqlite.prepare("insert into users (id, google_subject, email, next_summary_at) values ('user-1','google-1','private@example.com','2026-07-16T07:00:00Z')").run();
  sqlite.prepare("insert into summary_configurations (id,user_id) values ('summary-1','user-1')").run();
  sqlite.prepare("insert into todo_categories values ('category-1','user-1','Private',0)").run();
  sqlite.prepare("insert into todo_tasks values ('task-1','user-1','category-1','Canary','high',0,false)").run();
  sqlite.prepare("insert into weather_locations values ('weather-1','user-1','Private place',1,2)").run();
  sqlite.prepare("insert into commute_routes (id,user_id,name,origin_label,origin_latitude,origin_longitude,destination_label,destination_latitude,destination_longitude,preview_duration_minutes,enabled,position) values ('route-1','user-1','Work','A',1,2,'B',3,4,12,true,0)").run();
  sqlite.prepare("insert into commute_days values ('user-1','monday')").run();
  sqlite.prepare("insert into calendar_connections (id,user_id,connection_status) values ('calendar-1','user-1','connected')").run();
  sqlite.prepare("insert into selected_calendars (id,user_id,calendar_id,position) values ('selected-1','user-1','private-calendar',0)").run();
  sqlite.prepare("insert into delivery_records (id,user_id,attempt_type,requested_at,delivery_status,provider_name) values ('delivery-1','user-1','test','2026-07-16T00:00:00Z','sent','resend')").run();
  sqlite.prepare("insert into auth_user values ('user-1','Private','private@example.com',true,null,1,1)").run();
  sqlite.prepare("insert into auth_session values ('session-1',9999999999,'session-canary',1,1,null,null,'user-1')").run();
  sqlite.prepare("insert into auth_account (id,account_id,provider_id,user_id,access_token,refresh_token,id_token,created_at,updated_at) values ('account-1','google-1','google','user-1','access-canary','refresh-canary','id-canary',1,1)").run();
  sqlite.prepare("insert into google_maps_person_usage values ('2026-07-16','person-1','routes',2)").run();
  sqlite.prepare("insert into google_maps_usage values ('day','2026-07-16','commute-estimate',2)").run();
  sqlite.prepare("insert into google_maps_control values ('admin-kill-switch',false)").run();
  sqlite.prepare("insert into google_maps_cap_alerts values ('daily','2026-07-16','delivered','2026-07-16T00:00:00Z',null,null)").run();
  sqlite.prepare("insert into scheduled_worker_runs values ('run-1','2026-07-16T00:00:00Z','2026-07-16T00:00:01Z',1000,'succeeded',null,1,1,0,0,0,0)").run();
};
