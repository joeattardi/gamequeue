CREATE TABLE `list_items` (
	`list_id` integer NOT NULL,
	`entry_id` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`list_id`, `entry_id`),
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `list_items_entry_idx` ON `list_items` (`entry_id`);--> statement-breakpoint
CREATE TABLE `lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lists_user_idx` ON `lists` (`user_id`);--> statement-breakpoint
ALTER TABLE `slots` ADD `entry_id` integer REFERENCES entries(id) ON DELETE set null;--> statement-breakpoint
CREATE UNIQUE INDEX `slots_user_entry_idx` ON `slots` (`user_id`,`entry_id`) WHERE "slots"."entry_id" IS NOT NULL;