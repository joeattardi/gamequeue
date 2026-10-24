CREATE TABLE `tier_items` (
	`tier_list_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`tier_id` integer,
	`position` integer NOT NULL,
	PRIMARY KEY(`tier_list_id`, `game_id`),
	FOREIGN KEY (`tier_list_id`) REFERENCES `tier_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tier_id`) REFERENCES `tiers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tier_items_game_idx` ON `tier_items` (`game_id`);--> statement-breakpoint
CREATE INDEX `tier_items_tier_idx` ON `tier_items` (`tier_id`);--> statement-breakpoint
CREATE TABLE `tier_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tier_lists_user_idx` ON `tier_lists` (`user_id`);--> statement-breakpoint
CREATE TABLE `tiers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tier_list_id` integer NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'gray' NOT NULL,
	FOREIGN KEY (`tier_list_id`) REFERENCES `tier_lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tiers_list_idx` ON `tiers` (`tier_list_id`);