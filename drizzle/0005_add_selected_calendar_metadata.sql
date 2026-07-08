ALTER TABLE `selected_calendars` ADD `summary` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `selected_calendars` ADD `background_color` text;
--> statement-breakpoint
ALTER TABLE `selected_calendars` ADD `primary` integer DEFAULT false NOT NULL;
