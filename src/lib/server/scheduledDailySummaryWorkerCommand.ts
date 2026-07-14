import {
  emptyScheduledDailySummaryWorkerCounts,
  runScheduledDailySummaryWorker,
  type ScheduledDailySummaryWorkerDependencies,
  type ScheduledDailySummaryWorkerEvent
} from './scheduledDailySummaryWorker';

type WorkerDependencies = Pick<
  ScheduledDailySummaryWorkerDependencies,
  'occurrenceStore' | 'delivery'
>;

type ScheduledDailySummaryWorkerCommandOptions = {
  loadDependencies?: () => Promise<WorkerDependencies>;
  emit?: (event: ScheduledDailySummaryWorkerEvent) => void;
  workerOptions?: Pick<
    ScheduledDailySummaryWorkerDependencies,
    'batchSize' | 'now' | 'monotonicNow'
  >;
};

const loadProductionDependencies = async () => {
  const { createProductionScheduledDailySummaryWorkerDependencies } = await import(
    './scheduledDailySummaryWorkerProduction'
  );

  return createProductionScheduledDailySummaryWorkerDependencies();
};

export const executeScheduledDailySummaryWorkerCommand = async ({
  loadDependencies = loadProductionDependencies,
  emit = (event) => console.log(JSON.stringify(event)),
  workerOptions
}: ScheduledDailySummaryWorkerCommandOptions = {}) => {
  let dependencies: WorkerDependencies;

  try {
    dependencies = await loadDependencies();
  } catch {
    const counts = emptyScheduledDailySummaryWorkerCounts();
    emit({
      event: 'scheduled-daily-summary-worker-failed',
      classification: 'worker-initialization-failed',
      counts,
      durationMilliseconds: 0
    });
    return { exitCode: 1 as const, counts };
  }

  return runScheduledDailySummaryWorker({ ...dependencies, ...workerOptions, emit });
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
