import { describe, expect, test } from 'vitest';
import {
  addTodoCategory,
  addTodoTask,
  buildTodoSection,
  completeTodoTask,
  deleteTodoCategory,
  reorderTodoTasks,
  tasksForTodoCategory,
  updateTodoCategory,
  type TodoCategory,
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

  test('keeps Todo Task ordering position-based when Urgency changes', () => {
    const tasks: TodoTask[] = [
      { id: 'todo-1', title: 'Draft update', categoryId: 'work', urgency: 'low', position: 1 },
      { id: 'todo-2', title: 'Review launch notes', categoryId: 'work', urgency: 'medium', position: 2 },
      { id: 'todo-3', title: 'Send agenda', categoryId: 'work', urgency: 'high', position: 3 }
    ];

    const result = updateTodoTask(tasks, {
      id: 'todo-1',
      title: 'Draft update',
      urgency: 'high'
    });

    expect(tasksForTodoCategory(result, 'work').map((task) => task.id)).toEqual([
      'todo-1',
      'todo-2',
      'todo-3'
    ]);
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
      orderedTaskIds: ['todo-3', 'todo-2']
    });

    expect(result).toEqual([
      { id: 'todo-1', title: 'Plan meals', categoryId: null, urgency: 'low', position: 1 },
      { id: 'todo-2', title: 'Buy groceries', categoryId: 'home', urgency: 'medium', position: 2 },
      { id: 'todo-3', title: 'Draft update', categoryId: 'home', urgency: 'high', position: 1 }
    ]);
  });

  test('reorders Todo Tasks in one grouping from ordered Todo Task ids', () => {
    const tasks: TodoTask[] = [
      { id: 'todo-1', title: 'Plan meals', categoryId: null, urgency: 'low', position: 1 },
      { id: 'todo-2', title: 'Buy groceries', categoryId: null, urgency: 'medium', position: 2 },
      { id: 'todo-3', title: 'Cook dinner', categoryId: null, urgency: 'high', position: 3 },
      { id: 'todo-4', title: 'Draft update', categoryId: 'work', urgency: 'high', position: 1 }
    ];

    const result = reorderTodoTasks(tasks, {
      categoryId: null,
      orderedTaskIds: ['todo-3', 'todo-1', 'todo-2']
    });

    expect(tasksForTodoCategory(result, null)).toEqual([
      { id: 'todo-3', title: 'Cook dinner', categoryId: null, urgency: 'high', position: 1 },
      { id: 'todo-1', title: 'Plan meals', categoryId: null, urgency: 'low', position: 2 },
      { id: 'todo-2', title: 'Buy groceries', categoryId: null, urgency: 'medium', position: 3 }
    ]);
    expect(tasksForTodoCategory(result, 'work')).toEqual([
      { id: 'todo-4', title: 'Draft update', categoryId: 'work', urgency: 'high', position: 1 }
    ]);
  });

  test('moves Todo Tasks between groupings from ordered Todo Task ids while preserving task data', () => {
    const tasks: TodoTask[] = [
      { id: 'todo-1', title: 'File invoice', categoryId: 'work', urgency: 'high', position: 1 },
      { id: 'todo-2', title: 'Send agenda', categoryId: 'work', urgency: 'medium', position: 2 },
      { id: 'todo-3', title: 'Wash mugs', categoryId: 'home', urgency: 'medium', position: 1 },
      { id: 'todo-4', title: 'Water plants', categoryId: 'home', urgency: 'low', position: 2 }
    ];

    const result = reorderTodoTasks(tasks, {
      categoryId: 'home',
      orderedTaskIds: ['todo-3', 'todo-1', 'todo-4'],
      sourceCategoryId: 'work'
    });

    expect(tasksForTodoCategory(result, 'home')).toEqual([
      { id: 'todo-3', title: 'Wash mugs', categoryId: 'home', urgency: 'medium', position: 1 },
      { id: 'todo-1', title: 'File invoice', categoryId: 'home', urgency: 'high', position: 2 },
      { id: 'todo-4', title: 'Water plants', categoryId: 'home', urgency: 'low', position: 3 }
    ]);
    expect(tasksForTodoCategory(result, 'work')).toEqual([
      { id: 'todo-2', title: 'Send agenda', categoryId: 'work', urgency: 'medium', position: 1 }
    ]);
  });
});

describe('Todo Module category lifecycle', () => {
  test('creates and renames Todo Categories with trimmed validated names', () => {
    const categories: TodoCategory[] = [{ id: 'category-1', name: 'Home' }];

    expect(
      addTodoCategory({
        categories,
        input: { name: '  Work  ' },
        nextId: () => 'category-2'
      })
    ).toEqual([
      { id: 'category-1', name: 'Home' },
      { id: 'category-2', name: 'Work' }
    ]);

    expect(updateTodoCategory(categories, { id: 'category-1', name: '  Apartment  ' })).toEqual([
      { id: 'category-1', name: 'Apartment' }
    ]);
    expect(addTodoCategory({ categories, input: { name: '   ' }, nextId: () => 'x' })).toBe(
      categories
    );
    expect(
      updateTodoCategory(categories, { id: 'category-1', name: 'x'.repeat(81) })
    ).toBe(categories);
    expect(updateTodoCategory(categories, { id: 'missing-category', name: 'Errands' })).toBe(
      categories
    );
  });

  test('deletes a Todo Category with only its contained Todo Tasks', () => {
    const categories: TodoCategory[] = [
      { id: 'home', name: 'Home' },
      { id: 'work', name: 'Work' }
    ];
    const tasks: TodoTask[] = [
      { id: 'todo-1', title: 'Buy oats', categoryId: null, urgency: 'low', position: 1 },
      { id: 'todo-2', title: 'Call plumber', categoryId: 'home', urgency: 'high', position: 1 },
      { id: 'todo-3', title: 'Review PR', categoryId: 'work', urgency: 'medium', position: 1 },
      { id: 'todo-4', title: 'Water plants', categoryId: 'home', urgency: 'low', position: 2 }
    ];

    expect(deleteTodoCategory({ categories, tasks, categoryId: 'home' })).toEqual({
      categories: [{ id: 'work', name: 'Work' }],
      tasks: [
        { id: 'todo-1', title: 'Buy oats', categoryId: null, urgency: 'low', position: 1 },
        { id: 'todo-3', title: 'Review PR', categoryId: 'work', urgency: 'medium', position: 1 }
      ]
    });
  });
});

describe('Todo Module Daily Summary output', () => {
  test('prepares render-ready Todo Section content in Daily Summary order', () => {
    const categories: TodoCategory[] = [
      { id: 'work', name: 'Work' },
      { id: 'home', name: 'Home' },
      { id: 'empty', name: 'Empty Category' }
    ];
    const tasks: TodoTask[] = [
      { id: 'work-2', title: 'Send agenda', categoryId: 'work', urgency: 'medium', position: 2 },
      { id: 'missing-1', title: 'Recover orphaned task', categoryId: 'missing', urgency: 'medium', position: 2 },
      { id: 'uncat-1', title: 'Buy coffee', categoryId: null, urgency: 'high', position: 1 },
      { id: 'work-1', title: 'Draft update', categoryId: 'work', urgency: 'low', position: 1 },
      { id: 'home-1', title: 'Water plants', categoryId: 'home', urgency: 'medium', position: 1 }
    ];

    expect(buildTodoSection([], [])).toBeNull();
    expect(buildTodoSection(categories, tasks)).toEqual({
      label: 'Todo Tasks',
      uncategorizedTasks: [
        { id: 'uncat-1', title: 'Buy coffee', categoryId: null, urgency: 'high', position: 1 },
        { id: 'missing-1', title: 'Recover orphaned task', categoryId: 'missing', urgency: 'medium', position: 2 }
      ],
      categoryGroups: [
        {
          category: { id: 'work', name: 'Work' },
          tasks: [
            { id: 'work-1', title: 'Draft update', categoryId: 'work', urgency: 'low', position: 1 },
            { id: 'work-2', title: 'Send agenda', categoryId: 'work', urgency: 'medium', position: 2 }
          ]
        },
        {
          category: { id: 'home', name: 'Home' },
          tasks: [
            { id: 'home-1', title: 'Water plants', categoryId: 'home', urgency: 'medium', position: 1 }
          ]
        }
      ]
    });
  });
});
