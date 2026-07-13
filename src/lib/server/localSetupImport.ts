import { randomUUID } from 'node:crypto';
import {
  createUserSetupImportDraftFromLocalSetup,
  type LocalSetupInput,
  type LocalSetupLoadOutcome
} from '$lib/localSetup';
import {
  persistUserSetupImportDraftForNewUser,
  type UserSetupImportPersistenceOutcome
} from '$lib/server/db/userSetupImportPersistence';
import { userSetupImportStore } from '$lib/server/db/userSetupImportStore';

export type LocalSetupImportOutcome =
  | UserSetupImportPersistenceOutcome
  | 'invalid-local-setup';

export const importVisitorLocalSetupForUser = async (
  userId: string,
  setup: unknown
): Promise<{ outcome: LocalSetupImportOutcome }> => {
  let draft;

  try {
    draft = createUserSetupImportDraftFromLocalSetup(
      { outcome: 'loaded' as LocalSetupLoadOutcome, setup: setup as LocalSetupInput },
      {
        userId,
        summaryConfigurationId: randomUUID(),
        weatherLocationId: randomUUID(),
        nextCommuteRouteId: () => randomUUID(),
        nextTodoCategoryId: () => randomUUID(),
        nextTodoTaskId: () => randomUUID()
      }
    );
  } catch {
    return { outcome: 'invalid-local-setup' };
  }

  if (!draft) {
    return { outcome: 'invalid-local-setup' };
  }

  return persistUserSetupImportDraftForNewUser(userSetupImportStore, userId, draft);
};
