import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
  authAccount,
  authUser,
  googleMapsPersonUsage,
  summaryConfigurations,
  users
} from './schema';
import type { AccountDeletionStore } from '../accountDeletion';

export const createAccountDeletionStore = (database: typeof db): AccountDeletionStore => ({
  async startDeleting(userId) {
    return database.transaction((transaction) => {
      const user = transaction
        .select({ lifecycleState: users.lifecycleState })
        .from(users)
        .where(eq(users.id, userId))
        .get();
      if (!user) return 'missing';
      if (user.lifecycleState === 'deleting') return 'resuming';

      transaction
        .update(users)
        .set({ lifecycleState: 'deleting', nextSummaryAt: null })
        .where(and(eq(users.id, userId), eq(users.lifecycleState, 'active')))
        .run();
      transaction
        .update(summaryConfigurations)
        .set({ summaryDeliveryEnabled: false })
        .where(eq(summaryConfigurations.userId, userId))
        .run();
      return 'started';
    });
  },

  async loadGoogleTokens(userId) {
    const accounts = await database
      .select({
        accessToken: authAccount.access_token,
        refreshToken: authAccount.refresh_token,
        idToken: authAccount.id_token
      })
      .from(authAccount)
      .where(and(eq(authAccount.user_id, userId), eq(authAccount.provider_id, 'google')));

    return accounts.flatMap(({ accessToken, refreshToken, idToken }) =>
      [accessToken, refreshToken, idToken].filter((token): token is string => Boolean(token))
    );
  },

  async finishDeleting(userId, personUsageIdentity) {
    return database.transaction((transaction) => {
      const deletingUser = transaction
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.lifecycleState, 'deleting')))
        .get();
      if (!deletingUser) return false;

      transaction
        .delete(googleMapsPersonUsage)
        .where(eq(googleMapsPersonUsage.personUsageIdentity, personUsageIdentity))
        .run();
      // Domain rows and Better Auth sessions/accounts are enforced by FK cascades.
      transaction.delete(users).where(eq(users.id, userId)).run();
      transaction.delete(authUser).where(eq(authUser.id, userId)).run();
      return true;
    });
  }
});

export const accountDeletionStore = createAccountDeletionStore(db);
