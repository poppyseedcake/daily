CREATE TABLE `__new_google_maps_person_usage` (
	`period_start_utc` text NOT NULL,
	`person_usage_identity` text NOT NULL,
	`quota_group` text NOT NULL,
	`request_count` integer NOT NULL,
	PRIMARY KEY(`period_start_utc`, `person_usage_identity`, `quota_group`),
	CONSTRAINT "google_maps_person_usage_quota_group_check" CHECK("__new_google_maps_person_usage"."quota_group" IN ('routes', 'places')),
	CONSTRAINT "google_maps_person_usage_request_count_check" CHECK("__new_google_maps_person_usage"."request_count" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_google_maps_person_usage` (`period_start_utc`, `person_usage_identity`, `quota_group`, `request_count`)
SELECT `period_start_utc`, `person_usage_identity`, 'routes', `request_count` FROM `google_maps_person_usage`;
--> statement-breakpoint
DROP TABLE `google_maps_person_usage`;
--> statement-breakpoint
ALTER TABLE `__new_google_maps_person_usage` RENAME TO `google_maps_person_usage`;
