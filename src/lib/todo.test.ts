import { describe, expect, test } from 'vitest';
import {
  addTodoTask,
  completeTodoTask,
  reorderTodoTasks,
  tasksForTodoCategory,
  updateTodoTask,
  type TodoTask
} from './todo';

const baseTasks: TodoTask[] = [
  { id: 'todo-1', title: 'Plan meals', categoryId: null, urgency: 'low', position: 1 },
  { id: 'todo-2', title: 'Buy groceries', categoryId: null, urgency: 'medium', position: 2 },
  { id: 'todo-3', title: 'Draft update', categoryId: 'work', urgency: 'high', position: 1 }
];

describe('Todo Module task lifecycle', () => {
  test('creates trimmed uncategorized and categorized Todo Tasks after validating titles', () => {
    const withUncategorized = addTodoTask({
      tasks: [],
      input: { title: '  Buy oats  ', categoryId: null, urgency: 'low' },
      nextId: () => 'todo-1'
    });

    expect(withUncategorized).toEqual([
      { id: 'todo-1', title: 'Buy oats', categoryId: null, urgency: 'low', position: 1 }
    ]);

    const withCategorized = addTodoTask({
      tasks: [
        ...withUncategorized,
        { id: 'todo-2', title: 'Book electrician', categoryId: 'home', urgency: 'medium', position: 3 }
      ],
      input: { title: 'Call plumber', categoryId: 'home', urgency: 'high' },
      nextId: () => 'todo-3'
    });

    expect(withCategorized.at(-1)).toEqual({
      id: 'todo-3',
      title: 'Call plumber',
      categoryId: 'home',
      urgency: 'high',
      position: 4
    });
    expect(addTodoTask({ tasks: [], input: { title: '   ', categoryId: null, urgency: 'low' }, nextId: () => 'x' })).toEqual([]);
    expect(
      addTodoTask({
        tasks: [],
        input: { title: 'x'.repeat(121), categoryId: null, urgency: 'low' },
        nextId: () => 'x'
      })
    ).toEqual([]);
  });

  test('edits Todo Task title and Urgency while preserving position', () => {
    const result = updateTodoTask(baseTasks, {
      id: 'todo-2',
      title: '  Buy groceries and fruit  ',
      urgency: 'high'
    });

    expect(result).toContainEqual({
      id: 'todo-2',
      title: 'Buy groceries and fruit',
      categoryId: null,
      urgency: 'high',
      position: 2
    });
  });

  test('completes Todo Tasks by removing them from active Todo state', () => {
    expect(completeTodoTask(baseTasks, 'todo-2')).toEqual([
      { id: 'todo-1', title: 'Plan meals', categoryId: null, urgency: 'low', position: 1 },
      { id: 'todo-3', title: 'Draft update', categoryId: 'work', urgency: 'high', position: 1 }
    ]);
  });

  test('groups Todo Tasks by category with ordered null category support', () => {
    const tasks = [
      ...baseTasks,
      { id: 'todo-4', title: 'Pack lunch', categoryId: null, urgency: 'low', position: 3 },
      { id: 'todo-5', title: 'Review PR', categoryId: 'work', urgency: 'medium', position: 2 },
      { id: 'todo-6', title: 'Water plants', categoryId: 'home', urgency: 'low', position: 1 }
    ] satisfies TodoTask[];

    expect(tasksForTodoCategory(tasks, null)).toEqual([
      { id: 'todo-1', title: 'Plan meals', categoryId: null, urgency: 'low', position: 1 },
      { id: 'todo-2', title: 'Buy groceries', categoryId: null, urgency: 'medium', position: 2 },
      { id: 'todo-4', title: 'Pack lunch', categoryId: null, urgency: 'low', position: 3 }
    ]);
    expect(tasksForTodoCategory(tasks, 'work')).toEqual([
      { id: 'todo-3', title: 'Draft update', categoryId: 'work', urgency: 'high', position: 1 },
      { id: 'todo-5', title: 'Review PR', categoryId: 'work', urgency: 'medium', position: 2 }
    ]);
  });

  test('reorders Todo Tasks through the module transition path', () => {
    const result = reorderTodoTasks(baseTasks, {
      categoryId: 'home',
      orderedTasks: [
        { id: 'todo-3', title: 'Draft update', categoryId: 'work', urgency: 'high', position: 1 },
        { id: 'todo-2', title: 'Buy groceries', categoryId: null, urgency: 'medium', position: 2 }
      ]
    });

    expect(result).toEqual([
      { id: 'todo-1', title: 'Plan meals', categoryId: null, urgency: 'low', position: 1 },
      { id: 'todo-2', title: 'Buy groceries', categoryId: 'home', urgency: 'medium', position: 2 },
      { id: 'todo-3', title: 'Draft update', categoryId: 'home', urgency: 'high', position: 1 }
    ]);
  });
});
