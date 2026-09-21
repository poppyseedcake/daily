import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getSession, loadConfirmation, saveConfirmation, deleteCookie } = vi.hoisted(() => ({
  getSession: vi.fn(),
  loadConfirmation: vi.fn(),
  saveConfirmation: vi.fn(),
  deleteCookie: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      getSession
    }
  }
}));

vi.mock('$lib/server/db/userLegalConfirmationStore', () => ({
  userLegalConfirmationStore: {
    load: loadConfirmation,
    save: saveConfirmation
  }
}));

const { actions, load } = await import('./+page.server');

const signedInSession = {
  user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
};

const requestWith = (values: Record<string, string> = {}) =>
  new Request('http://localhost/account/confirm', {
    method: 'POST',
    body: new URLSearchParams(values)
  });

describe('existing account legal confirmation', () => {
  beforeEach(() => {
    getSession.mockReset().mockResolvedValue(signedInSession);
    loadConfirmation.mockReset().mockResolvedValue(null);
    saveConfirmation.mockReset().mockResolvedValue(undefined);
    deleteCookie.mockReset();
  });

  test('shows the confirmation step without changing an existing account', async () => {
    await expect(
      load({
        request: new Request('http://localhost/account/confirm?returnTo=/?localSetupImport=1'),
        url: new URL('http://localhost/account/confirm?returnTo=/?localSetupImport=1')
      } as Parameters<typeof load>[0])
    ).resolves.toEqual({
      minimumUserAge: 16,
      termsVersion: '2026-09-21',
      returnTo: '/?localSetupImport=1'
    });
    expect(saveConfirmation).not.toHaveBeenCalled();
  });

  test('stores only the confirmation fields and preserves the requested return path', async () => {
    await expect(
      actions.default({
        request: requestWith({
          ageConfirmed: 'on',
          termsAccepted: 'on',
          returnTo: '/?localSetupImport=1'
        }),
        cookies: { delete: deleteCookie }
      } as unknown as Parameters<typeof actions.default>[0])
    ).rejects.toMatchObject({ status: 303, location: '/?localSetupImport=1' });

    expect(saveConfirmation).toHaveBeenCalledWith('user-1', {
      ageConfirmedAt: expect.any(String),
      termsAcceptedAt: expect.any(String),
      termsVersion: '2026-09-21'
    });
    expect(deleteCookie).toHaveBeenCalledWith('daily.legal_confirmation', { path: '/' });
  });

  test('rejects an incomplete confirmation on the server', async () => {
    await expect(
      actions.default({
        request: requestWith({ ageConfirmed: 'on' }),
        cookies: { delete: deleteCookie }
      } as unknown as Parameters<typeof actions.default>[0])
    ).resolves.toMatchObject({ status: 400 });
    expect(saveConfirmation).not.toHaveBeenCalled();
  });
});
