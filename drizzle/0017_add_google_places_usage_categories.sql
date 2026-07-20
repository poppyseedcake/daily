PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_google_maps_usage` (
	`period_kind` text NOT NULL,
	`period_start_utc` text NOT NULL,
	`category` text NOT NULL,
	`request_count` integer NOT NULL,
	PRIMARY KEY(`period_kind`, `period_start_utc`, `category`),
	CONSTRAINT `google_maps_usage_period_kind_check` CHECK(`period_kind` IN ('day', 'month')),
	CONSTRAINT `google_maps_usage_category_check` CHECK(`category` IN ('map-point-selection', 'places-autocomplete', 'places-details', 'commute-estimate')),
	CONSTRAINT `google_maps_usage_request_count_check` CHECK(`request_count` >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_google_maps_usage`("period_kind", "period_start_utc", "category", "request_count") SELECT "period_kind", "period_start_utc", "category", "request_count" FROM `google_maps_usage`;
--> statement-breakpoint
DROP TABLE `google_maps_usage`;
--> statement-breakpoint
ALTER TABLE `__new_google_maps_usage` RENAME TO `google_maps_usage`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
