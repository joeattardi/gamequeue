CREATE TABLE `playthroughs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`entry_id` integer NOT NULL,
	`platform_id` integer,
	`started_on` text,
	`ended_on` text,
	`outcome` text,
	`rating` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `playthroughs_entry_idx` ON `playthroughs` (`entry_id`);--> statement-breakpoint
CREATE INDEX `playthroughs_user_ended_idx` ON `playthroughs` (`user_id`,`ended_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `playthroughs_one_open_idx` ON `playthroughs` (`entry_id`) WHERE "playthroughs"."outcome" IS NULL;