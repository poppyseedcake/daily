ALTER TABLE `delivery_records` ADD `scheduled_at` text;
--> statement-breakpoint
ALTER TABLE `delivery_records` ADD `attempt_count` integer;
--> statement-breakpoint
ALTER TABLE `delivery_records` ADD `last_attempt_at` text;
--> statement-breakpoint
ALTER TABLE `delivery_records` ADD `next_retry_at` text;
--> statement-breakpoint
ALTER TABLE `delivery_records` ADD `claim_expires_at` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_records_scheduled_occurrence_idx` ON `delivery_records` (`user_id`,`scheduled_at`) WHERE `attempt_type` = 'scheduled';
