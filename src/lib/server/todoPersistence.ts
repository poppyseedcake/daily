import {
  createDefaultTodoState,
  todoCategorySchema,
  todoStateSchema,
  todoTaskSchema,
  type TodoStateInput
} from '$lib/todo';

export type UserTodoPersistenceStore = {
  load: (userId: string) => Promise<Pick<TodoStateInput, 'todoCategories' | 'todoTasks'> | null>;
  save: (userId: string, todoState: TodoStateInput) => Promise<void>;
};

const nextNumericId = (ids: string[]) =>
  Math.max(
    0,
    ...ids.map((id) => {
      const match = /^(?:todo|category)-(\d+)$/.exec(id);
      return match ? Number(match[1]) : 0;
    })
  ) + 1;

const hasOnlySubmittedCategoryReferences = (todoState: TodoStateInput) => {
  const submittedCategoryIds = new Set(todoState.todoCategories.map((category) => category.id));

  return todoState.todoTasks.every(
    (task) => task.categoryId === null || submittedCategoryIds.has(task.categoryId)
  );
};

export const loadUserTodoState = async (
  store: Pick<UserTodoPersistenceStore, 'load'>,
  userId: string
): Promise<TodoStateInput> => {
  const savedState = await store.load(userId);

  if (!savedState) {
    return createDefaultTodoState();
  }

  const todoCategories = savedState.todoCategories
    .map((category) => todoCategorySchema.parse(category))
    .toSorted((first, second) => first.position - second.position);
  const todoTasks = savedState.todoTasks.map((task) => todoTaskSchema.parse(task));

  return {
    ...createDefaultTodoState(),
    todoCategories,
    todoTasks,
    nextTodoId: nextNumericId([
      ...todoCategories.map((category) => category.id),
      ...todoTasks.map((task) => task.id)
    ])
  };
};

export const loadUserTodoStateSafely = async (
  store: Pick<UserTodoPersistenceStore, 'load'>,
  userId: string,
  { enabled = true }: { enabled?: boolean } = {}
): Promise<{
  state: TodoStateInput;
  unavailable: boolean;
}> => {
  if (!enabled) {
    return { state: createDefaultTodoState(), unavailable: false };
  }

  try {
    return {
      state: await loadUserTodoState(store, userId),
      unavailable: false
    };
  } catch {
    return { state: createDefaultTodoState(), unavailable: true };
  }
};

export const saveUserTodoState = async (
  store: UserTodoPersistenceStore,
  userId: string,
  todoState: unknown
): Promise<{ outcome: 'saved' | 'invalid-todo-state' | 'save-failed' }> => {
  const result = todoStateSchema.safeParse(todoState);

  if (!result.success) {
    return { outcome: 'invalid-todo-state' };
  }

  if (!hasOnlySubmittedCategoryReferences(result.data)) {
    return { outcome: 'invalid-todo-state' };
  }

  try {
    await store.save(userId, result.data);
    return { outcome: 'saved' };
  } catch {
    return { outcome: 'save-failed' };
  }
};
