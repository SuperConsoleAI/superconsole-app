-- Connector catalog (browsable directory of all connectors)
CREATE TABLE IF NOT EXISTS `connector_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`auth_type` text NOT NULL,
	`oauth_url` text,
	`api_key_fields` text NOT NULL DEFAULT '[]',
	`docs_url` text,
	`icon_url` text,
	`scope` text NOT NULL DEFAULT 'project',
	`install_count` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint

-- MCP catalog (community MCP servers)
CREATE TABLE IF NOT EXISTS `mcp_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`author` text NOT NULL,
	`category` text NOT NULL,
	`github_url` text NOT NULL,
	`install_command` text NOT NULL,
	`install_args` text NOT NULL DEFAULT '[]',
	`required_env_vars` text NOT NULL DEFAULT '[]',
	`icon_url` text,
	`docs_url` text,
	`install_count` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint

-- Commands catalog (community slash commands)
CREATE TABLE IF NOT EXISTS `commands_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slash` text NOT NULL,
	`description` text NOT NULL,
	`author` text NOT NULL,
	`category` text NOT NULL,
	`github_url` text NOT NULL,
	`content` text,
	`icon_url` text,
	`install_count` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint

-- Hooks catalog (community lifecycle hooks)
CREATE TABLE IF NOT EXISTS `hooks_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`author` text NOT NULL,
	`hook_type` text NOT NULL,
	`github_url` text NOT NULL,
	`content` text,
	`icon_url` text,
	`install_count` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint

-- Plugins table (bundles referencing all other catalogs)
CREATE TABLE IF NOT EXISTS `plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`author` text NOT NULL,
	`version` text NOT NULL DEFAULT '1.0.0',
	`icon_url` text,
	`docs_url` text,
	`github_url` text,
	`category` text NOT NULL,
	`scope` text NOT NULL DEFAULT 'project',
	`skill_ids` text NOT NULL DEFAULT '[]',
	`agent_ids` text NOT NULL DEFAULT '[]',
	`mcp_ids` text NOT NULL DEFAULT '[]',
	`command_ids` text NOT NULL DEFAULT '[]',
	`hook_ids` text NOT NULL DEFAULT '[]',
	`connector_ids` text NOT NULL DEFAULT '[]',
	`skills_url` text,
	`commands_url` text,
	`hooks_url` text,
	`connector_auth` text NOT NULL DEFAULT '[]',
	`install_count` integer NOT NULL DEFAULT 0,
	`featured` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint

-- Installed plugins per workspace/org/account
CREATE TABLE IF NOT EXISTS `installed_plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL REFERENCES plugins(`id`),
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`installed_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`installed_by` text NOT NULL,
	`version` text NOT NULL
);
