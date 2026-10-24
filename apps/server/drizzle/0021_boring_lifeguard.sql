CREATE TABLE `dismissed_games` (
	`user_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`dismissed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `game_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
