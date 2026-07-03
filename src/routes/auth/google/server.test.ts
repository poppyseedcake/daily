import { beforeEach, describe, expect, test, vi } from 'vitest';

const { signInSocial } = vi.hoisted(() => ({
  signInSocial: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      signInSocial
    }
  },
  googleIdentityScopes: ['openid', 'email', 'profile']
}));

const { GET } = await import('./+server');

describe('Google sign-in route', () => {
  beforeEach(() => {
    signInSocial.mockReset();
  });

  test('asks Better Auth to return to Daily with Local Setup import requested', async () => {
    signInSocial.mockResolvedValue({
      response: { url: 'https://accounts.google.example/sign-in' },
      headers: new Headers()
    });

    const response = await GET({
      request: new Request('http://localhost/auth/google')
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://accounts.google.example/sign-in');
    expect(signInSocial).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: {
        provider: 'google',
        callbackURL: '/?localSetupImport=1',
        scopes: ['openid', 'email', 'profile']
      },
      returnHeaders: true
    });
  });
});
