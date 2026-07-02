import { describe, expect, test } from 'vitest';
import { authStateFromSession } from './pageAuthState';

describe('Daily page auth state', () => {
  test('keeps missing or unverified auth as Visitor mode', () => {
    expect(authStateFromSession(null)).toEqual({ mode: 'visitor' });
    expect(authStateFromSession({ user: { email: 'user@example.com', emailVerified: false } })).toEqual({
      mode: 'visitor'
    });
  });

  test('uses the verified Google email as the read-only Summary Recipient', () => {
    expect(
      authStateFromSession({ user: { id: 'user-1', email: 'user@example.com', emailVerified: true } })
    ).toEqual({
      mode: 'user',
      userId: 'user-1',
      summaryRecipient: 'user@example.com'
    });
  });

  test('keeps a verified session without a User id in Visitor mode', () => {
    expect(authStateFromSession({ user: { email: 'user@example.com', emailVerified: true } })).toEqual({
      mode: 'visitor'
    });
  });
});
