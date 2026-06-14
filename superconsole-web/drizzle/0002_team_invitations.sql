CREATE TABLE `org_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `org_invitations_org_idx` ON `org_invitations` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `org_invitations_org_email_unq` ON `org_invitations` (`org_id`,`email`);--> statement-breakpoint
CREATE TABLE `project_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `project_invitations_project_idx` ON `project_invitations` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_invitations_project_email_unq` ON `project_invitations` (`project_id`,`email`);
