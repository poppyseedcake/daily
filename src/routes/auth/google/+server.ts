import { redirect } from '@sveltejs/kit';
import { startGoogleAuthentication } from '$lib/server/googleAuthentication';

export const GET = () => { throw redirect(303, '/?auth=signin'); };
export const POST = ({ request }) => startGoogleAuthentication(request);
