import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { authAccount } from '$lib/server/db/schema';

export const hasGoogleAuthAccount = async (authUserId: string) =>
  Boolean(
    await db
      .select({ id: authAccount.id })
      .from(authAccount)
      .where(and(eq(authAccount.user_id, authUserId), eq(authAccount.provider_id, 'google')))
      .limit(1)
      .get()
  );
