PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text,
	`note` text,
	`updated_at` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_time_entries`("id", "user_id", "start_at", "end_at", "note", "updated_at", "deleted") SELECT "id", "user_id", "start_at", "end_at", "note", "updated_at", "deleted" FROM `time_entries`;--> statement-breakpoint
DROP TABLE `time_entries`;--> statement-breakpoint
ALTER TABLE `__new_time_entries` RENAME TO `time_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;