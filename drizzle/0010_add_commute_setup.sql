CREATE TABLE `commute_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	`name` text NOT NULL,
	`origin_label` text NOT NULL,
	`origin_latitude` real NOT NULL,
	`origin_longitude` real NOT NULL,
	`destination_label` text NOT NULL,
	`destination_latitude` real NOT NULL,
	`destination_longitude` real NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commute_routes_user_position_idx` ON `commute_routes` (`user_id`,`position`);
--> statement-breakpoint
CREATE TABLE `commute_days` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	`day` text NOT NULL,
	PRIMARY KEY(`user_id`, `day`)
);
