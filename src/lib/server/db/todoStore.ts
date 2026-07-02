import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { TodoStateInput } from '$lib/todo';
import type { UserTodoPersistenceStore } from '$lib/server/todoPersistence';
import {
  mapTodoCategoriesFromRows,
  mapTodoCategoryToRow,
  mapTodoTasksFromRows,
  mapTodoTaskToRow
} from './todoPersistenceMapping';
import { todoCategories, todoTasks } from './schema';

export const userTodoStore: UserTodoPersistenceStore = {
  async load(userId) {
    const [categoryRows, taskRows] = await Promise.all([
      db.query.todoCategories.findMany({
        where: eq(todoCategories.userId, userId),
        orderBy: (categories, { asc }) => [asc(categories.position)]
      }),
      db.query.todoTasks.findMany({
        where: eq(todoTasks.userId, userId),
        orderBy: (tasks, { asc }) => [asc(tasks.position)]
      })
    ]);

    return {
      todoCategories: mapTodoCategoriesFromRows(categoryRows),
      todoTasks: mapTodoTasksFromRows(taskRows)
    };
  },
  async save(userId, todoState: TodoStateInput) {
    await db.transaction(async (transaction) => {
      await transaction.delete(todoTasks).where(eq(todoTasks.userId, userId));
      await transaction.delete(todoCategories).where(eq(todoCategories.userId, userId));

      if (todoState.todoCategories.length > 0) {
        await transaction
          .insert(todoCategories)
          .values(todoState.todoCategories.map((category) => mapTodoCategoryToRow(category, userId)));
      }

      if (todoState.todoTasks.length > 0) {
        await transaction
          .insert(todoTasks)
          .values(todoState.todoTasks.map((task) => mapTodoTaskToRow(task, userId)));
      }
    });
  }
};
