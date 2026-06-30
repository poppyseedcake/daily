export type DailyPageAuthState =
  | {
      mode: 'visitor';
    }
  | {
      mode: 'user';
      summaryRecipient: string;
    };

export type DailyPageSession = {
  user?: {
    email?: string | null;
    emailVerified?: boolean | null;
  } | null;
} | null;

export const authStateFromSession = (session: DailyPageSession): DailyPageAuthState => {
  const email = session?.user?.email;

  if (!email || session.user?.emailVerified !== true) {
    return { mode: 'visitor' };
  }

  return {
    mode: 'user',
    summaryRecipient: email
  };
};
