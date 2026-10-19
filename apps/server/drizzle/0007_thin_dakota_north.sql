CREATE TABLE `smart_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`rules` text NOT NULL,
	`sort` text DEFAULT 'title' NOT NULL,
	`dir` text DEFAULT 'asc' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `smart_lists_user_idx` ON `smart_lists` (`user_id`);