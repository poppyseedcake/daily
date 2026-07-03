import { redirect } from '@sveltejs/kit';
import { auth, googleIdentityScopes } from '$lib/server/auth';

export const GET = async ({ request }) => {
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
    throw redirect(303, '/');
  }

  const headers = new Headers(result.headers);
  headers.set('location', result.response.url);

  return new Response(null, {
    status: 303,
    headers
  });
};
