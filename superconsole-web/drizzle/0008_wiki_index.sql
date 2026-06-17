CREATE TABLE `wiki_index` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text,
	`summary` text,
	`tags` text,
	`content` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wiki_index_project_idx` ON `wiki_index` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wiki_index_unq` ON `wiki_index` (`project_id`,`slug`);
