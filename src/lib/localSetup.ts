import { z } from 'zod';
import {
  defaultSummaryConfiguration,
  summaryConfigurationSchema,
  type SummaryConfiguration
} from './summaryConfiguration';
import {
  createDefaultTodoState,
  todoStateSchema,
  type TodoCategory,
  type TodoState,
  type TodoStateInput,
  type TodoTask,
  type TodoUrgency
} from './todo';

export const localSetupVersion = 1;
export const localSetupStorageKey = 'daily.visitorLocalSetup.v1';

export type LocalSetup = {
  version: typeof localSetupVersion;
  summaryConfiguration: typeof defaultSummaryConfiguration;
} & TodoState;

export type LocalSetupInput = {
  version: typeof localSetupVersion;
  summaryConfiguration: typeof defaultSummaryConfiguration;
} & TodoStateInput;

export type LocalSetupStorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type LocalSetupLoadOutcome =
  | 'empty'
  | 'loaded'
  | 'invalid-json'
  | 'schema-invalid'
  | 'unsupported-version'
  | 'read-failed';
export type LocalSetupSaveOutcome = 'saved' | 'write-failed';

export type UserSetupImportDraft = {
  summaryConfiguration: {
    id: string;
    userId: string;
    summaryTime: string;
    userTimeZone: SummaryConfiguration['userTimeZone'];
    summaryTheme: SummaryConfiguration['summaryTheme'];
    summaryDeliveryEnabled: boolean;
    weatherSectionEnabled: boolean;
    commuteSectionEnabled: boolean;
    calendarSectionEnabled: boolean;
    todoSectionEnabled: boolean;
  };
  todoCategories: Array<{
    id: string;
    userId: string;
    name: string;
    position: number;
  }>;
  todoTasks: Array<{
    id: string;
    userId: string;
    categoryId: string | null;
    title: string;
    urgency: TodoUrgency;
    position: number;
    completed: boolean;
  }>;
};

export type UserSetupImportDraftOptions = {
  userId: string;
  summaryConfigurationId: string;
  nextTodoCategoryId: (category: TodoCategory) => string;
  nextTodoTaskId: (task: TodoTask) => string;
};

const localSetupBaseSchema = z
  .object({
    version: z.literal(localSetupVersion),
    summaryConfiguration: summaryConfigurationSchema
  })
  .and(todoStateSchema);

const localSetupSchema = localSetupBaseSchema.transform((setup) => ({
  version: setup.version,
  summaryConfiguration: setup.summaryConfiguration,
  todoCategories: setup.todoCategories,
  todoTasks: setup.todoTasks,
  nextTodoId: setup.nextTodoId
}));

const unversionedCurrentLocalSetupSchema = z
  .object({
    version: z.never().optional(),
    summaryConfiguration: summaryConfigurationSchema
  })
  .and(todoStateSchema)
  .transform((setup) => ({
    version: localSetupVersion,
    summaryConfiguration: setup.summaryConfiguration,
    todoCategories: setup.todoCategories,
    todoTasks: setup.todoTasks,
    nextTodoId: setup.nextTodoId
  }));

const supportedLocalSetupSchema = z.union([localSetupSchema, unversionedCurrentLocalSetupSchema]);

const fallbackLoadResult = (outcome: LocalSetupLoadOutcome) => ({
  outcome,
  setup: createDefaultLocalSetup()
});

const sortTasksWithinIncomingCategoryOrder = (tasks: TodoTask[]) => {
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

export const createDefaultLocalSetup = (): LocalSetup =>
  localSetupSchema.parse({
    version: localSetupVersion,
    summaryConfiguration: summaryConfigurationSchema.parse(defaultSummaryConfiguration),
    ...createDefaultTodoState()
  });

export const loadLocalSetup = (
  storage: LocalSetupStorageAdapter
): { outcome: LocalSetupLoadOutcome; setup: LocalSetup } => {
  let storedSetup: string | null;

  try {
    storedSetup = storage.getItem(localSetupStorageKey);
  } catch {
    return fallbackLoadResult('read-failed');
  }

  if (!storedSetup) {
    return fallbackLoadResult('empty');
  }

  let parsedSetup: unknown;

  try {
    parsedSetup = JSON.parse(storedSetup);
  } catch {
    return fallbackLoadResult('invalid-json');
  }

  const result = supportedLocalSetupSchema.safeParse(parsedSetup);

  if (result.success) {
    return { outcome: 'loaded', setup: result.data as LocalSetup };
  }

  if (
    typeof parsedSetup === 'object' &&
    parsedSetup !== null &&
    'version' in parsedSetup &&
    typeof (parsedSetup as { version: unknown }).version === 'number' &&
    (parsedSetup as { version: number }).version !== localSetupVersion
  ) {
    return fallbackLoadResult('unsupported-version');
  }

  return fallbackLoadResult('schema-invalid');
};

export const saveLocalSetup = (
  storage: LocalSetupStorageAdapter,
  setup: LocalSetupInput
): { outcome: LocalSetupSaveOutcome } => {
  try {
    storage.setItem(localSetupStorageKey, JSON.stringify(localSetupSchema.parse(setup)));
  } catch {
    return { outcome: 'write-failed' };
  }

  return { outcome: 'saved' };
};

export const createUserSetupImportDraftFromLocalSetup = (
  result: { outcome: LocalSetupLoadOutcome; setup: LocalSetupInput },
  options: UserSetupImportDraftOptions
): UserSetupImportDraft | null => {
  if (result.outcome !== 'loaded') {
    return null;
  }

  const setup = localSetupSchema.parse(result.setup);
  const categoryIds = new Map(
    setup.todoCategories.map((category) => [category.id, options.nextTodoCategoryId(category)])
  );
  const taskIds = new Map(
    setup.todoTasks.map((task) => [task.id, options.nextTodoTaskId(task)])
  );

  return {
    summaryConfiguration: {
      id: options.summaryConfigurationId,
      userId: options.userId,
      summaryTime: setup.summaryConfiguration.summaryTime,
      userTimeZone: setup.summaryConfiguration.userTimeZone,
      summaryTheme: setup.summaryConfiguration.summaryTheme,
      summaryDeliveryEnabled: setup.summaryConfiguration.summaryDeliveryEnabled,
      weatherSectionEnabled: setup.summaryConfiguration.sections.weather,
      commuteSectionEnabled: setup.summaryConfiguration.sections.commute,
      calendarSectionEnabled: setup.summaryConfiguration.sections.calendar,
      todoSectionEnabled: setup.summaryConfiguration.sections.todo
    },
    todoCategories: setup.todoCategories
      .toSorted((first, second) => first.position - second.position)
      .map((category) => ({
        id: categoryIds.get(category.id) ?? category.id,
        userId: options.userId,
        name: category.name,
        position: category.position
      })),
    todoTasks: sortTasksWithinIncomingCategoryOrder(setup.todoTasks).map((task) => ({
      id: taskIds.get(task.id) ?? task.id,
      userId: options.userId,
      categoryId: task.categoryId === null ? null : (categoryIds.get(task.categoryId) ?? null),
      title: task.title,
      urgency: task.urgency,
      position: task.position,
      completed: task.completed ?? false
    }))
  };
};
