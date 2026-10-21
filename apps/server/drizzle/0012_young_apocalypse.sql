CREATE TABLE `game_series` (
	`game_id` integer NOT NULL,
	`series_id` integer NOT NULL,
	PRIMARY KEY(`game_id`, `series_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_series_series` ON `game_series` (`series_id`);--> statement-breakpoint
CREATE TABLE `series` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`members_fetched_at` integer
);
--> statement-breakpoint
CREATE TABLE `series_members` (
	`series_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`name` text NOT NULL,
	`cover_image_id` text,
	`release_date` text,
	`release_precision` text,
	PRIMARY KEY(`series_id`, `game_id`),
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `games` ADD `series_checked_at` integer;