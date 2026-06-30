import { auth } from '$lib/server/auth';

export const POST = async ({ request }) => {
  const result = await auth.api.signOut({
    headers: request.headers,
    returnHeaders: true
  });

  const headers = new Headers(result.headers);
  headers.set('location', '/');

  return new Response(null, {
    status: 303,
    headers
  });
};
