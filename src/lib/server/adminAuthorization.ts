import { env } from '$env/dynamic/private';
import type { DailyPageAuthState } from './pageAuthState';

const administratorEmailAllowlist = (() => {
  let cache: Set<string> | null = null;

  return () => {
    cache ??= new Set(
      (env.ADMINISTRATOR_EMAIL_ALLOWLIST ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    );

    return cache;
  };
})();

export const isAdministratorAuthState = (authState: DailyPageAuthState) =>
  authState.mode === 'user' && administratorEmailAllowlist().has(authState.summaryRecipient.toLowerCase());
