import { z } from 'zod';
import type { UserSetupImportDraft } from '$lib/localSetup';
import { summaryTimeSchema, userTimeZoneSchema } from '$lib/summaryConfiguration';

const persistedSummaryConfigurationSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  summaryTime: summaryTimeSchema,
  userTimeZone: userTimeZoneSchema,
  summaryTheme: z.enum(['light', 'dark']),
  summaryDeliveryEnabled: z.boolean(),
  weatherSectionEnabled: z.boolean(),
  commuteSectionEnabled: z.boolean(),
  calendarSectionEnabled: z.boolean(),
  todoSectionEnabled: z.boolean()
});

const persistedTodoCategorySchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  position: z.number().int().positive()
});

const persistedTodoTaskSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  categoryId: z.string().min(1).nullable(),
  title: z.string().trim().min(1).max(120),
  urgency: z.enum(['low', 'medium', 'high']),
  position: z.number().int().positive(),
  completed: z.boolean()
});

const userSetupImportDraftSchema = z.object({
  summaryConfiguration: persistedSummaryConfigurationSchema,
  todoCategories: z.array(persistedTodoCategorySchema),
  todoTasks: z.array(persistedTodoTaskSchema)
});

export type UserSetupImportPersistenceTransaction = {
  hasExistingUserSetup: (userId: string) => boolean;
  saveSummaryConfiguration: (
    summaryConfiguration: UserSetupImportDraft['summaryConfiguration']
  ) => void;
  saveTodoCategories: (todoCategories: UserSetupImportDraft['todoCategories']) => void;
  saveTodoTasks: (todoTasks: UserSetupImportDraft['todoTasks']) => void;
};

export type UserSetupImportPersistenceStore = {
  hasExistingUserSetup: (userId: string) => Promise<boolean>;
  transaction: <T>(work: (transaction: UserSetupImportPersistenceTransaction) => T) => Promise<T>;
};

export type UserSetupImportPersistenceOutcome =
  | 'imported'
  | 'skipped-existing-setup'
  | 'invalid-draft'
  | 'import-failed';

const isDraftForUser = (userId: string, draft: UserSetupImportDraft) =>
  draft.summaryConfiguration.userId === userId &&
  draft.todoCategories.every((category) => category.userId === userId) &&
  draft.todoTasks.every((task) => task.userId === userId);

const hasValidTaskCategoryReferences = (draft: UserSetupImportDraft) => {
  const categoryIds = new Set(draft.todoCategories.map((category) => category.id));

  return draft.todoTasks.every(
    (task) => task.categoryId === null || categoryIds.has(task.categoryId)
  );
};

export const persistUserSetupImportDraftForNewUser = async (
  store: UserSetupImportPersistenceStore,
  userId: string,
  draft: UserSetupImportDraft
): Promise<{ outcome: UserSetupImportPersistenceOutcome }> => {
  const result = userSetupImportDraftSchema.safeParse(draft);

  if (
    !result.success ||
    !isDraftForUser(userId, result.data) ||
    !hasValidTaskCategoryReferences(result.data)
  ) {
    return { outcome: 'invalid-draft' };
  }

  try {
    return await store.transaction((transaction) => {
      if (transaction.hasExistingUserSetup(userId)) {
        return { outcome: 'skipped-existing-setup' };
      }

      transaction.saveSummaryConfiguration(result.data.summaryConfiguration);
      transaction.saveTodoCategories(result.data.todoCategories);
      transaction.saveTodoTasks(result.data.todoTasks);

      return { outcome: 'imported' };
    });
  } catch {
    return { outcome: 'import-failed' };
  }
};
