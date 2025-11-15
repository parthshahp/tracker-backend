ALTER TABLE `tags` RENAME TO `tag`;--> statement-breakpoint
ALTER TABLE `time_entries` RENAME TO `time_entry`;--> statement-breakpoint
ALTER TABLE `users` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tag` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_tag`("id", "user_id", "name", "color", "updated_at", "created_at") SELECT "id", "user_id", "name", "color", "updated_at", "created_at" FROM `tag`;--> statement-breakpoint
DROP TABLE `tag`;--> statement-breakpoint
ALTER TABLE `__new_tag` RENAME TO `tag`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_time_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text,
	`note` text,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_time_entry`("id", "user_id", "start_at", "end_at", "note", "updated_at", "created_at", "deleted") SELECT "id", "user_id", "start_at", "end_at", "note", "updated_at", "created_at", "deleted" FROM `time_entry`;--> statement-breakpoint
DROP TABLE `time_entry`;--> statement-breakpoint
ALTER TABLE `__new_time_entry` RENAME TO `time_entry`;--> statement-breakpoint
DROP INDEX `users_email_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `__new_time_entry_tags` (
	`time_entry_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`time_entry_id`, `tag_id`),
	FOREIGN KEY (`time_entry_id`) REFERENCES `time_entry`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_time_entry_tags`("time_entry_id", "tag_id") SELECT "time_entry_id", "tag_id" FROM `time_entry_tags`;--> statement-breakpoint
DROP TABLE `time_entry_tags`;--> statement-breakpoint
ALTER TABLE `__new_time_entry_tags` RENAME TO `time_entry_tags`;