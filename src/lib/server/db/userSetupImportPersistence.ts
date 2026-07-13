import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';
import { calculateNextSummaryAt } from '$lib/nextSummarySchedule';
import type { UserSetupImportDraft } from '$lib/localSetup';
import { summaryTimeSchema, userTimeZoneSchema } from '$lib/summaryConfiguration';
import { commuteDaysSchema, commutePointSchema, commuteRouteNameSchema } from '$lib/commuteRoute';

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

const persistedWeatherLocationSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  label: z.string().trim().min(1).max(160).refine((label) => !/[<>]/.test(label)),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180)
});

const persistedCommuteRouteSchema = z.object({
  id: z.string().trim().min(1).max(80),
  userId: z.string().min(1),
  name: commuteRouteNameSchema,
  originLabel: commutePointSchema.shape.label,
  originLatitude: commutePointSchema.shape.latitude,
  originLongitude: commutePointSchema.shape.longitude,
  destinationLabel: commutePointSchema.shape.label,
  destinationLatitude: commutePointSchema.shape.latitude,
  destinationLongitude: commutePointSchema.shape.longitude,
  enabled: z.boolean(),
  position: z.number().int().positive()
});

const userSetupImportDraftSchema = z.object({
  summaryConfiguration: persistedSummaryConfigurationSchema,
  todoCategories: z.array(persistedTodoCategorySchema),
  todoTasks: z.array(persistedTodoTaskSchema),
  weatherLocation: persistedWeatherLocationSchema.nullable(),
  commuteRoutes: z.array(persistedCommuteRouteSchema).max(5),
  commuteDays: commuteDaysSchema
});

export type UserSetupImportPersistenceTransaction = {
  hasExistingUserSetup: (userId: string) => boolean;
  hasExistingCommuteSetup: (userId: string) => boolean;
  saveSummaryConfiguration: (
    summaryConfiguration: UserSetupImportDraft['summaryConfiguration'],
    nextSummaryAt: string | null
  ) => void;
  saveTodoCategories: (todoCategories: UserSetupImportDraft['todoCategories']) => void;
  saveTodoTasks: (todoTasks: UserSetupImportDraft['todoTasks']) => void;
  saveWeatherLocation: (weatherLocation: UserSetupImportDraft['weatherLocation']) => void;
  saveCommuteRoutes: (routes: UserSetupImportDraft['commuteRoutes']) => void;
  saveCommuteDays: (userId: string, days: UserSetupImportDraft['commuteDays']) => void;
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
    draft.todoTasks.every((task) => task.userId === userId) &&
    (draft.weatherLocation === null || draft.weatherLocation.userId === userId) &&
    draft.commuteRoutes.every((route) => route.userId === userId);

const hasValidTaskCategoryReferences = (draft: UserSetupImportDraft) => {
  const categoryIds = new Set(draft.todoCategories.map((category) => category.id));

  return draft.todoTasks.every(
    (task) => task.categoryId === null || categoryIds.has(task.categoryId)
  );
};

export const persistUserSetupImportDraftForNewUser = async (
  store: UserSetupImportPersistenceStore,
  userId: string,
  draft: UserSetupImportDraft,
  referenceInstant: Temporal.Instant = Temporal.Now.instant()
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

      const preserveExistingCommuteSetup = transaction.hasExistingCommuteSetup(userId);

      const savedConfiguration = result.data.summaryConfiguration;
      const nextSummaryAt =
        calculateNextSummaryAt(
          {
            summaryTime: savedConfiguration.summaryTime,
            userTimeZone: savedConfiguration.userTimeZone,
            summaryTheme: savedConfiguration.summaryTheme,
            summaryDeliveryEnabled: savedConfiguration.summaryDeliveryEnabled,
            sections: {
              weather: savedConfiguration.weatherSectionEnabled,
              commute: savedConfiguration.commuteSectionEnabled,
              calendar: savedConfiguration.calendarSectionEnabled,
              todo: savedConfiguration.todoSectionEnabled
            }
          },
          referenceInstant
        )?.toString() ?? null;

      transaction.saveSummaryConfiguration(savedConfiguration, nextSummaryAt);
      transaction.saveTodoCategories(result.data.todoCategories);
      transaction.saveTodoTasks(result.data.todoTasks);
      transaction.saveWeatherLocation(result.data.weatherLocation);
      if (!preserveExistingCommuteSetup) {
        transaction.saveCommuteRoutes(result.data.commuteRoutes);
        transaction.saveCommuteDays(userId, result.data.commuteDays);
      }

      return { outcome: 'imported' };
    });
  } catch {
    return { outcome: 'import-failed' };
  }
};
