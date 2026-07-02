import { describe, expect, test } from 'vitest';
import type { TodoCategory, TodoTask } from '$lib/todo';
import { loadUserTodoState, saveUserTodoState, type UserTodoPersistenceStore } from './todoPersistence';

const category = (userId: string, id: string, name: string, position: number) => ({
  id,
  userId,
  name,
  position
});

const task = (
  userId: string,
  id: string,
  title: string,
  categoryId: string | null,
  position: number
) => ({
  id,
  userId,
  title,
  categoryId,
  urgency: 'medium' as const,
  position,
  completed: false
});

const createStore = ({
  categories = [],
  tasks = [],
  failSave = false
}: {
  categories?: Array<TodoCategory & { userId: string }>;
  tasks?: Array<TodoTask & { userId: string }>;
  failSave?: boolean;
}): UserTodoPersistenceStore & { saved: Array<{ userId: string; todoState: unknown }> } => ({
  saved: [],
  async load(userId) {
    return {
      todoCategories: categories.filter((candidate) => candidate.userId === userId),
      todoTasks: tasks.filter((candidate) => candidate.userId === userId)
    };
  },
  async save(userId, todoState) {
    if (failSave) {
      throw new Error('store failed');
    }

    this.saved.push({ userId, todoState });
  }
});

describe('User Todo persistence', () => {
  test('loads Todo Categories and Todo Tasks scoped to the signed-in User', async () => {
    const store = createStore({
      categories: [
        category('user-2', 'category-other', 'Other User', 1),
        category('user-1', 'category-home', 'Home', 2),
        category('user-1', 'category-work', 'Work', 1)
      ],
      tasks: [
        task('user-2', 'todo-other', 'Other User task', null, 1),
        task('user-1', 'todo-work', 'Draft update', 'category-work', 1),
        task('user-1', 'todo-home', 'Water plants', 'category-home', 1)
      ]
    });

    await expect(loadUserTodoState(store, 'user-1')).resolves.toEqual({
      todoCategories: [
        { id: 'category-work', name: 'Work', position: 1 },
        { id: 'category-home', name: 'Home', position: 2 }
      ],
      todoTasks: [
        {
          id: 'todo-work',
          title: 'Draft update',
          categoryId: 'category-work',
          urgency: 'medium',
          position: 1,
          completed: false
        },
        {
          id: 'todo-home',
          title: 'Water plants',
          categoryId: 'category-home',
          urgency: 'medium',
          position: 1,
          completed: false
        }
      ],
      nextTodoId: 1
    });
  });

  test('saves the complete active Todo state for the signed-in User', async () => {
    const store = createStore({});

    await expect(
      saveUserTodoState(store, 'user-1', {
        todoCategories: [{ id: 'category-work', name: 'Work', position: 1 }],
        todoTasks: [
          {
            id: 'todo-work',
            title: 'Draft update',
            categoryId: 'category-work',
            urgency: 'high',
            position: 1,
            completed: false
          }
        ],
        nextTodoId: 8
      })
    ).resolves.toEqual({ outcome: 'saved' });

    expect(store.saved).toEqual([
      {
        userId: 'user-1',
        todoState: {
          todoCategories: [{ id: 'category-work', name: 'Work', position: 1 }],
          todoTasks: [
            {
              id: 'todo-work',
              title: 'Draft update',
              categoryId: 'category-work',
              urgency: 'high',
              position: 1,
              completed: false
            }
          ],
          nextTodoId: 8
        }
      }
    ]);
  });

  test('continues browser-generated Todo ids after a reload', async () => {
    const store = createStore({
      categories: [category('user-1', 'category-3', 'Work', 1)],
      tasks: [task('user-1', 'todo-7', 'Draft update', 'category-3', 1)]
    });

    await expect(loadUserTodoState(store, 'user-1')).resolves.toMatchObject({
      nextTodoId: 8
    });
  });
});
