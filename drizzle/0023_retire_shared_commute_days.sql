CREATE TABLE `commute_setups` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
-- Preserve explicit setup, including Users who have deleted their last route.
-- Historical migrations still use commute_days to populate each route's days.
INSERT INTO `commute_setups` (`user_id`)
SELECT `user_id` FROM `commute_days`
UNION
SELECT `user_id` FROM `commute_routes`;
