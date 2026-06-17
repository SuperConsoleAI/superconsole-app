CREATE TABLE `project_memory_index` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`category` text NOT NULL,
	`slug` text NOT NULL,
	`title` text,
	`summary` text,
	`tags` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_memory_index_project_idx` ON `project_memory_index` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_memory_index_unq` ON `project_memory_index` (`project_id`,`category`,`slug`);--> statement-breakpoint
CREATE TABLE `org_memory_index` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text,
	`body` text,
	`tags` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `org_memory_index_org_idx` ON `org_memory_index` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `org_memory_index_unq` ON `org_memory_index` (`org_id`,`slug`);
