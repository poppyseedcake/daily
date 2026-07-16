import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { summaryConfigurations, users } from './schema';

type UserLifecycleDatabase = typeof db;

export type UserLifecycleStore = {
  isActive(userId: string): Promise<boolean>;
  startDeleting(userId: string): Promise<boolean>;
};

export const createUserLifecycleStore = (
  database: UserLifecycleDatabase
): UserLifecycleStore => ({
  async isActive(userId) {
    const user = await database.query.users.findFirst({
      columns: { id: true },
      where: and(eq(users.id, userId), eq(users.lifecycleState, 'active'))
    });

    return user !== undefined;
  },

  async startDeleting(userId) {
    return database.transaction((transaction) => {
      const marked = transaction
        .update(users)
        .set({ lifecycleState: 'deleting', nextSummaryAt: null })
        .where(and(eq(users.id, userId), eq(users.lifecycleState, 'active')))
        .returning({ id: users.id })
        .all();

      if (marked.length === 0) {
        return false;
      }

      transaction
        .update(summaryConfigurations)
        .set({ summaryDeliveryEnabled: false })
        .where(eq(summaryConfigurations.userId, userId))
        .run();

      return true;
    });
  }
});

export const userLifecycleStore = createUserLifecycleStore(db);
