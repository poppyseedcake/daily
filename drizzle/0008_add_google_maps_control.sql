CREATE TABLE `google_maps_control` (
	`control_key` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	CONSTRAINT "google_maps_control_key_check" CHECK (`control_key` = 'admin-kill-switch'),
	CONSTRAINT "google_maps_control_enabled_check" CHECK (`enabled` IN (0, 1))
);
