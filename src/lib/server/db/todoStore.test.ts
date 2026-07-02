import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createUserTodoStore } from './todoStore';
import * as schema from './schema';

const createTestDatabase = () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(readFileSync('drizzle/0000_bootstrap_daily.sql', 'utf8'));

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

describe('SQLite User Todo store', () => {
  let sqlite: Database.Database;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    const testDatabase = createTestDatabase();
    sqlite = testDatabase.sqlite;
    database = testDatabase.database;
    saveUser(sqlite, 'user-1');
    saveUser(sqlite, 'user-2');
  });

  afterEach(() => {
    sqlite.close();
  });

  test('persists browser-generated Todo ids without colliding between Users', async () => {
    const store = createUserTodoStore(database);
    const todoState = {
      todoCategories: [{ id: 'category-1', name: 'Work', position: 1 }],
      todoTasks: [
        {
          id: 'todo-1',
          title: 'Draft update',
          categoryId: 'category-1',
          urgency: 'medium' as const,
          position: 1,
          completed: false
        }
      ],
      nextTodoId: 2
    };

    await expect(store.save('user-1', todoState)).resolves.toBeUndefined();
    await expect(store.save('user-2', todoState)).resolves.toBeUndefined();

    await expect(store.load('user-1')).resolves.toEqual({
      todoCategories: [{ id: 'category-1', name: 'Work', position: 1 }],
      todoTasks: [
        {
          id: 'todo-1',
          title: 'Draft update',
          categoryId: 'category-1',
          urgency: 'medium',
          position: 1,
          completed: false
        }
      ]
    });
    await expect(store.load('user-2')).resolves.toEqual({
      todoCategories: [{ id: 'category-1', name: 'Work', position: 1 }],
      todoTasks: [
        {
          id: 'todo-1',
          title: 'Draft update',
          categoryId: 'category-1',
          urgency: 'medium',
          position: 1,
          completed: false
        }
      ]
    });
  });

  test('rejects Todo Tasks that reference categories outside the saved User Todo state', async () => {
    const store = createUserTodoStore(database);
    await store.save('user-1', {
      todoCategories: [{ id: 'category-1', name: 'Work', position: 1 }],
      todoTasks: [],
      nextTodoId: 2
    });

    await expect(
      store.save('user-2', {
        todoCategories: [],
        todoTasks: [
          {
            id: 'todo-1',
            title: 'Invalid reference',
            categoryId: 'category-1',
            urgency: 'high',
            position: 1,
            completed: false
          }
        ],
        nextTodoId: 2
      })
    ).rejects.toThrow('Todo Task category must belong to the saved User Todo state.');

    await expect(store.load('user-1')).resolves.toEqual({
      todoCategories: [{ id: 'category-1', name: 'Work', position: 1 }],
      todoTasks: []
    });
    await expect(store.load('user-2')).resolves.toEqual({
      todoCategories: [],
      todoTasks: []
    });
  });
});
