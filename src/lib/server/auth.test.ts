import { describe, expect, test } from 'vitest';
import { googleIdentityScopes, googleProviderOptions, requireStoredDailyUserIdentity } from './auth';

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
