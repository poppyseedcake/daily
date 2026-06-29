import { z } from 'zod';
import { defaultSummaryConfiguration, summaryConfigurationSchema } from './summaryConfiguration';
import { todoCategorySchema, todoTaskSchema, type TodoCategory, type TodoTask } from './todo';

export const localSetupVersion = 1;
export const localSetupStorageKey = 'daily.visitorLocalSetup.v1';

export type LocalSetup = {
  version: typeof localSetupVersion;
  summaryConfiguration: typeof defaultSummaryConfiguration;
  todoCategories: TodoCategory[];
  todoTasks: TodoTask[];
  nextTodoId: number;
};

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

const localSetupSchema = z.object({
  version: z.literal(localSetupVersion),
  summaryConfiguration: summaryConfigurationSchema,
  todoCategories: z.array(todoCategorySchema),
  todoTasks: z.array(todoTaskSchema),
  nextTodoId: z.number().int().positive()
});

const unversionedCurrentLocalSetupSchema = localSetupSchema
  .omit({ version: true })
  .strict()
  .transform((setup) => ({ ...setup, version: localSetupVersion }));

const supportedLocalSetupSchema = z.union([localSetupSchema, unversionedCurrentLocalSetupSchema]);

const fallbackLoadResult = (outcome: LocalSetupLoadOutcome) => ({
  outcome,
  setup: createDefaultLocalSetup()
});

export const createDefaultLocalSetup = (): LocalSetup => ({
  version: localSetupVersion,
  summaryConfiguration: summaryConfigurationSchema.parse(defaultSummaryConfiguration),
  todoCategories: [],
  todoTasks: [],
  nextTodoId: 1
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
    (parsedSetup as { version: unknown }).version !== localSetupVersion
  ) {
    return fallbackLoadResult('unsupported-version');
  }

  return fallbackLoadResult('schema-invalid');
};

export const saveLocalSetup = (
  storage: LocalSetupStorageAdapter,
  setup: LocalSetup
): { outcome: LocalSetupSaveOutcome } => {
  try {
    storage.setItem(localSetupStorageKey, JSON.stringify(localSetupSchema.parse(setup)));
  } catch {
    return { outcome: 'write-failed' };
  }

  return { outcome: 'saved' };
};
