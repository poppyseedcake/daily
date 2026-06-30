import { toSvelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth';

const authHandler = toSvelteKitHandler(auth);

export const GET = authHandler;
export const POST = authHandler;
