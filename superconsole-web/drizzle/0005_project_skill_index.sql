CREATE TABLE `project_skill_index` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`skill_name` text NOT NULL,
	`tags` text,
	`scope` text DEFAULT 'project' NOT NULL,
	`active` text DEFAULT '1' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_skill_index_project_idx` ON `project_skill_index` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_skill_index_unq` ON `project_skill_index` (`project_id`,`skill_name`);
