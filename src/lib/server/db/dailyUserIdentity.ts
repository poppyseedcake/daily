export type DailyUserIdentity = {
  id: string;
  googleSubject: string;
  email: string;
};

export type DailyUserIdentityStore = {
  upsertGoogleUser: (identity: DailyUserIdentity) => Promise<void>;
};

export type DailyUserIdentityOutcome =
  | 'stored'
  | 'invalid-identity'
  | 'email-already-owned'
  | 'store-failed';

export class DailyUserIdentityEmailConflictError extends Error {
  constructor(email: string) {
    super(`Daily User email is already owned by another Google identity: ${email}`);
    this.name = 'DailyUserIdentityEmailConflictError';
  }
}

const hasRequiredIdentity = (identity: DailyUserIdentity) =>
  identity.id.trim().length > 0 &&
  identity.googleSubject.trim().length > 0 &&
  identity.email.trim().length > 0;

export const persistDailyUserIdentity = async (
  store: DailyUserIdentityStore,
  identity: DailyUserIdentity
): Promise<{ outcome: DailyUserIdentityOutcome }> => {
  if (!hasRequiredIdentity(identity)) {
    return { outcome: 'invalid-identity' };
  }

  try {
    await store.upsertGoogleUser(identity);
  } catch (error) {
    if (error instanceof DailyUserIdentityEmailConflictError) {
      return { outcome: 'email-already-owned' };
    }

    return { outcome: 'store-failed' };
  }

  return { outcome: 'stored' };
};
