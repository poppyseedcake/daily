import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      getSession
    }
  }
}));

vi.mock('$env/dynamic/private', () => ({
  env: {
    ADMINISTRATOR_EMAIL_ALLOWLIST: ' admin@example.com , other@example.com '
  }
}));

const { load } = await import('./+page.server');

const loadAdminPage = () =>
  load({
    request: new Request('http://localhost/admin')
  } as Parameters<typeof load>[0]);

describe('Admin Panel server load', () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  test('denies a Visitor before rendering operational Admin Panel output', async () => {
    getSession.mockResolvedValue(null);

    await expect(loadAdminPage()).resolves.toEqual({
      access: {
        mode: 'visitor-denied',
        message: 'Sign in with an authorized Google account to access the Admin Panel.'
      }
    });
  });

  test('denies a signed-in User whose verified Google email is not allowlisted', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    await expect(loadAdminPage()).resolves.toEqual({
      access: {
        mode: 'user-denied',
        message: 'Your signed-in Google account is not authorized for the Admin Panel.'
      }
    });
  });

  test('allows a signed-in Administrator whose verified Google email is allowlisted', async () => {
    getSession.mockResolvedValue({
      user: { id: 'admin-1', email: 'Admin@Example.com', emailVerified: true }
    });

    await expect(loadAdminPage()).resolves.toEqual({
      access: {
        mode: 'allowed'
      }
    });
  });
});
