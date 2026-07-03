import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { summaryConfigurations, todoCategories, todoTasks } from './schema';
import type { UserSetupImportPersistenceStore } from './userSetupImportPersistence';

type SetupImportDatabase = typeof db;

const hasExistingUserSetup = (database: Pick<SetupImportDatabase, 'select'>, userId: string) =>
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
        .get()
  );

export const createUserSetupImportStore = (
  database: SetupImportDatabase
): UserSetupImportPersistenceStore => ({
  async hasExistingUserSetup(userId) {
    return hasExistingUserSetup(database, userId);
  },
  async transaction(work) {
    return database.transaction((transaction) =>
      work({
        hasExistingUserSetup(userId) {
          return hasExistingUserSetup(transaction, userId);
        },
        saveSummaryConfiguration(summaryConfiguration) {
          transaction.insert(summaryConfigurations).values(summaryConfiguration).run();
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
        }
      })
    );
  }
});

export const userSetupImportStore = createUserSetupImportStore(db);
