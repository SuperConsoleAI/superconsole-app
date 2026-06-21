ALTER TABLE `projects` ADD `default_run_mode` text DEFAULT 'cli' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `default_cli` text DEFAULT 'claude' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `default_provider` text DEFAULT 'anthropic' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `default_model` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `script_setup` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `script_run` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `script_teardown` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `script_auto_run` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `repo_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `description` text DEFAULT '' NOT NULL;
