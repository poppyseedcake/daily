import { z } from 'zod';

export const todoUrgencySchema = z.enum(['low', 'medium', 'high']);

export const todoTaskTitleSchema = z.string().trim().min(1).max(120);
export const todoCategoryNameSchema = z.string().trim().min(1).max(80);

export const createTodoTaskSchema = z.object({
  title: todoTaskTitleSchema,
  categoryId: z.string().nullable(),
  urgency: todoUrgencySchema
});

export const updateTodoTaskSchema = z.object({
  id: z.string(),
  title: todoTaskTitleSchema,
  urgency: todoUrgencySchema
});

export const todoCategoryMutationSchema = z.object({
  name: todoCategoryNameSchema
});

export const todoTaskSchema = z.object({
  id: z.string(),
  title: todoTaskTitleSchema,
  categoryId: z.string().nullable(),
  urgency: todoUrgencySchema,
  position: z.number().int().positive()
});

export const todoCategorySchema = z.object({
  id: z.string(),
  name: todoCategoryNameSchema
});

export type TodoUrgency = z.infer<typeof todoUrgencySchema>;
export type TodoTask = z.infer<typeof todoTaskSchema>;
export type TodoCategory = z.infer<typeof todoCategorySchema>;

export const tasksForTodoCategory = (tasks: TodoTask[], categoryId: string | null) =>
  tasks
    .filter((task) => task.categoryId === categoryId)
    .toSorted((first, second) => first.position - second.position);

const nextPositionForCategory = (tasks: TodoTask[], categoryId: string | null) =>
  Math.max(0, ...tasksForTodoCategory(tasks, categoryId).map((task) => task.position)) + 1;

export const addTodoTask = ({
  tasks,
  input,
  nextId
}: {
  tasks: TodoTask[];
  input: z.input<typeof createTodoTaskSchema>;
  nextId: () => string;
}) => {
  const result = createTodoTaskSchema.safeParse(input);

  if (!result.success) {
    return tasks;
  }

  return [
    ...tasks,
    {
      id: nextId(),
      title: result.data.title,
      categoryId: result.data.categoryId,
      urgency: result.data.urgency,
      position: nextPositionForCategory(tasks, result.data.categoryId)
    }
  ];
};

export const updateTodoTask = (
  tasks: TodoTask[],
  input: z.input<typeof updateTodoTaskSchema>
) => {
  const result = updateTodoTaskSchema.safeParse(input);

  if (!result.success) {
    return tasks;
  }

  return tasks.map((task) =>
    task.id === result.data.id
      ? { ...task, title: result.data.title, urgency: result.data.urgency }
      : task
  );
};

export const completeTodoTask = (tasks: TodoTask[], taskId: string) =>
  tasks.filter((task) => task.id !== taskId);

export const addTodoCategory = ({
  categories,
  input,
  nextId
}: {
  categories: TodoCategory[];
  input: z.input<typeof todoCategoryMutationSchema>;
  nextId: () => string;
}) => {
  const result = todoCategoryMutationSchema.safeParse(input);

  if (!result.success) {
    return categories;
  }

  return [...categories, { id: nextId(), name: result.data.name }];
};

export const updateTodoCategory = (
  categories: TodoCategory[],
  input: z.input<typeof todoCategoryMutationSchema> & { id: string }
) => {
  const result = todoCategoryMutationSchema.safeParse(input);

  if (!result.success) {
    return categories;
  }

  let categoryUpdated = false;
  const nextCategories = categories.map((category) => {
    if (category.id !== input.id) {
      return category;
    }

    categoryUpdated = true;
    return { ...category, name: result.data.name };
  });

  return categoryUpdated ? nextCategories : categories;
};

export const deleteTodoCategory = ({
  categories,
  tasks,
  categoryId
}: {
  categories: TodoCategory[];
  tasks: TodoTask[];
  categoryId: string;
}) => ({
  categories: categories.filter((category) => category.id !== categoryId),
  tasks: tasks.filter((task) => task.categoryId !== categoryId)
});

export const reorderTodoTasks = (
  tasks: TodoTask[],
  {
    categoryId,
    orderedTasks,
    detachMissingTasks = false
  }: { categoryId: string | null; orderedTasks: TodoTask[]; detachMissingTasks?: boolean }
) => {
  const reorderedTaskIds = new Set(orderedTasks.map((task) => task.id));
  const movedTasks = new Map(
    orderedTasks.map((task, index) => [task.id, { categoryId, position: index + 1 }])
  );

  return tasks.map((task) => {
    const movedTask = movedTasks.get(task.id);

    if (movedTask) {
      return { ...task, ...movedTask };
    }

    if (detachMissingTasks && task.categoryId === categoryId && !reorderedTaskIds.has(task.id)) {
      return { ...task, categoryId: null };
    }

    return task;
  });
};
