export type DailyPageAuthState =
  | {
      mode: 'visitor';
    }
  | {
      mode: 'user';
      userId: string;
      name?: string;
      summaryRecipient: string;
    };

export type DailyPageSession = {
  user?: {
    id?: string | null;
    name?: string | null;
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
    ...(session.user?.name?.trim() ? { name: session.user.name.trim() } : {}),
    summaryRecipient: email
  };
};
