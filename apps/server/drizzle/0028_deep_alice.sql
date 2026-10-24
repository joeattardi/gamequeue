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
INSERT INTO `entry_notes` (`entry_id`, `body`, `public`, `created_at`, `updated_at`)
SELECT `id`, `notes`, 0, `updated_at`, `updated_at` FROM `entries` WHERE trim(`notes`) <> '';--> statement-breakpoint
ALTER TABLE `entries` DROP COLUMN `notes`;