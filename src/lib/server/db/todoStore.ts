import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { TodoCategory, TodoStateInput, TodoTask } from '$lib/todo';
import type { UserTodoPersistenceStore } from '$lib/server/todoPersistence';
import {
  mapTodoCategoriesFromRows,
  mapTodoTasksFromRows
} from './todoPersistenceMapping';
import { todoCategories, todoTasks } from './schema';

type TodoDatabase = typeof db;

const persistedTodoId = (userId: string, id: string) => `${userId}:${id}`;
const localTodoId = (userId: string, id: string) => {
  const prefix = `${userId}:`;

  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
};

const toPersistedCategoryRow = (category: TodoCategory, userId: string) => ({
  id: persistedTodoId(userId, category.id),
  userId,
  name: category.name,
  position: category.position
});

const toPersistedTaskRow = (task: TodoTask, userId: string) => ({
  id: persistedTodoId(userId, task.id),
  userId,
  categoryId: task.categoryId == null ? null : persistedTodoId(userId, task.categoryId),
  title: task.title,
  urgency: task.urgency,
  position: task.position,
  completed: task.completed ?? false
});

const toLocalCategory = (userId: string, category: TodoCategory): TodoCategory => ({
  ...category,
  id: localTodoId(userId, category.id)
});

const toLocalTask = (userId: string, task: TodoTask): TodoTask => ({
  ...task,
  id: localTodoId(userId, task.id),
  categoryId: task.categoryId == null ? null : localTodoId(userId, task.categoryId)
});

const assertTasksReferenceSavedCategories = (todoState: TodoStateInput) => {
  const savedCategoryIds = new Set(todoState.todoCategories.map((category) => category.id));
  const invalidTask = todoState.todoTasks.find(
    (task) => task.categoryId != null && !savedCategoryIds.has(task.categoryId)
  );

  if (invalidTask) {
    throw new Error('Todo Task category must belong to the saved User Todo state.');
  }
};

const sortTasksForLoadedState = (categories: TodoCategory[], tasks: TodoTask[]) => {
  const categoryPositions = new Map(categories.map((category, index) => [category.id, index + 1]));

  return tasks.toSorted((first, second) => {
    const firstCategoryPosition =
      first.categoryId == null
        ? 0
        : (categoryPositions.get(first.categoryId) ?? Number.MAX_SAFE_INTEGER);
    const secondCategoryPosition =
      second.categoryId == null
        ? 0
        : (categoryPositions.get(second.categoryId) ?? Number.MAX_SAFE_INTEGER);

    return firstCategoryPosition - secondCategoryPosition || first.position - second.position;
  });
};

export const createUserTodoStore = (database: TodoDatabase): UserTodoPersistenceStore => ({
  async load(userId) {
    const [categoryRows, taskRows] = await Promise.all([
      database.query.todoCategories.findMany({
        where: eq(todoCategories.userId, userId),
        orderBy: (categories, { asc }) => [asc(categories.position)]
      }),
      database.query.todoTasks.findMany({
        where: eq(todoTasks.userId, userId),
        orderBy: (tasks, { asc }) => [asc(tasks.position)]
      })
    ]);

    const loadedCategories = mapTodoCategoriesFromRows(categoryRows).map((category) =>
      toLocalCategory(userId, category)
    );
    const loadedTasks = mapTodoTasksFromRows(taskRows).map((task) => toLocalTask(userId, task));

    return {
      todoCategories: loadedCategories,
      todoTasks: sortTasksForLoadedState(loadedCategories, loadedTasks)
    };
  },
  async save(userId, todoState: TodoStateInput) {
    assertTasksReferenceSavedCategories(todoState);

    database.transaction((transaction) => {
      transaction.delete(todoTasks).where(eq(todoTasks.userId, userId)).run();
      transaction.delete(todoCategories).where(eq(todoCategories.userId, userId)).run();

      if (todoState.todoCategories.length > 0) {
        transaction
          .insert(todoCategories)
          .values(todoState.todoCategories.map((category) => toPersistedCategoryRow(category, userId)))
          .run();
      }

      if (todoState.todoTasks.length > 0) {
        transaction
          .insert(todoTasks)
          .values(todoState.todoTasks.map((task) => toPersistedTaskRow(task, userId)))
          .run();
      }
    });
  }
});

export const userTodoStore = createUserTodoStore(db);
