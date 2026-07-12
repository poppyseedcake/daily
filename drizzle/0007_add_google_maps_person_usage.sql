CREATE TABLE `google_maps_person_usage` (
	`period_start_utc` text NOT NULL,
	`person_usage_identity` text NOT NULL,
	`request_count` integer NOT NULL CHECK (`request_count` >= 0),
	PRIMARY KEY(`period_start_utc`, `person_usage_identity`)
);
