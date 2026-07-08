CREATE TABLE `calendar_connections` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `connection_status` text NOT NULL,
  `provider_account_id` text,
  `granted_scopes` text DEFAULT '[]' NOT NULL,
  `access_token_available` integer DEFAULT false NOT NULL,
  `refresh_token_available` integer DEFAULT false NOT NULL,
  `access_token_expires_at` integer,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_connections_user_id_unique` ON `calendar_connections` (`user_id`);
--> statement-breakpoint
CREATE TABLE `selected_calendars` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `calendar_id` text NOT NULL,
  `position` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `selected_calendars_user_calendar_idx` ON `selected_calendars` (`user_id`,`calendar_id`);
