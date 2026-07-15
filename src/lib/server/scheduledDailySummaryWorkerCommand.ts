import {
  emptyScheduledDailySummaryWorkerCounts,
  runScheduledDailySummaryWorker,
  type ScheduledDailySummaryWorkerDependencies,
  type ScheduledDailySummaryWorkerEvent,
  type ScheduledDailySummaryWorkerCounts
} from './scheduledDailySummaryWorker';
import { createTechnicalEventRecorder } from './technicalEventRecorder';
import type {
  ScheduledWorkerRun,
  ScheduledWorkerRunStore
} from './db/scheduledWorkerRunStore';

type WorkerDependencies = Pick<
  ScheduledDailySummaryWorkerDependencies,
  'occurrenceStore' | 'delivery'
>;

type ScheduledDailySummaryWorkerCommandOptions = {
  loadDependencies?: () => Promise<WorkerDependencies>;
  loadTechnicalEventRecorder?: () => Promise<ReturnType<typeof createTechnicalEventRecorder>>;
  loadScheduledWorkerRunStore?: () => Promise<ScheduledWorkerRunStore>;
  emit?: (event: ScheduledDailySummaryWorkerEvent) => void;
  eventNow?: () => Date;
  invocationMonotonicNow?: () => number;
  recordTechnicalEvent?: ReturnType<typeof createTechnicalEventRecorder>['record'];
  persistScheduledWorkerRun?: ScheduledWorkerRunStore['persist'];
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

const loadProductionScheduledWorkerRunStore = async () => {
  const [{ db }, { createScheduledWorkerRunStore }] = await Promise.all([
    import('$lib/server/db'),
    import('$lib/server/db/scheduledWorkerRunStore')
  ]);

  return createScheduledWorkerRunStore(db);
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

const scheduledWorkerRunFromTerminalEvent = (
  event: WorkerTerminalEvent,
  startedAt: string,
  completedAt: string
): ScheduledWorkerRun => ({
  startedAt,
  completedAt,
  durationMilliseconds: event.durationMilliseconds,
  outcome:
    event.event === 'scheduled-daily-summary-worker-failed'
      ? 'failed'
      : event.counts.isolatedError > 0
        ? 'completed-with-isolated-errors'
        : 'succeeded',
  failureClassification:
    event.event === 'scheduled-daily-summary-worker-failed' ? event.classification : null,
  counts: event.counts
});

const persistWorkerRun = async (
  run: ScheduledWorkerRun,
  persist: ScheduledWorkerRunStore['persist'] | undefined,
  loadStore: () => Promise<ScheduledWorkerRunStore>
) => {
  await (persist ?? (await loadStore()).persist)(run);
};

const observeOccurrenceEvent = (
  counts: ScheduledDailySummaryWorkerCounts,
  event: ScheduledDailySummaryWorkerEvent
) => {
  if (event.event === 'scheduled-daily-summary-occurrence-isolated-error') {
    counts.due += 1;
    counts.isolatedError += 1;
    return;
  }
  if (event.event !== 'scheduled-daily-summary-occurrence-completed') return;

  counts.due += 1;
  counts[event.outcome] += 1;
};

export const executeScheduledDailySummaryWorkerCommand = async ({
  loadDependencies = loadProductionDependencies,
  loadTechnicalEventRecorder = loadProductionTechnicalEventRecorder,
  loadScheduledWorkerRunStore = loadProductionScheduledWorkerRunStore,
  emit,
  eventNow = () => new Date(),
  invocationMonotonicNow = () => performance.now(),
  recordTechnicalEvent,
  persistScheduledWorkerRun,
  workerOptions
}: ScheduledDailySummaryWorkerCommandOptions = {}) => {
  const startedAt = eventNow().toISOString();
  const invocationStartedAt = invocationMonotonicNow();
  const observedCounts = emptyScheduledDailySummaryWorkerCounts();

  const finalize = async (
    terminalEvent: WorkerTerminalEvent,
    result: { exitCode: 0 | 1; counts: ScheduledDailySummaryWorkerCounts }
  ) => {
    const completedAt = eventNow().toISOString();
    let finalEvent = terminalEvent;
    let finalResult = result;

    if (!emit || persistScheduledWorkerRun) {
      try {
        await persistWorkerRun(
          scheduledWorkerRunFromTerminalEvent(terminalEvent, startedAt, completedAt),
          persistScheduledWorkerRun,
          loadScheduledWorkerRunStore
        );
      } catch {
        if (result.exitCode === 0) {
          finalEvent = {
            event: 'scheduled-daily-summary-worker-failed',
            classification: 'worker-run-persistence-failed',
            counts: result.counts,
            durationMilliseconds: terminalEvent.durationMilliseconds
          };
          finalResult = { exitCode: 1, counts: result.counts };
        }
      }
    }

    emit?.(finalEvent);
    if (!emit || recordTechnicalEvent) {
      const record = await resolveTechnicalEventRecord(
        recordTechnicalEvent,
        loadTechnicalEventRecorder
      );
      await recordWorkerTerminalEvent(finalEvent, completedAt, record);
    }

    return finalResult;
  };

  let dependencies: WorkerDependencies;

  try {
    dependencies = await loadDependencies();
  } catch {
    const counts = emptyScheduledDailySummaryWorkerCounts();
    const terminalEvent = {
      event: 'scheduled-daily-summary-worker-failed',
      classification: 'worker-initialization-failed',
      counts,
      durationMilliseconds: invocationMonotonicNow() - invocationStartedAt
    } satisfies WorkerTerminalEvent;
    return finalize(terminalEvent, { exitCode: 1, counts });
  }

  let terminalEvent: WorkerTerminalEvent | null = null;
  let completedTerminalEvent: WorkerTerminalEvent;
  let result: Awaited<ReturnType<typeof runScheduledDailySummaryWorker>>;

  try {
    result = await runScheduledDailySummaryWorker({
      ...dependencies,
      ...workerOptions,
      emit: (event) => {
        if (
          event.event === 'scheduled-daily-summary-worker-completed' ||
          event.event === 'scheduled-daily-summary-worker-failed'
        ) {
          terminalEvent = event;
          return;
        }
        observeOccurrenceEvent(observedCounts, event);
        emit?.(event);
      }
    });
    const reportedTerminalEvent = terminalEvent as WorkerTerminalEvent | null;
    if (!reportedTerminalEvent) throw new Error('Scheduled worker did not report a terminal event.');
    completedTerminalEvent = {
      ...reportedTerminalEvent,
      durationMilliseconds: invocationMonotonicNow() - invocationStartedAt
    };
  } catch {
    const failedTerminalEvent = terminalEvent as WorkerTerminalEvent | null;
    const counts = failedTerminalEvent?.counts ?? observedCounts;
    terminalEvent = {
      event: 'scheduled-daily-summary-worker-failed',
      classification: 'unexpected',
      counts,
      durationMilliseconds: invocationMonotonicNow() - invocationStartedAt
    };
    return finalize(terminalEvent, { exitCode: 1, counts });
  }

  return finalize(completedTerminalEvent, result);
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
