CREATE TABLE `delivery_records` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `attempt_type` text NOT NULL,
  `requested_at` text NOT NULL,
  `completed_at` text,
  `delivery_status` text NOT NULL,
  `provider_name` text NOT NULL,
  `provider_message_id` text,
  `provider_status_metadata` text,
  `error_classification` text,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `delivery_records_user_requested_at_idx` ON `delivery_records` (`user_id`,`requested_at`);
