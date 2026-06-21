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
CREATE UNIQUE INDEX `agent_catalog_name_unq` ON `agent_catalog` (`name`);
