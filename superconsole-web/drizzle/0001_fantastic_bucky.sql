CREATE TABLE `account_llm_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`api_key_encrypted` text,
	`base_url` text,
	`model` text,
	`extra_env` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_llm_keys_user_idx` ON `account_llm_keys` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_llm_keys_user_provider_unq` ON `account_llm_keys` (`user_id`,`provider`);--> statement-breakpoint
CREATE TABLE `org_llm_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`provider` text NOT NULL,
	`api_key_encrypted` text,
	`base_url` text,
	`model` text,
	`extra_env` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `org_llm_keys_org_idx` ON `org_llm_keys` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `org_llm_keys_org_provider_unq` ON `org_llm_keys` (`org_id`,`provider`);