CREATE TABLE `org_skill_index` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`skill_name` text NOT NULL,
	`tags` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `org_skill_index_org_idx` ON `org_skill_index` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `org_skill_index_unq` ON `org_skill_index` (`org_id`,`skill_name`);
