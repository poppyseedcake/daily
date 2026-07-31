CREATE TABLE `saved_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	`label` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_locations_user_position_idx` ON `saved_locations` (`user_id`,`position`);
