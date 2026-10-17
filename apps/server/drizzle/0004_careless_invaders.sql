ALTER TABLE `lists` ADD `kind` text DEFAULT 'list' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `lists_one_queue_idx` ON `lists` (`user_id`) WHERE "lists"."kind" = 'queue';