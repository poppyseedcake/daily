import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { summaryConfigurations, todoCategories, todoTasks } from './schema';
import type { UserSetupImportPersistenceStore } from './userSetupImportPersistence';

type SetupImportDatabase = typeof db;

export const createUserSetupImportStore = (
  database: SetupImportDatabase
): UserSetupImportPersistenceStore => ({
  async hasExistingUserSetup(userId) {
    const [summaryConfiguration, todoCategory, todoTask] = await Promise.all([
      database.query.summaryConfigurations.findFirst({
        where: eq(summaryConfigurations.userId, userId),
        columns: { id: true }
      }),
      database.query.todoCategories.findFirst({
        where: eq(todoCategories.userId, userId),
        columns: { id: true }
      }),
      database.query.todoTasks.findFirst({
        where: eq(todoTasks.userId, userId),
        columns: { id: true }
      })
    ]);

    return Boolean(summaryConfiguration || todoCategory || todoTask);
  },
  async transaction(work) {
    database.transaction((transaction) => {
      work({
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
      });
    });
  }
});

export const userSetupImportStore = createUserSetupImportStore(db);
