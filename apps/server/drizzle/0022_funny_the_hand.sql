CREATE TABLE `grid_cells` (
	`grid_id` integer NOT NULL,
	`position` integer NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`game_id` integer,
	PRIMARY KEY(`grid_id`, `position`),
	FOREIGN KEY (`grid_id`) REFERENCES `grids`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `grid_cells_game_idx` ON `grid_cells` (`game_id`);--> statement-breakpoint
CREATE TABLE `grids` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`cols` integer NOT NULL,
	`rows` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `grids_user_idx` ON `grids` (`user_id`);