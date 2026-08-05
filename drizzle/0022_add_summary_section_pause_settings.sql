ALTER TABLE `summary_configurations` ADD `weather_section_paused` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `summary_configurations` ADD `commute_section_paused` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `summary_configurations` ADD `calendar_section_paused` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `summary_configurations` ADD `todo_section_paused` integer DEFAULT false NOT NULL;
