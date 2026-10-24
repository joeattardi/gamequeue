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
ALTER TABLE `users` ADD `show_activity` integer DEFAULT true NOT NULL;--> statement-breakpoint
-- Backfill from what was already recorded. Day-only dates become noon UTC so the day reads right in most timezones.
INSERT INTO `activity_events` (`user_id`, `type`, `at`, `game_id`) SELECT `user_id`, 'added', `added_at`, `game_id` FROM `entries`;--> statement-breakpoint
INSERT INTO `activity_events` (`user_id`, `type`, `at`, `game_id`) SELECT p.`user_id`, 'started', CAST(strftime('%s', p.`started_on`) AS integer) * 1000 + 43200000, e.`game_id` FROM `playthroughs` p JOIN `entries` e ON e.`id` = p.`entry_id` WHERE p.`started_on` IS NOT NULL
  -- Adding a game as Paused creates an open playthrough dated that day; that is "added", not "started"
  AND NOT (p.`outcome` IS NULL AND e.`status` = 'paused'
    AND abs(julianday(p.`started_on`) - julianday(e.`added_at` / 1000, 'unixepoch')) <= 1
    AND (SELECT count(*) FROM `playthroughs` q WHERE q.`entry_id` = e.`id`) = 1);--> statement-breakpoint
INSERT INTO `activity_events` (`user_id`, `type`, `at`, `game_id`) SELECT p.`user_id`, p.`outcome`, CAST(strftime('%s', p.`ended_on`) AS integer) * 1000 + 43200000, e.`game_id` FROM `playthroughs` p JOIN `entries` e ON e.`id` = p.`entry_id` WHERE p.`outcome` IS NOT NULL AND p.`ended_on` IS NOT NULL;--> statement-breakpoint
INSERT INTO `activity_events` (`user_id`, `type`, `at`, `game_id`) SELECT w.`user_id`, 'wishlisted', i.`added_at`, i.`game_id` FROM `wishlist_items` i JOIN `wishlists` w ON w.`id` = i.`wishlist_id`;--> statement-breakpoint
INSERT INTO `activity_events` (`user_id`, `type`, `at`, `subject_id`, `subject_name`) SELECT `user_id`, 'grid', `created_at`, `id`, `title` FROM `grids`;--> statement-breakpoint
INSERT INTO `activity_events` (`user_id`, `type`, `at`, `subject_id`, `subject_name`) SELECT `user_id`, 'tier', `created_at`, `id`, `title` FROM `tier_lists`;--> statement-breakpoint
INSERT INTO `activity_events` (`user_id`, `type`, `at`, `subject_id`, `subject_name`) SELECT `user_id`, 'list', `created_at`, `id`, `name` FROM `lists` WHERE `kind` = 'list';--> statement-breakpoint
INSERT INTO `activity_events` (`user_id`, `type`, `at`, `subject_id`, `subject_name`) SELECT `user_id`, 'smartlist', `created_at`, `id`, `name` FROM `smart_lists`;
