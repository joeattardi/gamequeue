CREATE TABLE `entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`status` text DEFAULT 'unplayed' NOT NULL,
	`rating` integer,
	`notes` text DEFAULT '' NOT NULL,
	`ttb_override_minutes` integer,
	`added_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_user_game_idx` ON `entries` (`user_id`,`game_id`);--> statement-breakpoint
CREATE INDEX `entries_user_status_idx` ON `entries` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `entry_platforms` (
	`entry_id` integer NOT NULL,
	`platform_id` integer NOT NULL,
	PRIMARY KEY(`entry_id`, `platform_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `entry_tags` (
	`entry_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`entry_id`, `tag_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entry_tags_tag_idx` ON `entry_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `game_genres` (
	`game_id` integer NOT NULL,
	`genre_id` integer NOT NULL,
	PRIMARY KEY(`game_id`, `genre_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `game_genres_genre_idx` ON `game_genres` (`genre_id`);--> statement-breakpoint
CREATE TABLE `game_platforms` (
	`game_id` integer NOT NULL,
	`platform_id` integer NOT NULL,
	PRIMARY KEY(`game_id`, `platform_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `game_themes` (
	`game_id` integer NOT NULL,
	`theme_id` integer NOT NULL,
	PRIMARY KEY(`game_id`, `theme_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`summary` text,
	`release_date` text,
	`cover_image_id` text,
	`igdb_rating` integer,
	`igdb_rating_count` integer,
	`game_type` text,
	`ttb_hastily_s` integer,
	`ttb_normally_s` integer,
	`ttb_completely_s` integer,
	`ttb_count` integer,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `genres` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platforms` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`abbreviation` text
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_name_idx` ON `tags` (`user_id`,lower("name"));--> statement-breakpoint
CREATE TABLE `themes` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
