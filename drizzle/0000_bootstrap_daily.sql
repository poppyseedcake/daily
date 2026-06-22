CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `google_subject` text NOT NULL,
  `email` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX `users_google_subject_idx` ON `users` (`google_subject`);
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);

CREATE TABLE `summary_configurations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `summary_time` text DEFAULT '07:00' NOT NULL,
  `user_time_zone` text DEFAULT 'UTC' NOT NULL,
  `summary_theme` text DEFAULT 'light' NOT NULL,
  `summary_delivery_enabled` integer DEFAULT true NOT NULL,
  `weather_section_enabled` integer DEFAULT true NOT NULL,
  `commute_section_enabled` integer DEFAULT true NOT NULL,
  `calendar_section_enabled` integer DEFAULT true NOT NULL,
  `todo_section_enabled` integer DEFAULT true NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `summary_configurations_user_id_unique` ON `summary_configurations` (`user_id`);

CREATE TABLE `todo_categories` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `position` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `todo_tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `category_id` text,
  `title` text NOT NULL,
  `urgency` text DEFAULT 'medium' NOT NULL,
  `position` integer NOT NULL,
  `completed` integer DEFAULT false NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`category_id`) REFERENCES `todo_categories` (`id`) ON UPDATE no action ON DELETE cascade
);
