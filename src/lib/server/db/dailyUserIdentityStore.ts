import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from './schema';
import type { DailyUserIdentityStore } from './dailyUserIdentity';

export const dailyUserIdentityStore: DailyUserIdentityStore = {
  async upsertGoogleUser(identity) {
    await db
      .insert(users)
      .values({
        id: identity.id,
        googleSubject: identity.googleSubject,
        email: identity.email
      })
      .onConflictDoUpdate({
        target: users.googleSubject,
        set: {
          email: identity.email,
          updatedAt: sql`CURRENT_TIMESTAMP`
        }
      });
  }
};
