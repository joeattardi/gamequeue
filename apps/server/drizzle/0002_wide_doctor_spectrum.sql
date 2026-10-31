PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_list_items` (
	`list_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`position` integer NOT NULL,
	`platform_id` integer,
	`note` text DEFAULT '' NOT NULL,
	`added_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`list_id`, `game_id`),
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
DROP TABLE `list_items`;--> statement-breakpoint
ALTER TABLE `__new_list_items` RENAME TO `list_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `list_items_game_idx` ON `list_items` (`game_id`);