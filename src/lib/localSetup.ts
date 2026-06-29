import { z } from 'zod';
import { defaultSummaryConfiguration, summaryConfigurationSchema } from './summaryConfiguration';
import { createDefaultTodoState, todoStateSchema, type TodoState, type TodoStateInput } from './todo';

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
