import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { LegalConfirmation } from '$lib/legalConfirmation';
import { users } from './schema';

export type UserLegalConfirmationStore = {
  load(userId: string): Promise<LegalConfirmation | null>;
  save(userId: string, confirmation: LegalConfirmation): Promise<void>;
};

export const createUserLegalConfirmationStore = (database: typeof db): UserLegalConfirmationStore => ({
  async load(userId) {
    const [row] = await database
      .select({
        termsAcceptedAt: users.termsAcceptedAt,
        termsVersion: users.termsVersion
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!row?.termsAcceptedAt || !row.termsVersion) {
      return null;
    }

    return {
      termsAcceptedAt: row.termsAcceptedAt,
      termsVersion: row.termsVersion
    };
  },

  async save(userId, confirmation) {
    await database
      .update(users)
      .set({
        termsAcceptedAt: confirmation.termsAcceptedAt,
        termsVersion: confirmation.termsVersion,
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(users.id, userId));
  }
});

export const userLegalConfirmationStore = createUserLegalConfirmationStore(db);
