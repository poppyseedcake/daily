import { createGoogleMapsPersonAttribution } from './googleMapsPersonAttribution';

export type AccountDeletionStore = {
  startDeleting(userId: string): Promise<'started' | 'resuming' | 'missing'>;
  loadGoogleTokens(userId: string): Promise<string[]>;
  finishDeleting(userId: string, personUsageIdentity: string): Promise<boolean>;
};

export type GoogleTokenRevoker = {
  revoke(token: string): Promise<void>;
};

export const googleTokenRevoker: GoogleTokenRevoker = {
  async revoke(token) {
    const response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(5_000)
    });

    if (!response.ok) throw new Error('google-token-revocation-failed');
  }
};

export const deleteDailyAccount = async ({
  userId,
  attributionSecret,
  store,
  revoker = googleTokenRevoker
}: {
  userId: string;
  attributionSecret: string;
  store: AccountDeletionStore;
  revoker?: GoogleTokenRevoker;
}) => {
  const state = await store.startDeleting(userId);
  if (state === 'missing') return false;

  const tokens = await store.loadGoogleTokens(userId);
  for (const token of new Set(tokens)) {
    try {
      await revoker.revoke(token);
    } catch {
      // Provider revocation is deliberately best effort. Never expose the token.
    }
  }

  const { personUsageIdentity } = createGoogleMapsPersonAttribution({
    authState: { mode: 'user', userId },
    secret: attributionSecret
  });
  return store.finishDeleting(userId, personUsageIdentity);
};
