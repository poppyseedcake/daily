CREATE TABLE `saved_weather_cities` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  `label` text NOT NULL,
  `latitude` real NOT NULL,
  `longitude` real NOT NULL,
  `position` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_weather_cities_user_position_idx` ON `saved_weather_cities` (`user_id`,`position`);
--> statement-breakpoint
CREATE TABLE `saved_commute_addresses` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  `label` text NOT NULL,
  `latitude` real NOT NULL,
  `longitude` real NOT NULL,
  `position` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_commute_addresses_user_position_idx` ON `saved_commute_addresses` (`user_id`,`position`);
--> statement-breakpoint
INSERT INTO `saved_commute_addresses` (`id`, `user_id`, `label`, `latitude`, `longitude`, `position`)
SELECT `id`, `user_id`, `label`, `latitude`, `longitude`, `position`
FROM `saved_locations`
WHERE EXISTS (
  SELECT 1
  FROM `commute_routes`
  WHERE `commute_routes`.`user_id` = `saved_locations`.`user_id`
    AND (
      (`commute_routes`.`origin_latitude` = `saved_locations`.`latitude`
        AND `commute_routes`.`origin_longitude` = `saved_locations`.`longitude`)
      OR (`commute_routes`.`destination_latitude` = `saved_locations`.`latitude`
        AND `commute_routes`.`destination_longitude` = `saved_locations`.`longitude`)
    )
);
--> statement-breakpoint
INSERT INTO `saved_weather_cities` (`id`, `user_id`, `label`, `latitude`, `longitude`, `position`)
SELECT `id`, `user_id`, `label`, `latitude`, `longitude`, `position`
FROM `saved_locations`
WHERE NOT EXISTS (
  SELECT 1
  FROM `commute_routes`
  WHERE `commute_routes`.`user_id` = `saved_locations`.`user_id`
    AND (
      (`commute_routes`.`origin_latitude` = `saved_locations`.`latitude`
        AND `commute_routes`.`origin_longitude` = `saved_locations`.`longitude`)
      OR (`commute_routes`.`destination_latitude` = `saved_locations`.`latitude`
        AND `commute_routes`.`destination_longitude` = `saved_locations`.`longitude`)
    )
);
--> statement-breakpoint
DROP TABLE `saved_locations`;
