CREATE TABLE `technical_log_records` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`event_code` text NOT NULL,
	`severity` text NOT NULL,
	`subsystem` text NOT NULL,
	`outcome` text NOT NULL,
	`failure_classification` text,
	`correlation_id` text,
	`duration_milliseconds` integer,
	`metadata` text DEFAULT '{}' NOT NULL,
	CONSTRAINT `technical_log_records_severity_check` CHECK (`severity` IN ('info', 'warning', 'error'))
);
--> statement-breakpoint
CREATE INDEX `technical_log_records_occurred_at_idx` ON `technical_log_records` (`occurred_at`);
