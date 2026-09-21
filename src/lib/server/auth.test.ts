import { describe, expect, test } from 'vitest';
import {
  authOptions,
  googleIdentityScopes,
  googleProviderOptions,
  requireStoredDailyUserIdentity
} from './auth';
import { issueLegalConfirmationCookie, serializeLegalConfirmationCookie } from './legalConfirmation';

describe('Daily Better Auth configuration', () => {
  test('requests Google identity scopes without Calendar access', () => {
    expect(googleIdentityScopes).toEqual(['openid', 'email', 'profile']);
    expect(googleProviderOptions({ GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret' })).toMatchObject({
      clientId: 'client',
      clientSecret: 'secret',
      scopes: ['openid', 'email', 'profile']
    });
    expect(googleIdentityScopes.some((scope) => scope.includes('calendar'))).toBe(false);
  });

  test('rejects a signed-in Google account when the Daily User identity is not stored', () => {
    expect(() => requireStoredDailyUserIdentity('stored')).not.toThrow();
    expect(() => requireStoredDailyUserIdentity('store-failed')).toThrow(
      'Failed to persist Daily user identity: store-failed'
    );
  });
});

describe('Better Auth account creation gate', () => {
  test('rejects new account creation without the legal confirmation cookie', async () => {
    const before = authOptions.databaseHooks?.user?.create?.before;
    expect(before).toBeDefined();

    await expect(
      before!({} as never, { headers: new Headers() } as never)
    ).resolves.toBe(false);
  });

  test('accepts new account creation only with a current signed confirmation', async () => {
    const before = authOptions.databaseHooks?.user?.create?.before;
    const cookie = serializeLegalConfirmationCookie(issueLegalConfirmationCookie(), false);

    await expect(
      before!({} as never, {
        headers: new Headers({ cookie: cookie.split(';')[0] })
      } as never)
    ).resolves.toBeUndefined();
  });
});
