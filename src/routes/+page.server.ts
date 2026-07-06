import { auth } from '$lib/server/auth';
import { isAdministratorAuthState } from '$lib/server/adminAuthorization';
import { authStateFromSession } from '$lib/server/pageAuthState';
import { userSummaryConfigurationStore } from '$lib/server/db/summaryConfigurationStore';
import { deliveryRecordStore } from '$lib/server/db/deliveryRecordStore';
import { userTodoStore } from '$lib/server/db/todoStore';
import {
  DailySummaryDeliveryError,
  type DailySummaryDeliveryErrorClassification,
  dailySummaryDeliveryProvider,
  dailySummarySenderAddress
} from '$lib/server/dailySummaryDelivery';
import { buildDailySummaryPreviewInput } from '$lib/dailySummaryPreview';
import { renderDailySummary } from '$lib/dailySummaryRenderer';
import { loadUserSummaryConfiguration } from '$lib/server/summaryConfigurationPersistence';
import { loadUserTodoState } from '$lib/server/todoPersistence';
import { summaryConfigurationSchema } from '$lib/summaryConfiguration';
import { createDefaultTodoState, todoStateSchema } from '$lib/todo';

const testDeliveryFailureMessage = (classification: DailySummaryDeliveryErrorClassification) => {
  switch (classification) {
    case 'configuration-missing':
      return 'Test Daily Summary delivery is not configured.';
    case 'provider-rejected':
      return 'The delivery provider rejected the test Daily Summary.';
    case 'provider-unavailable':
      return 'The test Daily Summary could not be sent.';
    default: {
      const exhaustiveClassification: never = classification;
      return exhaustiveClassification;
    }
  }
};

const validationFailureResponse = {
  outcome: 'failed',
  reason: 'validation-failed',
  message: 'The saved Daily Summary setup is invalid, so no provider request was made.'
} as const;

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
    const validConfiguration = summaryConfigurationSchema.safeParse(configuration);
    const validTodoState = todoStateSchema.safeParse(todoState);

    if (!validConfiguration.success || !validTodoState.success) {
      return validationFailureResponse;
    }

    const renderedSummary = renderDailySummary(
      buildDailySummaryPreviewInput({
        configuration: validConfiguration.data,
        todoCategories: validTodoState.data.todoCategories,
        todoTasks: validTodoState.data.todoTasks
      })
    );
    const message = {
      to: authState.summaryRecipient,
      from: dailySummarySenderAddress(),
      subject: 'Test Daily Summary',
      html: renderedSummary.html,
      text: renderedSummary.text
    };
    let accepted;

    try {
      accepted = await dailySummaryDeliveryProvider.send(message);
    } catch (error) {
      if (!(error instanceof DailySummaryDeliveryError)) {
        throw error;
      }

      await deliveryRecordStore.recordAttempt(authState.userId, {
        id: crypto.randomUUID(),
        attemptType: 'test',
        requestedAt,
        completedAt: new Date().toISOString(),
        deliveryStatus: 'failed',
        providerName: error.providerName,
        providerMessageId: null,
        providerStatusMetadata: error.providerStatusMetadata,
        errorClassification: error.classification
      });

      return {
        outcome: 'failed',
        reason: error.classification,
        message: testDeliveryFailureMessage(error.classification)
      };
    }

    if (!accepted.providerMessageId) {
      await deliveryRecordStore.recordAttempt(authState.userId, {
        id: crypto.randomUUID(),
        attemptType: 'test',
        requestedAt,
        completedAt: new Date().toISOString(),
        deliveryStatus: 'failed',
        providerName: accepted.providerName,
        providerMessageId: null,
        providerStatusMetadata: accepted.providerStatusMetadata
          ? `${accepted.providerStatusMetadata}; missing message id`
          : 'missing message id',
        errorClassification: 'provider-missing-message-id'
      });

      return {
        outcome: 'failed',
        reason: 'provider-missing-message-id',
        message: 'The delivery provider accepted the request without a message id.'
      };
    }

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
