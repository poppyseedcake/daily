import {
  emptyScheduledDailySummaryWorkerCounts,
  runScheduledDailySummaryWorker,
  type ScheduledDailySummaryWorkerDependencies,
  type ScheduledDailySummaryWorkerEvent
} from './scheduledDailySummaryWorker';
import { createTechnicalEventRecorder } from './technicalEventRecorder';

type WorkerDependencies = Pick<
  ScheduledDailySummaryWorkerDependencies,
  'occurrenceStore' | 'delivery'
>;

type ScheduledDailySummaryWorkerCommandOptions = {
  loadDependencies?: () => Promise<WorkerDependencies>;
  loadTechnicalEventRecorder?: () => Promise<ReturnType<typeof createTechnicalEventRecorder>>;
  emit?: (event: ScheduledDailySummaryWorkerEvent) => void;
  eventNow?: () => Date;
  recordTechnicalEvent?: ReturnType<typeof createTechnicalEventRecorder>['record'];
  workerOptions?: Pick<
    ScheduledDailySummaryWorkerDependencies,
    'batchSize' | 'now' | 'monotonicNow'
  >;
};

type WorkerTerminalEvent = Extract<
  ScheduledDailySummaryWorkerEvent,
  {
    event: 'scheduled-daily-summary-worker-completed' | 'scheduled-daily-summary-worker-failed';
  }
>;

const loadProductionDependencies = async () => {
  const { createProductionScheduledDailySummaryWorkerDependencies } = await import(
    './scheduledDailySummaryWorkerProduction'
  );

  return createProductionScheduledDailySummaryWorkerDependencies();
};

const stdoutOnlyTechnicalEventRecorder = () =>
  createTechnicalEventRecorder({
    store: { persist: async () => Promise.reject() }
  });

const loadProductionTechnicalEventRecorder = async () => {
  const [{ db }, { createTechnicalLogStore }] = await Promise.all([
    import('$lib/server/db'),
    import('$lib/server/db/technicalLogStore')
  ]);

  return createTechnicalEventRecorder({ store: createTechnicalLogStore(db) });
};

const resolveTechnicalEventRecord = async (
  record: ReturnType<typeof createTechnicalEventRecorder>['record'] | undefined,
  loadRecorder: () => Promise<ReturnType<typeof createTechnicalEventRecorder>>
) => {
  if (record) return record;

  try {
    return (await loadRecorder()).record;
  } catch {
    return stdoutOnlyTechnicalEventRecorder().record;
  }
};

const recordWorkerTerminalEvent = async (
  event: WorkerTerminalEvent,
  occurredAt: string,
  record: ReturnType<typeof createTechnicalEventRecorder>['record']
) => {
  if (event.event === 'scheduled-daily-summary-worker-failed') {
    await record({
      eventCode: event.event,
      occurredAt,
      durationMilliseconds: event.durationMilliseconds,
      counts: event.counts,
      classification: event.classification,
      failure: null
    });
    return;
  }

  await record({
    eventCode: event.event,
    occurredAt,
    durationMilliseconds: event.durationMilliseconds,
    counts: event.counts
  });
};

export const executeScheduledDailySummaryWorkerCommand = async ({
  loadDependencies = loadProductionDependencies,
  loadTechnicalEventRecorder = loadProductionTechnicalEventRecorder,
  emit,
  eventNow = () => new Date(),
  recordTechnicalEvent,
  workerOptions
}: ScheduledDailySummaryWorkerCommandOptions = {}) => {
  let dependencies: WorkerDependencies;

  try {
    dependencies = await loadDependencies();
  } catch (failure) {
    const counts = emptyScheduledDailySummaryWorkerCounts();
    const terminalEvent = {
      event: 'scheduled-daily-summary-worker-failed',
      classification: 'worker-initialization-failed',
      counts,
      durationMilliseconds: 0
    } satisfies WorkerTerminalEvent;
    emit?.(terminalEvent);
    if (!emit || recordTechnicalEvent) {
      const record = await resolveTechnicalEventRecord(
        recordTechnicalEvent,
        loadTechnicalEventRecorder
      );
      await record({
        eventCode: terminalEvent.event,
        occurredAt: eventNow().toISOString(),
        durationMilliseconds: terminalEvent.durationMilliseconds,
        counts,
        classification: terminalEvent.classification,
        failure
      });
    }
    return { exitCode: 1 as const, counts };
  }

  let terminalEvent: WorkerTerminalEvent | null = null;
  const result = await runScheduledDailySummaryWorker({
    ...dependencies,
    ...workerOptions,
    emit: (event) => {
      if (
        event.event === 'scheduled-daily-summary-worker-completed' ||
        event.event === 'scheduled-daily-summary-worker-failed'
      ) {
        terminalEvent = event;
      }
      emit?.(event);
    }
  });

  if ((!emit || recordTechnicalEvent) && terminalEvent) {
    const record = await resolveTechnicalEventRecord(
      recordTechnicalEvent,
      loadTechnicalEventRecorder
    );
    await recordWorkerTerminalEvent(terminalEvent, eventNow().toISOString(), record);
  }

  return result;
};

export const runScheduledDailySummaryWorkerCommand = async ({
  execute = executeScheduledDailySummaryWorkerCommand,
  setExitCode = (exitCode: number) => {
    process.exitCode = exitCode;
  }
}: {
  execute?: typeof executeScheduledDailySummaryWorkerCommand;
  setExitCode?: (exitCode: number) => void;
} = {}) => {
  const result = await execute();
  setExitCode(result.exitCode);
  return result;
};
