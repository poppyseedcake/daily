import { startGoogleAuthentication } from '$lib/server/googleAuthentication';

// Previously submitted registration forms still require Terms acceptance.
export const POST = ({ request }) => startGoogleAuthentication(request, 'signup');
