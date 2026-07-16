import { describe, expect, test, vi } from 'vitest';
import { accountDeletionConfirmation } from '$lib/accountDeletion';
import { deleteDailyAccount } from './accountDeletion';

const secret = 'a-secure-attribution-secret-with-32-bytes';

describe('account deletion coordination', () => {
  test('uses an exact, explicit confirmation phrase', () => {
    expect(accountDeletionConfirmation).toBe('DELETE MY ACCOUNT');
  });

  test('revokes each locally held Google token then finishes local deletion', async () => {
    const calls: string[] = [];
    const store = {
      startDeleting: vi.fn().mockResolvedValue('started' as const),
      loadGoogleTokens: vi.fn().mockResolvedValue(['access-canary', 'refresh-canary', 'id-canary']),
      finishDeleting: vi.fn().mockResolvedValue(true)
    };
    const revoker = { revoke: vi.fn(async (token: string) => { calls.push(token); }) };

    await expect(
      deleteDailyAccount({ userId: 'user-1', attributionSecret: secret, store, revoker })
    ).resolves.toBe(true);
    expect(calls).toEqual(['access-canary', 'refresh-canary', 'id-canary']);
    expect(store.finishDeleting).toHaveBeenCalledOnce();
    expect(JSON.stringify(store.finishDeleting.mock.calls)).not.toContain('canary');
  });

  test('revocation failure cannot retain local User data or expose a token', async () => {
    const store = {
      startDeleting: vi.fn().mockResolvedValue('resuming' as const),
      loadGoogleTokens: vi.fn().mockResolvedValue(['private-token-canary']),
      finishDeleting: vi.fn().mockResolvedValue(true)
    };
    const revoker = { revoke: vi.fn().mockRejectedValue(new Error('provider unavailable')) };

    await expect(
      deleteDailyAccount({ userId: 'user-1', attributionSecret: secret, store, revoker })
    ).resolves.toBe(true);
    expect(store.finishDeleting).toHaveBeenCalledOnce();
  });

  test('a missing account is a safe repeated no-op', async () => {
    const store = {
      startDeleting: vi.fn().mockResolvedValue('missing' as const),
      loadGoogleTokens: vi.fn(),
      finishDeleting: vi.fn()
    };
    await expect(
      deleteDailyAccount({ userId: 'deleted-user', attributionSecret: secret, store })
    ).resolves.toBe(false);
    expect(store.loadGoogleTokens).not.toHaveBeenCalled();
  });
});
