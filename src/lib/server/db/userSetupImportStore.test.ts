import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { UserSetupImportDraft } from '$lib/localSetup';
import * as schema from './schema';
import { createUserSetupImportStore } from './userSetupImportStore';

const createTestDatabase = () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(readFileSync('drizzle/0000_bootstrap_daily.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0003_add_weather_locations.sql', 'utf8'));

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
  }
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
      transaction.saveSummaryConfiguration(draft.summaryConfiguration);
      transaction.saveTodoCategories(draft.todoCategories);
      transaction.saveTodoTasks(draft.todoTasks);
      transaction.saveWeatherLocation(draft.weatherLocation);
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
  });

  test('treats an existing Weather Location as existing User setup', async () => {
    const store = createUserSetupImportStore(database);

    await store.transaction((transaction) => {
      transaction.saveWeatherLocation(validDraft().weatherLocation);
    });

    await expect(store.hasExistingUserSetup('user-1')).resolves.toBe(true);
  });
});
