CREATE TABLE `google_maps_cap_alerts` (
	`cap_type` text NOT NULL CHECK (`cap_type` IN ('daily', 'monthly')),
	`period_start_utc` text NOT NULL,
	`delivery_status` text NOT NULL CHECK (`delivery_status` IN ('pending', 'delivered', 'failed')),
	`claimed_at` text NOT NULL,
	`completed_at` text,
	`failure_code` text,
	PRIMARY KEY(`cap_type`, `period_start_utc`)
);
