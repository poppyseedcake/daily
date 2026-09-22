import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

type SignInSocial = {
  mockReset: () => void;
  mockImplementation: (implementation: (...args: never[]) => Promise<unknown>) => void;
};

let server: ViteDevServer;
let serverOrigin: string;
let signInSocial: SignInSocial;

const confirmationHeaders = {
  accept: 'text/html',
  origin: 'https://dailykickoff.eu',
  'content-type': 'application/x-www-form-urlencoded'
};

const submit = (body: URLSearchParams) =>
  fetch(`${serverOrigin}/auth/google/confirm/submit`, {
    method: 'POST',
    headers: confirmationHeaders,
    body,
    redirect: 'manual'
  });

describe('Google sign-in confirmation HTTP routing', () => {
  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('BETTER_AUTH_SECRET', 'daily-google-confirmation-test-secret-32-bytes');
    vi.stubEnv('ORIGIN', 'https://dailykickoff.eu');

    server = await createServer({
      configFile: resolve('vite.config.ts'),
      mode: 'test',
      server: { host: '127.0.0.1', port: 0 }
    });
    await server.listen();

    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') {
      throw new Error('Vite did not expose its HTTP server address');
    }

    serverOrigin = `http://127.0.0.1:${address.port}`;

    const { auth } = await server.ssrLoadModule('/src/lib/server/auth.ts');
    const oauth = vi.spyOn(auth.api, 'signInSocial');
    signInSocial = oauth as unknown as SignInSocial;
  }, 30_000);

  afterAll(async () => {
    await server?.close();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    signInSocial.mockReset();
  });

  test('renders a form that posts to the endpoint route', async () => {
    const response = await fetch(`${serverOrigin}/auth/google/confirm`, {
      headers: { accept: 'text/html' }
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('action="/auth/google/confirm/submit"');
  });

  test('redirects submissions missing either confirmation without starting OAuth', async () => {
    const missingConfirmations = [
      new URLSearchParams(),
      new URLSearchParams({ ageConfirmed: 'on' }),
      new URLSearchParams({ termsAccepted: 'on' })
    ];

    for (const body of missingConfirmations) {
      const response = await submit(body);

      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/auth/google/confirm?error=required');
    }

    expect(signInSocial).not.toHaveBeenCalled();
  });

  test('starts mocked Google OAuth and sets OAuth and secure confirmation cookies', async () => {
    signInSocial.mockImplementation(async () => ({
      response: { url: 'https://accounts.google.example/sign-in' },
      headers: new Headers({
        'set-cookie': 'oauth_state=state; Path=/; HttpOnly; Secure; SameSite=Lax'
      })
    }));

    const response = await submit(
      new URLSearchParams({ ageConfirmed: 'on', termsAccepted: 'on' })
    );
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const cookies = headers.getSetCookie?.().join('\n') ?? headers.get('set-cookie') ?? '';

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://accounts.google.example/sign-in');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(cookies).toContain('oauth_state=state');
    expect(cookies).toContain('daily.legal_confirmation=');
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('SameSite=Lax');
    expect(cookies).toContain('Secure');
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
