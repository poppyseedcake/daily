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
    expect(authStateFromSession({ user: { email: 'user@example.com', emailVerified: true } })).toEqual({
      mode: 'user',
      summaryRecipient: 'user@example.com'
    });
  });
});
