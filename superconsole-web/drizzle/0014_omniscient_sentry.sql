CREATE TABLE `rules_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`author` text NOT NULL,
	`framework` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`github_url` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`install_count` integer DEFAULT 0 NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DROP INDEX "account_connectors_user_idx";--> statement-breakpoint
DROP INDEX "account_connectors_user_service_unq";--> statement-breakpoint
DROP INDEX "account_llm_keys_user_idx";--> statement-breakpoint
DROP INDEX "account_llm_keys_user_provider_unq";--> statement-breakpoint
DROP INDEX "agent_catalog_name_unq";--> statement-breakpoint
DROP INDEX "connectors_project_idx";--> statement-breakpoint
DROP INDEX "connectors_project_service_unq";--> statement-breakpoint
DROP INDEX "org_connectors_org_idx";--> statement-breakpoint
DROP INDEX "org_connectors_org_service_unq";--> statement-breakpoint
DROP INDEX "org_invitations_org_idx";--> statement-breakpoint
DROP INDEX "org_invitations_org_email_unq";--> statement-breakpoint
DROP INDEX "org_llm_keys_org_idx";--> statement-breakpoint
DROP INDEX "org_llm_keys_org_provider_unq";--> statement-breakpoint
DROP INDEX "org_members_user_idx";--> statement-breakpoint
DROP INDEX "org_memory_index_org_idx";--> statement-breakpoint
DROP INDEX "org_memory_index_unq";--> statement-breakpoint
DROP INDEX "org_skill_index_org_idx";--> statement-breakpoint
DROP INDEX "org_skill_index_unq";--> statement-breakpoint
DROP INDEX "project_invitations_project_idx";--> statement-breakpoint
DROP INDEX "project_invitations_project_email_unq";--> statement-breakpoint
DROP INDEX "project_llm_keys_project_idx";--> statement-breakpoint
DROP INDEX "project_llm_keys_project_provider_unq";--> statement-breakpoint
DROP INDEX "project_members_user_idx";--> statement-breakpoint
DROP INDEX "project_memory_index_project_idx";--> statement-breakpoint
DROP INDEX "project_memory_index_unq";--> statement-breakpoint
DROP INDEX "project_skill_index_project_idx";--> statement-breakpoint
DROP INDEX "project_skill_index_unq";--> statement-breakpoint
DROP INDEX "projects_org_idx";--> statement-breakpoint
DROP INDEX "users_workos_id_unq";--> statement-breakpoint
DROP INDEX "users_email_unq";--> statement-breakpoint
DROP INDEX "wiki_index_project_idx";--> statement-breakpoint
DROP INDEX "wiki_index_unq";--> statement-breakpoint
ALTER TABLE `commands_catalog` ALTER COLUMN "content" TO "content" text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE INDEX `account_connectors_user_idx` ON `account_connectors` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_connectors_user_service_unq` ON `account_connectors` (`user_id`,`service`);--> statement-breakpoint
CREATE INDEX `account_llm_keys_user_idx` ON `account_llm_keys` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_llm_keys_user_provider_unq` ON `account_llm_keys` (`user_id`,`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_catalog_name_unq` ON `agent_catalog` (`name`);--> statement-breakpoint
CREATE INDEX `connectors_project_idx` ON `connectors` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `connectors_project_service_unq` ON `connectors` (`project_id`,`service`);--> statement-breakpoint
CREATE INDEX `org_connectors_org_idx` ON `org_connectors` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `org_connectors_org_service_unq` ON `org_connectors` (`org_id`,`service`);--> statement-breakpoint
CREATE INDEX `org_invitations_org_idx` ON `org_invitations` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `org_invitations_org_email_unq` ON `org_invitations` (`org_id`,`email`);--> statement-breakpoint
CREATE INDEX `org_llm_keys_org_idx` ON `org_llm_keys` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `org_llm_keys_org_provider_unq` ON `org_llm_keys` (`org_id`,`provider`);--> statement-breakpoint
CREATE INDEX `org_members_user_idx` ON `org_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `org_memory_index_org_idx` ON `org_memory_index` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `org_memory_index_unq` ON `org_memory_index` (`org_id`,`slug`);--> statement-breakpoint
CREATE INDEX `org_skill_index_org_idx` ON `org_skill_index` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `org_skill_index_unq` ON `org_skill_index` (`org_id`,`skill_name`);--> statement-breakpoint
CREATE INDEX `project_invitations_project_idx` ON `project_invitations` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_invitations_project_email_unq` ON `project_invitations` (`project_id`,`email`);--> statement-breakpoint
CREATE INDEX `project_llm_keys_project_idx` ON `project_llm_keys` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_llm_keys_project_provider_unq` ON `project_llm_keys` (`project_id`,`provider`);--> statement-breakpoint
CREATE INDEX `project_members_user_idx` ON `project_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `project_memory_index_project_idx` ON `project_memory_index` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_memory_index_unq` ON `project_memory_index` (`project_id`,`category`,`slug`);--> statement-breakpoint
CREATE INDEX `project_skill_index_project_idx` ON `project_skill_index` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_skill_index_unq` ON `project_skill_index` (`project_id`,`skill_name`);--> statement-breakpoint
CREATE INDEX `projects_org_idx` ON `projects` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_workos_id_unq` ON `users` (`workos_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unq` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `wiki_index_project_idx` ON `wiki_index` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wiki_index_unq` ON `wiki_index` (`project_id`,`slug`);--> statement-breakpoint
ALTER TABLE `mcp_catalog` ALTER COLUMN "github_url" TO "github_url" text;--> statement-breakpoint
ALTER TABLE `mcp_catalog` ADD `type` text DEFAULT 'stdio' NOT NULL;--> statement-breakpoint
ALTER TABLE `mcp_catalog` ADD `url` text;--> statement-breakpoint
ALTER TABLE `mcp_catalog` ADD `command` text;--> statement-breakpoint
ALTER TABLE `mcp_catalog` ADD `args` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `mcp_catalog` ADD `env` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `mcp_catalog` DROP COLUMN `install_command`;--> statement-breakpoint
ALTER TABLE `mcp_catalog` DROP COLUMN `install_args`;--> statement-breakpoint
ALTER TABLE `wiki_index` ALTER COLUMN "content" TO "content" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `installed_plugins` ADD `skill_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `installed_plugins` ADD `agent_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `installed_plugins` ADD `mcp_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `installed_plugins` ADD `command_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `installed_plugins` ADD `hook_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `installed_plugins` ADD `rule_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `installed_plugins` ADD `connector_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `installed_plugins` ADD `rules_url` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `installed_plugins` ADD `agents_url` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `installed_plugins` ADD `skills_url` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `installed_plugins` ADD `commands_url` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `installed_plugins` ADD `hooks_url` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `installed_plugins` ADD `mcp_url` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `plugins` ADD `rules_url` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `plugins` ADD `rule_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `plugins` ADD `agents_url` text DEFAULT '[]' NOT NULL;