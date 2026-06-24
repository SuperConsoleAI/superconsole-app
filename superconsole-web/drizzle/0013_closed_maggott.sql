CREATE TABLE `account_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`tokens_prompt_lifetime` integer DEFAULT 0 NOT NULL,
	`tokens_prompt_cached_lifetime` integer DEFAULT 0 NOT NULL,
	`tokens_completion_lifetime` integer DEFAULT 0 NOT NULL,
	`tokens_reasoning_lifetime` integer DEFAULT 0 NOT NULL,
	`cost_lifetime_usd` real DEFAULT 0 NOT NULL,
	`sessions_lifetime` integer DEFAULT 0 NOT NULL,
	`cache_hits_lifetime` integer DEFAULT 0 NOT NULL,
	`analytics_lifetime` text DEFAULT '{}' NOT NULL,
	`usage_24h` text DEFAULT '[]' NOT NULL,
	`usage_7d` text DEFAULT '[]' NOT NULL,
	`usage_30d` text DEFAULT '[]' NOT NULL,
	`usage_12m` text DEFAULT '[]' NOT NULL,
	`by_model` text DEFAULT '{}' NOT NULL,
	`by_provider` text DEFAULT '{}' NOT NULL,
	`by_cli` text DEFAULT '{}' NOT NULL,
	`by_member` text DEFAULT '{}' NOT NULL,
	`by_project` text DEFAULT '{}' NOT NULL,
	`by_org` text DEFAULT '{}' NOT NULL,
	`heatmap_365d` text DEFAULT '{}' NOT NULL,
	`last_synced_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category` text,
	`image_url` text,
	`skills` text,
	`connectors` text,
	`tags` text,
	`repo` text NOT NULL,
	`git_ref` text DEFAULT 'main' NOT NULL,
	`base_path` text NOT NULL,
	`files` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_catalog_name_unq` ON `agent_catalog` (`name`);--> statement-breakpoint
CREATE TABLE `commands_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slash` text NOT NULL,
	`description` text NOT NULL,
	`author` text NOT NULL,
	`category` text NOT NULL,
	`github_url` text NOT NULL,
	`content` text,
	`icon_url` text,
	`install_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `connector_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`auth_type` text NOT NULL,
	`oauth_url` text,
	`api_key_fields` text DEFAULT '[]' NOT NULL,
	`docs_url` text,
	`icon_url` text,
	`scope` text DEFAULT 'project' NOT NULL,
	`install_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hooks_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`author` text NOT NULL,
	`hook_type` text NOT NULL,
	`github_url` text NOT NULL,
	`content` text,
	`icon_url` text,
	`install_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `installed_plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`installed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`installed_by` text NOT NULL,
	`version` text NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mcp_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`author` text NOT NULL,
	`category` text NOT NULL,
	`github_url` text NOT NULL,
	`install_command` text NOT NULL,
	`install_args` text DEFAULT '[]' NOT NULL,
	`required_env_vars` text DEFAULT '[]' NOT NULL,
	`icon_url` text,
	`docs_url` text,
	`install_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
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
CREATE UNIQUE INDEX `org_memory_index_unq` ON `org_memory_index` (`org_id`,`slug`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `org_skill_index_unq` ON `org_skill_index` (`org_id`,`skill_name`);--> statement-breakpoint
CREATE TABLE `org_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`tokens_prompt_lifetime` integer DEFAULT 0 NOT NULL,
	`tokens_prompt_cached_lifetime` integer DEFAULT 0 NOT NULL,
	`tokens_completion_lifetime` integer DEFAULT 0 NOT NULL,
	`tokens_reasoning_lifetime` integer DEFAULT 0 NOT NULL,
	`cost_lifetime_usd` real DEFAULT 0 NOT NULL,
	`sessions_lifetime` integer DEFAULT 0 NOT NULL,
	`cache_hits_lifetime` integer DEFAULT 0 NOT NULL,
	`analytics_lifetime` text DEFAULT '{}' NOT NULL,
	`usage_24h` text DEFAULT '[]' NOT NULL,
	`usage_7d` text DEFAULT '[]' NOT NULL,
	`usage_30d` text DEFAULT '[]' NOT NULL,
	`usage_12m` text DEFAULT '[]' NOT NULL,
	`by_model` text DEFAULT '{}' NOT NULL,
	`by_provider` text DEFAULT '{}' NOT NULL,
	`by_cli` text DEFAULT '{}' NOT NULL,
	`by_member` text DEFAULT '{}' NOT NULL,
	`by_project` text DEFAULT '{}' NOT NULL,
	`by_org` text DEFAULT '{}' NOT NULL,
	`heatmap_365d` text DEFAULT '{}' NOT NULL,
	`last_synced_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`author` text NOT NULL,
	`version` text DEFAULT '1.0.0' NOT NULL,
	`icon_url` text,
	`docs_url` text,
	`github_url` text,
	`category` text NOT NULL,
	`scope` text DEFAULT 'project' NOT NULL,
	`skill_ids` text DEFAULT '[]' NOT NULL,
	`agent_ids` text DEFAULT '[]' NOT NULL,
	`mcp_ids` text DEFAULT '[]' NOT NULL,
	`mcp_url` text DEFAULT '[]' NOT NULL,
	`command_ids` text DEFAULT '[]' NOT NULL,
	`hook_ids` text DEFAULT '[]' NOT NULL,
	`connector_ids` text DEFAULT '[]' NOT NULL,
	`skills_url` text DEFAULT '[]' NOT NULL,
	`commands_url` text DEFAULT '[]' NOT NULL,
	`hooks_url` text DEFAULT '[]' NOT NULL,
	`connector_auth` text DEFAULT '[]' NOT NULL,
	`install_count` integer DEFAULT 0 NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
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
CREATE UNIQUE INDEX `project_skill_index_unq` ON `project_skill_index` (`project_id`,`skill_name`);--> statement-breakpoint
CREATE TABLE `project_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`tokens_prompt_lifetime` integer DEFAULT 0 NOT NULL,
	`tokens_prompt_cached_lifetime` integer DEFAULT 0 NOT NULL,
	`tokens_completion_lifetime` integer DEFAULT 0 NOT NULL,
	`tokens_reasoning_lifetime` integer DEFAULT 0 NOT NULL,
	`cost_lifetime_usd` real DEFAULT 0 NOT NULL,
	`sessions_lifetime` integer DEFAULT 0 NOT NULL,
	`cache_hits_lifetime` integer DEFAULT 0 NOT NULL,
	`analytics_lifetime` text DEFAULT '{}' NOT NULL,
	`usage_24h` text DEFAULT '[]' NOT NULL,
	`usage_7d` text DEFAULT '[]' NOT NULL,
	`usage_30d` text DEFAULT '[]' NOT NULL,
	`usage_12m` text DEFAULT '[]' NOT NULL,
	`by_model` text DEFAULT '{}' NOT NULL,
	`by_provider` text DEFAULT '{}' NOT NULL,
	`by_cli` text DEFAULT '{}' NOT NULL,
	`by_member` text DEFAULT '{}' NOT NULL,
	`by_project` text DEFAULT '{}' NOT NULL,
	`by_org` text DEFAULT '{}' NOT NULL,
	`heatmap_365d` text DEFAULT '{}' NOT NULL,
	`last_synced_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
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
CREATE UNIQUE INDEX `wiki_index_unq` ON `wiki_index` (`project_id`,`slug`);--> statement-breakpoint
ALTER TABLE `organizations` ADD `logo_url` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `logo_url` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `default_run_mode` text DEFAULT 'cli' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `default_cli` text DEFAULT 'claude' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `default_provider` text DEFAULT 'anthropic' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `default_model` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `script_setup` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `script_run` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `script_teardown` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `script_auto_run` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `repo_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `logo_url` text;