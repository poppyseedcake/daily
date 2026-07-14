import { executeScheduledDailySummaryWorkerCommand } from './scheduledDailySummaryWorkerCommand';

const result = await executeScheduledDailySummaryWorkerCommand();

process.exitCode = result.exitCode;
