import {
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
};

const loadProductionDependencies = async () => {
  const { createProductionScheduledDailySummaryWorkerDependencies } = await import(
    './scheduledDailySummaryWorkerProduction'
  );

  return createProductionScheduledDailySummaryWorkerDependencies();
};

export const executeScheduledDailySummaryWorkerCommand = async ({
  loadDependencies = loadProductionDependencies,
  emit = (event) => console.log(JSON.stringify(event))
}: ScheduledDailySummaryWorkerCommandOptions = {}) => {
  let dependencies: WorkerDependencies;

  try {
    dependencies = await loadDependencies();
  } catch {
    const counts = {
      due: 0,
      sent: 0,
      skipped: 0,
      retrying: 0,
      failed: 0,
      isolatedError: 0
    };
    emit({
      event: 'scheduled-daily-summary-worker-failed',
      classification: 'worker-initialization-failed',
      counts,
      durationMilliseconds: 0
    });
    return { exitCode: 1 as const, counts };
  }

  return runScheduledDailySummaryWorker({ ...dependencies, emit });
};
