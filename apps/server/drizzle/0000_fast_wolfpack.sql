CREATE TABLE `activity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`game_id` integer,
	`subject_id` integer,
	`subject_name` text,
	`detail` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_user_at_idx` ON `activity_events` (`user_id`,`at`);--> statement-breakpoint
CREATE TABLE `avatars` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`data` blob NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dismissed_games` (
	`user_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`dismissed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `game_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_verifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`email` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_verifications_token_hash_unique` ON `email_verifications` (`token_hash`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`status` text DEFAULT 'unplayed' NOT NULL,
	`rating` integer,
	`favorite` integer DEFAULT false NOT NULL,
	`added_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_user_game_idx` ON `entries` (`user_id`,`game_id`);--> statement-breakpoint
CREATE INDEX `entries_user_status_idx` ON `entries` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `entry_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer NOT NULL,
	`body` text NOT NULL,
	`public` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entry_notes_entry_idx` ON `entry_notes` (`entry_id`);--> statement-breakpoint
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
CREATE TABLE `error_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`status` integer,
	`route` text,
	`stack` text,
	`context` text
);
--> statement-breakpoint
CREATE INDEX `error_events_at_idx` ON `error_events` (`at`);--> statement-breakpoint
CREATE INDEX `error_events_kind_idx` ON `error_events` (`kind`);--> statement-breakpoint
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
CREATE TABLE `game_series` (
	`game_id` integer NOT NULL,
	`series_id` integer NOT NULL,
	PRIMARY KEY(`game_id`, `series_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_series_series` ON `game_series` (`series_id`);--> statement-breakpoint
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
	`release_precision` text,
	`release_checked_at` integer,
	`series_checked_at` integer,
	`cover_image_id` text,
	`screenshots` text,
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
CREATE TABLE `igdb_daily` (
	`day` text PRIMARY KEY NOT NULL,
	`ok` integer DEFAULT 0 NOT NULL,
	`rate_limited` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
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
	`description` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'list' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lists_user_idx` ON `lists` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lists_one_queue_idx` ON `lists` (`user_id`) WHERE "lists"."kind" = 'queue';--> statement-breakpoint
CREATE TABLE `mail_daily` (
	`day` text PRIMARY KEY NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`email` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_token_hash_unique` ON `password_resets` (`token_hash`);--> statement-breakpoint
CREATE TABLE `platforms` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`abbreviation` text
);
--> statement-breakpoint
CREATE TABLE `playthroughs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`entry_id` integer NOT NULL,
	`platform_id` integer,
	`started_on` text,
	`ended_on` text,
	`outcome` text,
	`rating` integer,
	`playtime_minutes` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `playthroughs_entry_idx` ON `playthroughs` (`entry_id`);--> statement-breakpoint
CREATE INDEX `playthroughs_user_ended_idx` ON `playthroughs` (`user_id`,`ended_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `playthroughs_one_open_idx` ON `playthroughs` (`entry_id`) WHERE "playthroughs"."outcome" IS NULL;--> statement-breakpoint
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
CREATE TABLE `server_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`version` text NOT NULL,
	`last_seen_at` integer NOT NULL,
	`ended_at` integer,
	`ended` text
);
--> statement-breakpoint
CREATE INDEX `server_runs_started_idx` ON `server_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`entry_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slots_user_position_idx` ON `slots` (`user_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `slots_user_entry_idx` ON `slots` (`user_id`,`entry_id`) WHERE "slots"."entry_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `smart_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`rules` text NOT NULL,
	`sort` text DEFAULT 'title' NOT NULL,
	`dir` text DEFAULT 'asc' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `smart_lists_user_idx` ON `smart_lists` (`user_id`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'gamer' NOT NULL,
	`first_name` text,
	`last_name` text,
	`show_real_name` integer DEFAULT false NOT NULL,
	`bio` text,
	`avatar_icon` text,
	`avatar_color` integer,
	`steam_id` text,
	`xbox_gamertag` text,
	`psn_id` text,
	`discord_name` text,
	`search_indexable` integer DEFAULT false NOT NULL,
	`show_activity` integer DEFAULT true NOT NULL,
	`email_verified_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `wishlist_items` (
	`wishlist_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`position` integer NOT NULL,
	`platform_id` integer,
	`note` text DEFAULT '' NOT NULL,
	`added_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`wishlist_id`, `game_id`),
	FOREIGN KEY (`wishlist_id`) REFERENCES `wishlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `wishlist_items_game_idx` ON `wishlist_items` (`game_id`);--> statement-breakpoint
CREATE TABLE `wishlists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wishlists_user_idx` ON `wishlists` (`user_id`);