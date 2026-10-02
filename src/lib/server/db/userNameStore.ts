import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { authAccount, authUser, users } from './schema';

export const createUserNameStore = (database: typeof db) => ({
  async load(userId: string): Promise<string | undefined> {
    // The saved Daily identity may predate the current auth User ID. Resolve the
    // Google subject instead of assuming both IDs always match.
    const [profile] = await database.select({ name: authUser.name })
      .from(users)
      .innerJoin(authAccount, and(
        eq(authAccount.account_id, users.googleSubject),
        eq(authAccount.provider_id, 'google')
      ))
      .innerJoin(authUser, eq(authUser.id, authAccount.user_id))
      .where(and(eq(users.id, userId), eq(users.lifecycleState, 'active')))
      .limit(1);
    return profile?.name.trim() || undefined;
  }
});

export const userNameStore = createUserNameStore(db);
