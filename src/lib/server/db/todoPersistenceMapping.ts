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
  sortTasksWithinIncomingCategoryOrder(
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      categoryId: row.categoryId,
      urgency: row.urgency ?? 'medium',
      position: row.position,
      completed: row.completed
    }))
  );

const sortTasksWithinIncomingCategoryOrder = (tasks: TodoTask[]): TodoTask[] => {
  const tasksByCategory = new Map<string | null, TodoTask[]>();

  for (const task of tasks) {
    tasksByCategory.set(task.categoryId, [...(tasksByCategory.get(task.categoryId) ?? []), task]);
  }

  const sortedTasksByCategory = new Map(
    [...tasksByCategory.entries()].map(([categoryId, categoryTasks]) => [
      categoryId,
      categoryTasks.toSorted((first, second) => first.position - second.position)
    ])
  );

  return tasks.map((task) => sortedTasksByCategory.get(task.categoryId)?.shift() ?? task);
};

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
