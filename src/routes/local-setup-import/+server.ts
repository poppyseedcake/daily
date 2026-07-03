import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { importVisitorLocalSetupForUser } from '$lib/server/localSetupImport';
import { authStateFromSession } from '$lib/server/pageAuthState';

const statusForOutcome = (outcome: Awaited<ReturnType<typeof importVisitorLocalSetupForUser>>['outcome']) => {
  if (outcome === 'invalid-local-setup') {
    return 400;
  }

  if (outcome === 'import-failed') {
    return 500;
  }

  return 200;
};

export const PUT = async ({ request }) => {
  const session = await auth.api.getSession({
    headers: request.headers
  });
  const authState = authStateFromSession(session);

  if (authState.mode !== 'user') {
    return json({ outcome: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json({ outcome: 'invalid-local-setup' }, { status: 400 });
  }

  const result = await importVisitorLocalSetupForUser(authState.userId, payload);

  return json(result, { status: statusForOutcome(result.outcome) });
};
