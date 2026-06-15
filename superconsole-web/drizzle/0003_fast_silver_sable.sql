CREATE TABLE `account_connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`service` text NOT NULL,
	`credentials_encrypted` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`connected_by` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `account_connectors_user_idx` ON `account_connectors` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_connectors_user_service_unq` ON `account_connectors` (`user_id`,`service`);