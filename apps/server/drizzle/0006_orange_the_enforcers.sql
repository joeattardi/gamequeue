CREATE TABLE `ai_chats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`entry_id` integer NOT NULL,
	`title` text NOT NULL,
	`messages` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`used_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_chats_user_used_idx` ON `ai_chats` (`user_id`,`used_at`);--> statement-breakpoint
CREATE INDEX `ai_chats_entry_idx` ON `ai_chats` (`entry_id`);