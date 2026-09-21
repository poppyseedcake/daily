import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import { auth, googleIdentityScopes } from '$lib/server/auth';
import {
  issueLegalConfirmationCookie,
  serializeLegalConfirmationCookie
} from '$lib/server/legalConfirmation';

const errorRedirect = (reason: string) =>
  new Response(null, {
    status: 303,
    headers: { location: `/auth/google/confirm?error=${reason}` }
  });

const isSecureRequest = (request: Request) =>
  new URL(request.url).protocol === 'https:' || env.ORIGIN?.startsWith('https://') === true;

export const POST = async ({ request }) => {
  const formData = await request.formData();
  if (formData.get('ageConfirmed') !== 'on' || formData.get('termsAccepted') !== 'on') {
    return errorRedirect('required');
  }

  try {
    const result = await auth.api.signInSocial({
      headers: request.headers,
      body: {
        provider: 'google',
        callbackURL: '/?localSetupImport=1',
        scopes: [...googleIdentityScopes]
      },
      returnHeaders: true
    });

    if (!result.response.url) {
      return errorRedirect('provider');
    }

    const headers = new Headers(result.headers);
    headers.append(
      'set-cookie',
      serializeLegalConfirmationCookie(issueLegalConfirmationCookie(), isSecureRequest(request))
    );
    headers.set('location', result.response.url);
    headers.set('cache-control', 'no-store');

    return new Response(null, {
      status: 303,
      headers
    });
  } catch {
    return errorRedirect('provider');
  }
};

export const GET = async () => {
  throw redirect(303, '/auth/google/confirm');
};
