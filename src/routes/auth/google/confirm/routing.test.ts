import { resolve } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
let serverOrigin: string;
let realSignIn: typeof import('$lib/server/auth').auth.api.signInSocial;
const signInSocial = vi.fn();
const googleUserInfo = vi.fn();
let subjectSequence = 0;
const cookieList = (response: Response) => response.headers.getSetCookie();
const cookieHeader = (response: Response) => cookieList(response).map(value => value.split(';')[0]).join('; ');
const submit = (values: Record<string, string>, path = '/auth/google') => fetch(`${serverOrigin}${path}`, {
  method: 'POST', headers: { accept: 'text/html', origin: 'https://dailykickoff.eu', 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(values), redirect: 'manual'
});
async function finishGoogle(response: Response, cookies = cookieHeader(response)) {
  const state = new URL(response.headers.get('location')!).searchParams.get('state');
  return fetch(`${serverOrigin}/api/auth/callback/google?code=fixture-code&state=${state}`, { headers: { cookie: cookies }, redirect: 'manual' });
}

describe('Google authentication HTTP flow', () => {
  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('BETTER_AUTH_SECRET', 'daily-google-confirmation-test-secret-32-bytes');
    vi.stubEnv('BETTER_AUTH_URL', 'https://dailykickoff.eu');
    vi.stubEnv('ORIGIN', 'https://dailykickoff.eu');
    server = await createServer({ configFile: resolve('vite.config.ts'), mode: 'test', server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('No HTTP server address');
    serverOrigin = `http://127.0.0.1:${address.port}`;
    const { db } = await server.ssrLoadModule('/src/lib/server/db/index.ts');
    for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
      db.$client.exec(readFileSync(resolve('drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''));
    }
    const { auth } = await server.ssrLoadModule('/src/lib/server/auth.ts');
    realSignIn = auth.api.signInSocial;
    vi.spyOn(auth.api, 'signInSocial').mockImplementation((...args) => signInSocial(...args));
    const context = await auth.$context;
    const google = context.socialProviders.find((provider: { id: string }) => provider.id === 'google');
    // Google is the external seam: callback state and session handling stay real.
    google.validateAuthorizationCode = async () => ({ accessToken: 'fixture-token', scopes: ['openid', 'email', 'profile'] });
    google.getUserInfo = (...args: unknown[]) => googleUserInfo(...args);
  }, 30_000);
  afterAll(async () => { await server?.close(); vi.unstubAllEnvs(); });
  beforeEach(() => {
    signInSocial.mockReset().mockResolvedValue({ response: { url: 'https://accounts.google.example/sign-in' }, headers: new Headers({ 'set-cookie': 'oauth_state=state; Path=/; HttpOnly; Secure; SameSite=Lax' }) });
    subjectSequence += 1;
    googleUserInfo.mockReset().mockResolvedValue({ user: { id: `new-subject-${subjectSequence}`, name: 'Test user', email: `new-${subjectSequence}@example.com`, emailVerified: true }, data: { sub: `new-subject-${subjectSequence}`, email: `new-${subjectSequence}@example.com`, email_verified: true } });
  });

  test('redirects the retired confirmation page to registration in the workspace', async () => {
    const response = await fetch(`${serverOrigin}/auth/google/confirm`, { redirect: 'manual' });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/?auth=signup');
  });
  test('rejects missing Terms on registration without starting Google', async () => {
    const response = await submit({ intent: 'signup' });
    expect(response.headers.get('location')).toBe('/?auth=signup&error=terms_required');
    expect(signInSocial).not.toHaveBeenCalled();
  });
  test('starts sign-in without Terms and clears pending signup confirmation', async () => {
    const response = await submit({ intent: 'signin' });
    expect(response.status).toBe(303);
    expect(cookieList(response).join('\n')).toContain('daily.legal_confirmation=; Max-Age=0');
    expect(signInSocial).toHaveBeenCalledWith({ headers: expect.any(Headers), body: { provider: 'google', callbackURL: '/?localSetupImport=1', errorCallbackURL: '/?auth=signin', requestSignUp: false, scopes: ['openid', 'email', 'profile'] }, returnHeaders: true });
  });
  test('registers with Terms alone and preserves OAuth cookies', async () => {
    const response = await submit({ intent: 'signup', termsAccepted: 'on' });
    const cookies = cookieList(response).join('\n');
    expect(response.headers.get('location')).toBe('https://accounts.google.example/sign-in');
    expect(response.headers.get('cache-control')).toBe('no-store');
    for (const expected of ['oauth_state=state', 'daily.legal_confirmation=', 'HttpOnly', 'SameSite=Lax', 'Secure']) expect(cookies).toContain(expected);
    expect(signInSocial).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ requestSignUp: true, errorCallbackURL: '/?auth=signup' }) }));
    const confirmation = cookies.split('\n').find(value => value.startsWith('daily.legal_confirmation='))!;
    const payload = JSON.parse(Buffer.from(confirmation.split('=')[1].split('.')[0], 'base64url').toString());
    expect(payload).toMatchObject({ termsVersion: '2026-10-02', termsAcceptedAt: expect.any(String) });
    expect(payload).not.toHaveProperty('ageConfirmedAt');
    expect(payload).not.toHaveProperty('ageConfirmed');
  });
  test('returns provider startup failure to the same modal', async () => {
    signInSocial.mockRejectedValue(new Error('provider unavailable'));
    expect((await submit({ intent: 'signin' })).headers.get('location')).toBe('/?auth=signin&error=provider');
  });
  test('rejects a cross-origin registration submission', async () => {
    const response = await fetch(`${serverOrigin}/auth/google`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ intent: 'signup', termsAccepted: 'on' }), redirect: 'manual' });
    expect(response.status).toBe(403);
    expect(signInSocial).not.toHaveBeenCalled();
  });
  test('a new Google identity cannot create an account through Sign in', async () => {
    signInSocial.mockImplementation(realSignIn);
    const response = await finishGoogle(await submit({ intent: 'signin' }));
    expect(response.headers.get('location')).toBe('/?auth=signin&error=signup_disabled');
    expect(cookieList(response).some(value => value.includes('session_token='))).toBe(false);
  });
  test('direct signup cannot bypass the signed Terms confirmation gate', async () => {
    signInSocial.mockImplementation(realSignIn);
    const start = await submit({ intent: 'signup', termsAccepted: 'on' });
    const withoutTerms = cookieList(start).filter(value => !value.startsWith('daily.legal_confirmation=')).map(value => value.split(';')[0]).join('; ');
    const response = await finishGoogle(start, withoutTerms);
    expect(response.headers.get('location')).toContain('error=');
    expect(cookieList(response).some(value => value.includes('session_token='))).toBe(false);
  });
  test('registration persists Terms and a returning user signs in without them', async () => {
    signInSocial.mockImplementation(realSignIn);
    const start = await submit({ intent: 'signup', termsAccepted: 'on' });
    const registered = await finishGoogle(start);
    expect(registered.headers.get('location')).toBe('/?localSetupImport=1');
    expect(cookieList(registered).some(value => value.includes('session_token='))).toBe(true);
    const landing = await fetch(`${serverOrigin}/?localSetupImport=1`, { headers: { cookie: `${cookieHeader(start)}; ${cookieHeader(registered)}` } });
    expect(landing.status).toBe(200);
    expect(await landing.text()).not.toContain('Confirm your Daily account');
    const { auth } = await server.ssrLoadModule('/src/lib/server/auth.ts');
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(registered) }) });
    const { userLegalConfirmationStore } = await server.ssrLoadModule('/src/lib/server/db/userLegalConfirmationStore.ts');
    expect(await userLegalConfirmationStore.load(session.user.id)).toEqual({ termsVersion: '2026-10-02', termsAcceptedAt: expect.any(String) });
    const returned = await finishGoogle(await submit({ intent: 'signin' }));
    expect(returned.headers.get('location')).toBe('/?localSetupImport=1');
    expect(cookieList(returned).some(value => value.includes('session_token='))).toBe(true);
  }, 15_000);
});
