import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from './schema';
import {
  DailyUserIdentityEmailConflictError,
  type DailyUserIdentityStore
} from './dailyUserIdentity';

const isUsersEmailUniqueConflict = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorCode = 'code' in error ? error.code : undefined;

  return (
    errorCode === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error.message.includes('UNIQUE constraint failed: users.email')
  );
};

type DailyUserIdentityDatabase = typeof db;

export const createDailyUserIdentityStore = (
  database: DailyUserIdentityDatabase
): DailyUserIdentityStore => ({
  async upsertGoogleUser(identity, initialNextSummaryAt) {
    try {
      await database
        .insert(users)
        .values({
          id: identity.id,
          googleSubject: identity.googleSubject,
          email: identity.email,
          nextSummaryAt: initialNextSummaryAt
        })
        .onConflictDoUpdate({
          target: users.googleSubject,
          set: {
            email: identity.email,
            updatedAt: sql`CURRENT_TIMESTAMP`
          }
        });
    } catch (error) {
      if (isUsersEmailUniqueConflict(error)) {
        throw new DailyUserIdentityEmailConflictError(identity.email);
      }

      throw error;
    }
  }
});

export const dailyUserIdentityStore = createDailyUserIdentityStore(db);
