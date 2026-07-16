ALTER TABLE `users` ADD `lifecycle_state` text DEFAULT 'active' NOT NULL CHECK (`lifecycle_state` IN ('active', 'deleting'));
