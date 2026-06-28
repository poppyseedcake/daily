import type { InferSelectModel } from 'drizzle-orm';
import type { TodoCategory, TodoTask, TodoUrgency } from '$lib/todo';
import { todoCategories, todoTasks } from './schema';

export type TodoCategoryRow = InferSelectModel<typeof todoCategories>;
export type TodoTaskRow = Omit<InferSelectModel<typeof todoTasks>, 'urgency'> & {
  urgency?: TodoUrgency | null;
};

export const mapTodoCategoriesFromRows = (rows: TodoCategoryRow[]): TodoCategory[] =>
  rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position
    }))
    .toSorted((first, second) => first.position - second.position);

export const mapTodoCategoryToRow = (
  category: TodoCategory,
  userId: string
): TodoCategoryRow => ({
  id: category.id,
  userId,
  name: category.name,
  position: category.position
});

export const mapTodoTasksFromRows = (rows: TodoTaskRow[]): TodoTask[] =>
  rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      categoryId: row.categoryId,
      urgency: row.urgency ?? 'low',
      position: row.position,
      completed: row.completed
    }))
    .toSorted(
      (first, second) =>
        (first.categoryId ?? '').localeCompare(second.categoryId ?? '') ||
        first.position - second.position
    );

export const mapTodoTaskToRow = (
  task: TodoTask,
  userId: string
): InferSelectModel<typeof todoTasks> => ({
  id: task.id,
  userId,
  categoryId: task.categoryId,
  title: task.title,
  urgency: task.urgency,
  position: task.position,
  completed: task.completed ?? false
});
