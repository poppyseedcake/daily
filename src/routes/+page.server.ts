import { auth } from '$lib/server/auth';
import { isAdministratorAuthState } from '$lib/server/adminAuthorization';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { userSummaryConfigurationStore } from '$lib/server/db/summaryConfigurationStore';
import { deliveryRecordStore } from '$lib/server/db/deliveryRecordStore';
import { userTodoStore } from '$lib/server/db/todoStore';
import {
  dailySummaryDeliveryProvider,
  dailySummarySenderAddress
} from '$lib/server/dailySummaryDelivery';
import { buildDailySummaryPreviewInput } from '$lib/dailySummaryPreview';
import { renderDailySummary } from '$lib/dailySummaryRenderer';
import { loadUserSummaryConfiguration } from '$lib/server/summaryConfigurationPersistence';
import { loadUserTodoState } from '$lib/server/todoPersistence';
import { createDefaultTodoState } from '$lib/todo';

export const load = async ({ request }) => {
  const session = await auth.api.getSession({
    headers: request.headers
  });
  const authState = authStateFromSession(session);
  const summaryConfiguration =
    authState.mode === 'user'
      ? await loadUserSummaryConfiguration(userSummaryConfigurationStore, authState.userId).catch((error: unknown) => {
          console.warn('Failed to load User Summary Configuration.', {
            userId: authState.userId,
            error
          });

          return null;
        })
      : null;
  const todoState =
    authState.mode === 'user'
      ? await loadUserTodoState(userTodoStore, authState.userId).catch((error: unknown) => {
          console.warn('Failed to load User Todo state.', {
            userId: authState.userId,
            error
          });

          return createDefaultTodoState();
        })
      : createDefaultTodoState();
  const deliveryRecords =
    authState.mode === 'user'
      ? await deliveryRecordStore.loadRecentForUser(authState.userId, new Date().toISOString()).catch((error: unknown) => {
          console.warn('Failed to load User Delivery Records.', {
            userId: authState.userId,
            error
          });

          return [];
        })
      : [];

  return {
    authState,
    isAdministrator: isAdministratorAuthState(authState),
    summaryConfiguration,
    todoState,
    deliveryRecords
  };
};

export const actions = {
  sendTestDailySummary: async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers
    });
    const authState = authStateFromSession(session);

    if (authState.mode !== 'user') {
      return { outcome: 'unauthorized' };
    }

    const requestedAt = new Date().toISOString();
    const configuration = await loadUserSummaryConfiguration(
      userSummaryConfigurationStore,
      authState.userId
    );
    const todoState = await loadUserTodoState(userTodoStore, authState.userId);
    const renderedSummary = renderDailySummary(
      buildDailySummaryPreviewInput({
        configuration,
        todoCategories: todoState.todoCategories,
        todoTasks: todoState.todoTasks
      })
    );
    const accepted = await dailySummaryDeliveryProvider.send({
      to: authState.summaryRecipient,
      from: dailySummarySenderAddress(),
      subject: 'Test Daily Summary',
      html: renderedSummary.html,
      text: renderedSummary.text
    });

    await deliveryRecordStore.recordAttempt(authState.userId, {
      id: crypto.randomUUID(),
      attemptType: 'test',
      requestedAt,
      completedAt: new Date().toISOString(),
      deliveryStatus: 'sent',
      providerName: accepted.providerName,
      providerMessageId: accepted.providerMessageId,
      providerStatusMetadata: accepted.providerStatusMetadata,
      errorClassification: null
    });

    return { outcome: 'sent' };
  }
};
