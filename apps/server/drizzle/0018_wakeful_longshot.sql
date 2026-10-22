CREATE TABLE `igdb_daily` (
	`day` text PRIMARY KEY NOT NULL,
	`ok` integer DEFAULT 0 NOT NULL,
	`rate_limited` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL
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
CREATE INDEX `server_runs_started_idx` ON `server_runs` (`started_at`);