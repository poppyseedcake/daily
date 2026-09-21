import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { authStateFromSession } from '$lib/server/pageAuthState';
import {
  dailyTermsVersion,
  isLegalConfirmationComplete,
  minimumUserAge,
  safeLegalReturnPath
} from '$lib/legalConfirmation';
import { userLegalConfirmationStore } from '$lib/server/db/userLegalConfirmationStore';

export const load = async ({ request, url }) => {
  const authState = authStateFromSession(
    await auth.api.getSession({ headers: request.headers })
  );
  if (authState.mode !== 'user') {
    throw redirect(303, '/');
  }

  const confirmation = await userLegalConfirmationStore.load(authState.userId);
  const returnTo = safeLegalReturnPath(url.searchParams.get('returnTo'));
  if (isLegalConfirmationComplete(confirmation)) {
    throw redirect(303, returnTo);
  }

  return {
    minimumUserAge,
    termsVersion: dailyTermsVersion,
    returnTo
  };
};

export const actions = {
  default: async ({ request, cookies }) => {
    const authState = authStateFromSession(
      await auth.api.getSession({ headers: request.headers })
    );
    if (authState.mode !== 'user') {
      return fail(403, { error: 'Sign in with Google before confirming these requirements.' });
    }

    const formData = await request.formData();
    if (formData.get('ageConfirmed') !== 'on' || formData.get('termsAccepted') !== 'on') {
      return fail(400, { error: 'Check both boxes to continue.' });
    }

    const now = new Date().toISOString();
    await userLegalConfirmationStore.save(authState.userId, {
      ageConfirmedAt: now,
      termsAcceptedAt: now,
      termsVersion: dailyTermsVersion
    });
    cookies.delete('daily.legal_confirmation', { path: '/' });

    throw redirect(303, safeLegalReturnPath(String(formData.get('returnTo') ?? '/')));
  }
};
