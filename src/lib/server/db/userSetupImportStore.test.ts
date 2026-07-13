import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { Temporal } from '@js-temporal/polyfill';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { UserSetupImportDraft } from '$lib/localSetup';
import * as schema from './schema';
import { createUserCommuteSetupStore } from './commuteSetupStore';
import {
  persistUserSetupImportDraftForNewUser as persistUserSetupImportDraftForNewUserWithClock
} from './userSetupImportPersistence';
import { createUserSetupImportStore } from './userSetupImportStore';

const referenceInstant = Temporal.Instant.from('2026-06-22T00:00:00Z');
const persistUserSetupImportDraftForNewUser = (
  store: Parameters<typeof persistUserSetupImportDraftForNewUserWithClock>[0],
  userId: string,
  draft: Parameters<typeof persistUserSetupImportDraftForNewUserWithClock>[2],
  instant = referenceInstant
) => persistUserSetupImportDraftForNewUserWithClock(store, userId, draft, instant);

const createTestDatabase = () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(readFileSync('drizzle/0000_bootstrap_daily.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0003_add_weather_locations.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0010_add_commute_setup.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0011_add_next_summary_at.sql', 'utf8'));

  return {
    sqlite,
    database: drizzle(sqlite, { schema })
  };
};

const saveUser = (sqlite: Database.Database, id: string) => {
  sqlite
    .prepare(
      'insert into users (id, google_subject, email, created_at, updated_at) values (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
    )
    .run(id, `google-${id}`, `${id}@example.com`);
};

const validDraft = (): UserSetupImportDraft => ({
  summaryConfiguration: {
    id: 'summary-1',
    userId: 'user-1',
    summaryTime: '18:45',
    userTimeZone: 'Europe/Warsaw',
    summaryTheme: 'dark',
    summaryDeliveryEnabled: false,
    weatherSectionEnabled: false,
    commuteSectionEnabled: true,
    calendarSectionEnabled: true,
    todoSectionEnabled: true
  },
  todoCategories: [{ id: 'category-work', userId: 'user-1', name: 'Work', position: 1 }],
  todoTasks: [
    {
      id: 'todo-lunch',
      userId: 'user-1',
      categoryId: null,
      title: 'Pack lunch',
      urgency: 'medium',
      position: 1,
      completed: false
    },
    {
      id: 'todo-update',
      userId: 'user-1',
      categoryId: 'category-work',
      title: 'Send update',
      urgency: 'high',
      position: 1,
      completed: false
    }
  ],
  weatherLocation: {
    id: 'weather-location-1',
    userId: 'user-1',
    label: 'Warsaw, Poland',
    latitude: 52.2297,
    longitude: 21.0122
  },
  commuteRoutes: [
    {
      id: 'commute-route-1',
      userId: 'user-1',
      name: 'Morning commute',
      originLabel: 'Home',
      originLatitude: 52.2297,
      originLongitude: 21.0122,
      destinationLabel: 'Office',
      destinationLatitude: 52.2318,
      destinationLongitude: 21.0067,
      enabled: false,
      position: 1
    },
    {
      id: 'commute-route-2',
      userId: 'user-1',
      name: 'Evening commute',
      originLabel: 'Office garage',
      originLatitude: 52.2319,
      originLongitude: 21.0068,
      destinationLabel: 'Home entrance',
      destinationLatitude: 52.2298,
      destinationLongitude: 21.0123,
      enabled: true,
      position: 2
    }
  ],
  commuteDays: ['monday', 'wednesday', 'sunday']
});

describe('SQLite User Setup import store', () => {
  let sqlite: Database.Database;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    const testDatabase = createTestDatabase();
    sqlite = testDatabase.sqlite;
    database = testDatabase.database;
    saveUser(sqlite, 'user-1');
  });

  afterEach(() => {
    sqlite.close();
  });

  test('saves imported Summary Configuration and Todo data as existing User setup', async () => {
    const store = createUserSetupImportStore(database);
    const draft = validDraft();

    await expect(store.hasExistingUserSetup('user-1')).resolves.toBe(false);
    await store.transaction((transaction) => {
      transaction.saveSummaryConfiguration(draft.summaryConfiguration, null);
      transaction.saveTodoCategories(draft.todoCategories);
      transaction.saveTodoTasks(draft.todoTasks);
      transaction.saveWeatherLocation(draft.weatherLocation);
      transaction.saveCommuteRoutes(draft.commuteRoutes);
      transaction.saveCommuteDays('user-1', draft.commuteDays);
    });

    await expect(store.hasExistingUserSetup('user-1')).resolves.toBe(true);
    expect(sqlite.prepare('select summary_time, summary_theme from summary_configurations').all()).toEqual([
      { summary_time: '18:45', summary_theme: 'dark' }
    ]);
    expect(sqlite.prepare('select name, position from todo_categories').all()).toEqual([
      { name: 'Work', position: 1 }
    ]);
    expect(sqlite.prepare('select title, category_id, urgency, position from todo_tasks order by id').all()).toEqual([
      { title: 'Pack lunch', category_id: null, urgency: 'medium', position: 1 },
      { title: 'Send update', category_id: 'category-work', urgency: 'high', position: 1 }
    ]);
    expect(sqlite.prepare('select label, latitude, longitude from weather_locations').all()).toEqual([
      { label: 'Warsaw, Poland', latitude: 52.2297, longitude: 21.0122 }
    ]);
    expect(sqlite.prepare(`
      select name, origin_label, origin_latitude, origin_longitude,
        destination_label, destination_latitude, destination_longitude, enabled, position
      from commute_routes order by position
    `).all()).toEqual([
      {
        name: 'Morning commute',
        origin_label: 'Home',
        origin_latitude: 52.2297,
        origin_longitude: 21.0122,
        destination_label: 'Office',
        destination_latitude: 52.2318,
        destination_longitude: 21.0067,
        enabled: 0,
        position: 1
      },
      {
        name: 'Evening commute',
        origin_label: 'Office garage',
        origin_latitude: 52.2319,
        origin_longitude: 21.0068,
        destination_label: 'Home entrance',
        destination_latitude: 52.2298,
        destination_longitude: 21.0123,
        enabled: 1,
        position: 2
      }
    ]);
    expect(sqlite.prepare('select day from commute_days order by day').all()).toEqual([
      { day: 'monday' },
      { day: 'sunday' },
      { day: 'wednesday' }
    ]);
  });

  test('saves an imported eligible configuration with its schedule in the same transaction', async () => {
    const store = createUserSetupImportStore(database);
    const draft = validDraft();
    draft.summaryConfiguration.summaryDeliveryEnabled = true;

    await persistUserSetupImportDraftForNewUser(
      store,
      'user-1',
      draft,
      Temporal.Instant.from('2026-06-22T16:45:00Z')
    );

    expect(sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')).toEqual({
      next_summary_at: '2026-06-23T16:45:00Z'
    });
  });

  test('treats an existing Weather Location as existing User setup', async () => {
    const store = createUserSetupImportStore(database);

    await store.transaction((transaction) => {
      transaction.saveWeatherLocation(validDraft().weatherLocation);
    });

    await expect(store.hasExistingUserSetup('user-1')).resolves.toBe(true);
  });

  test('keeps existing Commute Days while importing the remaining browser Local Setup', async () => {
    const store = createUserSetupImportStore(database);
    const draft = validDraft();

    await store.transaction((transaction) => {
      transaction.saveCommuteDays('user-1', ['saturday', 'sunday']);
    });

    await expect(store.hasExistingUserSetup('user-1')).resolves.toBe(false);
    await expect(persistUserSetupImportDraftForNewUser(store, 'user-1', draft)).resolves.toEqual({
      outcome: 'imported'
    });
    expect(sqlite.prepare('select summary_time from summary_configurations').all()).toEqual([
      { summary_time: '18:45' }
    ]);
    expect(sqlite.prepare('select id from commute_routes').all()).toEqual([]);
    expect(sqlite.prepare('select day from commute_days order by day').all()).toEqual([
      { day: 'saturday' },
      { day: 'sunday' }
    ]);
  });

  test('keeps an existing User Commute Route while importing the remaining browser Local Setup', async () => {
    const store = createUserSetupImportStore(database);
    const savedRoute = {
      ...validDraft().commuteRoutes[0]!,
      id: 'saved-route',
      name: 'Saved user route',
      destinationLabel: 'Saved destination'
    };

    await store.transaction((transaction) => {
      transaction.saveCommuteRoutes([savedRoute]);
      transaction.saveCommuteDays('user-1', ['tuesday']);
    });

    await expect(
      persistUserSetupImportDraftForNewUser(store, 'user-1', validDraft())
    ).resolves.toEqual({ outcome: 'imported' });
    expect(sqlite.prepare('select id, name, destination_label from commute_routes').all()).toEqual([
      { id: 'saved-route', name: 'Saved user route', destination_label: 'Saved destination' }
    ]);
    expect(sqlite.prepare('select day from commute_days').all()).toEqual([{ day: 'tuesday' }]);
    expect(sqlite.prepare('select summary_time from summary_configurations').all()).toEqual([
      { summary_time: '18:45' }
    ]);
  });

  test('imports unrelated Visitor setup after a first User route bootstraps Commute Days', async () => {
    const commuteStore = createUserCommuteSetupStore(database);
    const importStore = createUserSetupImportStore(database);
    const savedRoute = await commuteStore.createRoute('user-1', {
      name: 'Saved user route',
      origin: { label: 'Saved home', latitude: 50.1, longitude: 20.1 },
      destination: { label: 'Saved office', latitude: 50.2, longitude: 20.2 }
    });

    expect(savedRoute).not.toBe('route-limit-reached');
    await expect(
      persistUserSetupImportDraftForNewUser(importStore, 'user-1', validDraft())
    ).resolves.toEqual({ outcome: 'imported' });
    expect(sqlite.prepare('select summary_time from summary_configurations').all()).toEqual([
      { summary_time: '18:45' }
    ]);
    expect(sqlite.prepare('select title from todo_tasks order by title').all()).toEqual([
      { title: 'Pack lunch' },
      { title: 'Send update' }
    ]);
    expect(sqlite.prepare('select name from commute_routes').all()).toEqual([
      { name: 'Saved user route' }
    ]);
    expect(sqlite.prepare('select day from commute_days order by day').all()).toEqual([
      { day: 'friday' },
      { day: 'monday' },
      { day: 'thursday' },
      { day: 'tuesday' },
      { day: 'wednesday' }
    ]);
  });

  test('scopes existing setup checks and imported Commute data to the requested User', async () => {
    saveUser(sqlite, 'user-2');
    const store = createUserSetupImportStore(database);
    const otherUserRoute = {
      ...validDraft().commuteRoutes[0]!,
      id: 'other-user-route',
      userId: 'user-2',
      name: 'Other user private route'
    };

    await store.transaction((transaction) => {
      transaction.saveCommuteRoutes([otherUserRoute]);
      transaction.saveCommuteDays('user-2', ['friday']);
    });

    await expect(
      persistUserSetupImportDraftForNewUser(store, 'user-1', validDraft())
    ).resolves.toEqual({ outcome: 'imported' });
    expect(sqlite.prepare('select user_id, name from commute_routes order by user_id, position').all()).toEqual([
      { user_id: 'user-1', name: 'Morning commute' },
      { user_id: 'user-1', name: 'Evening commute' },
      { user_id: 'user-2', name: 'Other user private route' }
    ]);
    expect(sqlite.prepare("select day from commute_days where user_id = 'user-2'").all()).toEqual([
      { day: 'friday' }
    ]);
  });
});
