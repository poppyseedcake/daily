import { env } from '$env/dynamic/private';
import { auth, googleIdentityScopes } from '$lib/server/auth';
import {
  issueLegalConfirmationCookie,
  serializeLegalConfirmationCookie,
  serializeLegalConfirmationCookieDeletion
} from '$lib/server/legalConfirmation';

const redirectResponse = (location: string, headers = new Headers()) => {
  headers.set('location', location);
  headers.set('cache-control', 'no-store');
  return new Response(null, { status: 303, headers });
};

export const startGoogleAuthentication = async (request: Request, legacyIntent?: 'signup') => {
  const expectedOrigin = new URL(env.ORIGIN ?? request.url).origin;
  if (request.headers.get('origin') !== expectedOrigin) {
    return new Response('Cross-origin authentication submissions are not allowed.', { status: 403 });
  }
  const form = await request.formData();
  const intent = legacyIntent ?? form.get('intent');
  if (intent !== 'signin' && intent !== 'signup') {
    return redirectResponse('/?auth=signin&error=invalid_intent');
  }
  if (intent === 'signup' && form.get('termsAccepted') !== 'on') {
    return redirectResponse('/?auth=signup&error=terms_required');
  }

  const secure = new URL(request.url).protocol === 'https:' || env.ORIGIN?.startsWith('https://') === true;
  try {
    const result = await auth.api.signInSocial({
      headers: request.headers,
      body: {
        provider: 'google',
        callbackURL: '/?localSetupImport=1',
        errorCallbackURL: `/?auth=${intent}`,
        requestSignUp: intent === 'signup',
        scopes: [...googleIdentityScopes]
      },
      returnHeaders: true
    });
    if (!result.response.url) {
      return redirectResponse(`/?auth=${intent}&error=provider`);
    }

    const headers = new Headers(result.headers);
    headers.append('set-cookie', intent === 'signup'
      ? serializeLegalConfirmationCookie(issueLegalConfirmationCookie(), secure)
      : serializeLegalConfirmationCookieDeletion(secure));
    return redirectResponse(result.response.url, headers);
  } catch {
    return redirectResponse(`/?auth=${intent}&error=provider`);
  }
};
