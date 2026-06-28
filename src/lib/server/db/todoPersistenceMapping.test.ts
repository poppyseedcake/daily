import { describe, expect, test } from 'vitest';
import {
  mapTodoCategoriesFromRows,
  mapTodoCategoryToRow,
  mapTodoTaskToRow,
  mapTodoTasksFromRows
} from './todoPersistenceMapping';

describe('Todo persistence row mapping', () => {
  test('maps Todo Category rows to and from the Todo Module domain shape with position preserved', () => {
    const categories = mapTodoCategoriesFromRows([
      { id: 'category-work', userId: 'user-1', name: 'Work', position: 2 },
      { id: 'category-home', userId: 'user-1', name: 'Home', position: 1 }
    ]);

    expect(categories).toEqual([
      { id: 'category-home', name: 'Home', position: 1 },
      { id: 'category-work', name: 'Work', position: 2 }
    ]);
    expect(mapTodoCategoryToRow(categories[1], 'user-1')).toEqual({
      id: 'category-work',
      userId: 'user-1',
      name: 'Work',
      position: 2
    });
  });

  test('maps Todo Task rows to and from the Todo Module domain shape with saved task state preserved', () => {
    const tasks = mapTodoTasksFromRows([
      {
        id: 'todo-work-2',
        userId: 'user-1',
        categoryId: 'category-work',
        title: 'Send agenda',
        urgency: 'high',
        position: 2,
        completed: true
      },
      {
        id: 'todo-uncategorized-1',
        userId: 'user-1',
        categoryId: null,
        title: 'Buy coffee',
        urgency: 'low',
        position: 1,
        completed: false
      },
      {
        id: 'todo-work-1',
        userId: 'user-1',
        categoryId: 'category-work',
        title: 'Draft update',
        urgency: 'medium',
        position: 1,
        completed: false
      }
    ]);

    expect(tasks).toEqual([
      {
        id: 'todo-uncategorized-1',
        categoryId: null,
        title: 'Buy coffee',
        urgency: 'low',
        position: 1,
        completed: false
      },
      {
        id: 'todo-work-1',
        categoryId: 'category-work',
        title: 'Draft update',
        urgency: 'medium',
        position: 1,
        completed: false
      },
      {
        id: 'todo-work-2',
        categoryId: 'category-work',
        title: 'Send agenda',
        urgency: 'high',
        position: 2,
        completed: true
      }
    ]);
    expect(mapTodoTaskToRow(tasks[1], 'user-1')).toEqual({
      id: 'todo-work-1',
      userId: 'user-1',
      categoryId: 'category-work',
      title: 'Draft update',
      urgency: 'medium',
      position: 1,
      completed: false
    });
  });

  test('keeps low as the Visitor default Urgency when saved User data has no explicit Urgency', () => {
    expect(
      mapTodoTasksFromRows([
        {
          id: 'todo-default',
          userId: 'user-1',
          categoryId: null,
          title: 'Use visitor default',
          urgency: null,
          position: 1,
          completed: false
        }
      ])
    ).toEqual([
      {
        id: 'todo-default',
        categoryId: null,
        title: 'Use visitor default',
        urgency: 'low',
        position: 1,
        completed: false
      }
    ]);
  });
});
