DROP TABLE `wishlist_items`;--> statement-breakpoint
DROP TABLE `wishlists`;--> statement-breakpoint
CREATE UNIQUE INDEX `lists_one_wishlist_idx` ON `lists` (`user_id`) WHERE "lists"."kind" = 'wishlist';