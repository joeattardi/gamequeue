CREATE TABLE `error_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`status` integer,
	`route` text,
	`stack` text,
	`context` text
);
--> statement-breakpoint
CREATE INDEX `error_events_at_idx` ON `error_events` (`at`);--> statement-breakpoint
CREATE INDEX `error_events_kind_idx` ON `error_events` (`kind`);