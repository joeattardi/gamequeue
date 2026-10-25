CREATE TABLE `mail_daily` (
	`day` text PRIMARY KEY NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
-- Hand-patched: SQLite can't add a NOT NULL column without a default. Pending links (valid 1 h)
-- predate the address binding, so they are dropped; '' never matches an account's email.
DELETE FROM `password_resets`;--> statement-breakpoint
ALTER TABLE `password_resets` ADD `email` text DEFAULT '' NOT NULL;