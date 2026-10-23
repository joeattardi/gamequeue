CREATE TABLE `game_prices` (
	`game_id` integer PRIMARY KEY NOT NULL,
	`itad_id` text,
	`currency` text,
	`amount` integer,
	`regular` integer,
	`cut` integer,
	`shop` text,
	`url` text,
	`history_low` integer,
	`country` text NOT NULL,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
