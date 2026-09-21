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

const { POST } = await import('./+server');

const requestWith = (values: Record<string, string> = {}) => {
  const form = new URLSearchParams(values);
  return new Request('http://localhost/auth/google/confirm', {
    method: 'POST',
    body: form
  });
};

describe('Google sign-in confirmation route', () => {
  beforeEach(() => {
    signInSocial.mockReset();
  });

  test('does not start OAuth when either confirmation is missing', async () => {
    const response = await POST({ request: requestWith({ ageConfirmed: 'on' }) } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/auth/google/confirm?error=required');
    expect(signInSocial).not.toHaveBeenCalled();
  });

  test('starts Google OAuth and sets the short-lived confirmation cookie', async () => {
    signInSocial.mockResolvedValue({
      response: { url: 'https://accounts.google.example/sign-in' },
      headers: new Headers({ 'set-cookie': 'oauth_state=state; Path=/' })
    });

    const response = await POST({
      request: requestWith({ ageConfirmed: 'on', termsAccepted: 'on' })
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://accounts.google.example/sign-in');
    expect(response.headers.get('set-cookie')).toContain('oauth_state=state');
    expect(response.headers.get('set-cookie')).toContain('daily.legal_confirmation=');
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
