import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
  commuteDays,
  commuteRoutes,
  summaryConfigurations,
  todoCategories,
  todoTasks,
  users,
  weatherLocations
} from './schema';
import type { UserSetupImportPersistenceStore } from './userSetupImportPersistence';

type SetupImportDatabase = typeof db;

const hasExistingNonCommuteUserSetup = (database: Pick<SetupImportDatabase, 'select'>, userId: string) =>
  Boolean(
    database
      .select({ id: summaryConfigurations.id })
      .from(summaryConfigurations)
      .where(eq(summaryConfigurations.userId, userId))
      .get() ||
      database
        .select({ id: todoCategories.id })
        .from(todoCategories)
        .where(eq(todoCategories.userId, userId))
        .get() ||
      database
        .select({ id: todoTasks.id })
        .from(todoTasks)
        .where(eq(todoTasks.userId, userId))
        .get() ||
      database
        .select({ id: weatherLocations.id })
        .from(weatherLocations)
        .where(eq(weatherLocations.userId, userId))
        .get()
  );

const hasExistingCommuteSetup = (database: Pick<SetupImportDatabase, 'select'>, userId: string) =>
  Boolean(
    database
      .select({ id: commuteRoutes.id })
      .from(commuteRoutes)
      .where(eq(commuteRoutes.userId, userId))
      .get() ||
      database
        .select({ userId: commuteDays.userId })
        .from(commuteDays)
        .where(eq(commuteDays.userId, userId))
        .get()
  );

export const createUserSetupImportStore = (
  database: SetupImportDatabase
): UserSetupImportPersistenceStore => ({
  async hasExistingUserSetup(userId) {
    return hasExistingNonCommuteUserSetup(database, userId);
  },
  async transaction(work) {
    return database.transaction((transaction) =>
      work({
        hasExistingUserSetup(userId) {
          return hasExistingNonCommuteUserSetup(transaction, userId);
        },
        hasExistingCommuteSetup(userId) {
          return hasExistingCommuteSetup(transaction, userId);
        },
        saveSummaryConfiguration(summaryConfiguration, nextSummaryAt) {
          transaction.insert(summaryConfigurations).values(summaryConfiguration).run();
          transaction
            .update(users)
            .set({ nextSummaryAt: nextSummaryAt ?? null })
            .where(eq(users.id, summaryConfiguration.userId))
            .run();
        },
        saveTodoCategories(categories) {
          if (categories.length > 0) {
            transaction.insert(todoCategories).values(categories).run();
          }
        },
        saveTodoTasks(tasks) {
          if (tasks.length > 0) {
            transaction.insert(todoTasks).values(tasks).run();
          }
        },
        saveWeatherLocation(weatherLocation) {
          if (weatherLocation) {
            transaction.insert(weatherLocations).values(weatherLocation).run();
          }
        },
        saveCommuteRoutes(routes) {
          if (routes.length > 0) {
            transaction.insert(commuteRoutes).values(routes).run();
          }
        },
        saveCommuteDays(userId, days) {
          if (days.length > 0) {
            transaction
              .insert(commuteDays)
              .values(days.map((day) => ({ userId, day })))
              .run();
          }
        }
      })
    );
  }
});

export const userSetupImportStore = createUserSetupImportStore(db);
