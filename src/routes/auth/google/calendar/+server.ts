import { auth, googleCalendarReadScopes, googleIdentityScopes } from '$lib/server/auth';

const calendarConnectionFailedPath = '/?calendarConnection=failed';
const calendarConnectionSuccessPath = '/?calendarConnection=success';

const redirectResponse = (location: string, headers = new Headers()) => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('location', location);

  return new Response(null, {
    status: 303,
    headers: responseHeaders
  });
};

export const GET = async ({ request }) => {
  const session = await auth.api.getSession({
    headers: request.headers
  });

  if (!session?.user?.id) {
    return redirectResponse('/');
  }

  try {
    const result = await auth.api.linkSocialAccount({
      headers: request.headers,
      body: {
        provider: 'google',
        callbackURL: calendarConnectionSuccessPath,
        errorCallbackURL: calendarConnectionFailedPath,
        scopes: [...googleIdentityScopes, ...googleCalendarReadScopes]
      },
      returnHeaders: true
    });

    if (!result.response.url) {
      return redirectResponse(calendarConnectionFailedPath, result.headers);
    }

    return redirectResponse(result.response.url, result.headers);
  } catch {
    return redirectResponse(calendarConnectionFailedPath);
  }
};
