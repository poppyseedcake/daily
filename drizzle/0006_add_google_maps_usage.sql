CREATE TABLE `google_maps_usage` (
	`period_kind` text NOT NULL,
	`period_start_utc` text NOT NULL,
	`category` text NOT NULL,
	`request_count` integer NOT NULL CHECK (`request_count` >= 0),
	PRIMARY KEY(`period_kind`, `period_start_utc`, `category`)
);
