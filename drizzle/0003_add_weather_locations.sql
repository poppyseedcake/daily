CREATE TABLE `weather_locations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `label` text NOT NULL,
  `latitude` real NOT NULL,
  `longitude` real NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `weather_locations_user_id_unique` ON `weather_locations` (`user_id`);
