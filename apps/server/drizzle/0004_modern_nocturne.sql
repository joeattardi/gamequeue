CREATE TABLE `playthrough_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`playthrough_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`kind` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`minutes` integer,
	`spoiler` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`playthrough_id`) REFERENCES `playthroughs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playthrough_posts_playthrough_idx` ON `playthrough_posts` (`playthrough_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `post_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `playthrough_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_images_post_idx` ON `post_images` (`post_id`);--> statement-breakpoint
CREATE INDEX `post_images_file_idx` ON `post_images` (`file_name`);--> statement-breakpoint
ALTER TABLE `playthroughs` ADD `final_thoughts` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `playthroughs` ADD `visibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `playthroughs` ADD `share_slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `playthroughs_share_slug_idx` ON `playthroughs` (`share_slug`);