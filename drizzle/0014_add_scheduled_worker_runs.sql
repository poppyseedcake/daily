CREATE TABLE `scheduled_worker_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`duration_milliseconds` integer NOT NULL,
	`outcome` text NOT NULL,
	`failure_classification` text,
	`due_count` integer NOT NULL,
	`sent_count` integer NOT NULL,
	`skipped_count` integer NOT NULL,
	`retrying_count` integer NOT NULL,
	`failed_count` integer NOT NULL,
	`isolated_error_count` integer NOT NULL,
	CONSTRAINT `scheduled_worker_runs_outcome_check` CHECK (`outcome` IN ('succeeded', 'completed-with-isolated-errors', 'failed')),
	CONSTRAINT `scheduled_worker_runs_failure_classification_check` CHECK (`failure_classification` IS NULL OR `failure_classification` IN ('due-work-query-failed', 'worker-initialization-failed', 'worker-run-persistence-failed', 'unexpected')),
	CONSTRAINT `scheduled_worker_runs_duration_check` CHECK (`duration_milliseconds` >= 0),
	CONSTRAINT `scheduled_worker_runs_due_count_check` CHECK (`due_count` >= 0),
	CONSTRAINT `scheduled_worker_runs_sent_count_check` CHECK (`sent_count` >= 0),
	CONSTRAINT `scheduled_worker_runs_skipped_count_check` CHECK (`skipped_count` >= 0),
	CONSTRAINT `scheduled_worker_runs_retrying_count_check` CHECK (`retrying_count` >= 0),
	CONSTRAINT `scheduled_worker_runs_failed_count_check` CHECK (`failed_count` >= 0),
	CONSTRAINT `scheduled_worker_runs_isolated_error_count_check` CHECK (`isolated_error_count` >= 0)
);
--> statement-breakpoint
CREATE INDEX `scheduled_worker_runs_completed_at_idx` ON `scheduled_worker_runs` (`completed_at`);
