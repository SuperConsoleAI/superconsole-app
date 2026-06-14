CREATE TABLE `connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`service` text NOT NULL,
	`credentials_encrypted` text,
	`scope` text DEFAULT 'project' NOT NULL,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`connected_by` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `connectors_project_idx` ON `connectors` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `connectors_project_service_unq` ON `connectors` (`project_id`,`service`);--> statement-breakpoint
CREATE TABLE `org_connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`service` text NOT NULL,
	`credentials_encrypted` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`connected_by` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `org_connectors_org_idx` ON `org_connectors` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `org_connectors_org_service_unq` ON `org_connectors` (`org_id`,`service`);--> statement-breakpoint
CREATE TABLE `org_members` (
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`org_id`, `user_id`),
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `org_members_user_idx` ON `org_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `org_settings` (
	`org_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`org_id`, `key`),
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `project_llm_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`api_key_encrypted` text,
	`base_url` text,
	`model` text,
	`extra_env` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_llm_keys_project_idx` ON `project_llm_keys` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_llm_keys_project_provider_unq` ON `project_llm_keys` (`project_id`,`provider`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`project_id`, `user_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_members_user_idx` ON `project_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`local_path_hint` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_org_idx` ON `projects` (`org_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`workos_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_workos_id_unq` ON `users` (`workos_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unq` ON `users` (`email`);