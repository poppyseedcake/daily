export type DailyPageAuthState =
  | {
      mode: 'visitor';
    }
  | {
      mode: 'user';
      userId: string;
      summaryRecipient: string;
    };

export type DailyPageSession = {
  user?: {
    id?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  } | null;
} | null;

export const authStateFromSession = (session: DailyPageSession): DailyPageAuthState => {
  const userId = session?.user?.id;
  const email = session?.user?.email;

  if (!userId || !email || session.user?.emailVerified !== true) {
    return { mode: 'visitor' };
  }

  return {
    mode: 'user',
    userId,
    summaryRecipient: email
  };
};
