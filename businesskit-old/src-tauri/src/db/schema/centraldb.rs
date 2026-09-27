CREATE TABLE `categories` (
	`id` text,
	`name` text,
	`slug` text UNIQUE,
	`description` text,
	`created_at` integer DEFAULT strftime('%s', 'now'),
	`order_index` integer DEFAULT 0,
	CONSTRAINT `categories_pk` PRIMARY KEY(`id`, `name`, `slug`, `description`, `created_at`, `order_index`)
);
CREATE TABLE `profiles` (
	`id` text,
	`user_id` text,
	`slug` text UNIQUE,
	`title` text,
	`bio` text,
	`navigation_menu` text DEFAULT '[]',
	`created_at` integer DEFAULT strftime('%s', 'now'),
	`updated_at` integer DEFAULT strftime('%s', 'now'),
	`enabled_categories` text DEFAULT '["all", "links", "about"]',
	`home_visibility` text DEFAULT '{}',
	`category_visibility` text DEFAULT '{}',
	`avatar_url` text,
	`custom_domains` text DEFAULT '[]',
	`primary_domain` text,
	`home_page` text DEFAULT 'home',
	`about` text,
	`profile_theme` text DEFAULT '{}',
	`collect_emails` text DEFAULT '{}',
	`social_links` text DEFAULT '[]',
	`about_visibility` text DEFAULT '{}',
	`landing_visibility` text DEFAULT '{}',
	`cover_images` text DEFAULT '[]',
	`info_visibility` text DEFAULT '{}',
	`logo_url` text,
	`site_title` text,
	`tagline` text,
	`site_icon` text,
	`timezone` text,
	`working_hours` text DEFAULT '{}',
	`location` text DEFAULT '{}',
	`support_email` text,
	`chat_widget_tab` text DEFAULT '[]',
	`voice_agent_personality` text,
	`page_visibility` text DEFAULT '{}',
	`collect_emails_enabled` integer DEFAULT 1,
	`from_email` text,
	`type` text,
	`niche` text,
	`minimum_age` integer DEFAULT 0,
	`resume` text,
	`avatar_agent_enabled` integer DEFAULT 0,
	`avatar_agent_show_circle` integer DEFAULT 0,
	`avatar_agent_personality` text,
	`is_primary` integer DEFAULT 0,
	`support_video_url` text,
	`welcome_video_url` text,
	`form_id` text,
	`footer_menu` text DEFAULT '[]',
	`chat_agent_enabled` integer DEFAULT 0,
	`chat_agent_model` text DEFAULT 'google/gemini-3.1-flash-lite-preview',
	`chat_agent_greeting` text,
	`chat_agent_personality` text,
	`chat_agent_accent_color` text DEFAULT '#6366f1',
	`voice_agent_enabled` integer DEFAULT 0,
	`voice_agent_show_circle` integer DEFAULT 1,
	`is_hiring` integer DEFAULT 0,
	`organization_id` text,
	CONSTRAINT `profiles_pk` PRIMARY KEY(`id`, `user_id`, `slug`, `title`, `bio`, `navigation_menu`, `created_at`, `updated_at`, `enabled_categories`, `home_visibility`, `category_visibility`, `avatar_url`, `custom_domains`, `primary_domain`, `home_page`, `about`, `profile_theme`, `collect_emails`, `social_links`, `about_visibility`, `landing_visibility`, `cover_images`, `info_visibility`, `logo_url`, `site_title`, `tagline`, `site_icon`, `timezone`, `working_hours`, `location`, `support_email`, `chat_widget_tab`, `voice_agent_personality`, `page_visibility`, `collect_emails_enabled`, `from_email`, `type`, `niche`, `minimum_age`, `resume`, `avatar_agent_enabled`, `avatar_agent_show_circle`, `avatar_agent_personality`, `is_primary`, `support_video_url`, `welcome_video_url`, `form_id`, `footer_menu`, `chat_agent_enabled`, `chat_agent_model`, `chat_agent_greeting`, `chat_agent_personality`, `chat_agent_accent_color`, `voice_agent_enabled`, `voice_agent_show_circle`, `is_hiring`, `organization_id`),
	CONSTRAINT `fk_profiles_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`)
);
CREATE TABLE `team_members` (
	`id` text,
	`org_id` text,
	`team_id` text,
	`user_id` text,
	`role` text,
	`app_access` text DEFAULT '[]',
	`invited_by` text,
	`invited_at` integer DEFAULT strftime('%s', 'now'),
	`joined_at` integer,
	`status` text DEFAULT 'pending',
	`created_at` integer DEFAULT strftime('%s', 'now'),
	`updated_at` integer DEFAULT strftime('%s', 'now'),
	CONSTRAINT `team_members_pk` PRIMARY KEY(`id`, `team_id`, `user_id`, `role`, `invited_by`, `invited_at`, `joined_at`, `status`, `created_at`, `updated_at`),
	CONSTRAINT "team_members_check_1" CHECK(role IN ('admin', 'editor', 'viewer')),
	CONSTRAINT "team_members_check_2" CHECK(status IN ('pending', 'accepted', 'declined'))
);
CREATE TABLE `team_invites` (
	`id` text,
	`org_id` text,
	`team_id` text,
	`email` text,
	`role` text,
	`app_access` text DEFAULT '[]',
	`invited_by` text,
	`token` text UNIQUE,
	`expires_at` integer,
	`status` text DEFAULT 'pending',
	`created_at` integer DEFAULT strftime('%s', 'now'),
	`updated_at` integer DEFAULT strftime('%s', 'now'),
	CONSTRAINT `team_invites_pk` PRIMARY KEY(`id`, `team_id`, `email`, `role`, `invited_by`, `token`, `expires_at`, `status`, `created_at`, `updated_at`),
	CONSTRAINT "team_invites_check_3" CHECK(role IN ('admin', 'editor', 'viewer')),
	CONSTRAINT "team_invites_check_4" CHECK(status IN ('pending', 'accepted', 'declined', 'expired'))
);
CREATE TABLE `commissions` (
	`id` text,
	`affiliate_id` text,
	`referred_user_id` text,
	`source_type` text,
	`source_id` text,
	`amount` real,
	`commission_amount` real,
	`status` text DEFAULT 'pending',
	`description` text,
	`created_at` integer DEFAULT strftime('%s', 'now'),
	`updated_at` integer DEFAULT strftime('%s', 'now'),
	`payout_status` text DEFAULT "unpaid",
	`payout_processed_at` integer,
	CONSTRAINT `commissions_pk` PRIMARY KEY(`id`, `affiliate_id`, `referred_user_id`, `source_type`, `source_id`, `amount`, `commission_amount`, `status`, `description`, `created_at`, `updated_at`, `payout_status`, `payout_processed_at`)
);
CREATE TABLE `payouts` (
	`id` text,
	`affiliate_id` text,
	`amount` real,
	`status` text DEFAULT 'pending',
	`stripe_payout_id` text,
	`payout_method` text DEFAULT 'stripe',
	`description` text,
	`processed_at` integer,
	`created_at` integer DEFAULT strftime('%s', 'now'),
	`updated_at` integer DEFAULT strftime('%s', 'now'),
	CONSTRAINT `payouts_pk` PRIMARY KEY(`id`, `affiliate_id`, `amount`, `status`, `stripe_payout_id`, `payout_method`, `description`, `processed_at`, `created_at`, `updated_at`)
);
CREATE TABLE `commission_payouts` (
	`id` text,
	`commission_id` text,
	`payout_id` text,
	`amount` real,
	`created_at` integer DEFAULT strftime('%s', 'now'),
	CONSTRAINT `commission_payouts_pk` PRIMARY KEY(`id`, `commission_id`, `payout_id`, `amount`, `created_at`)
);
CREATE TABLE `referrals` (
	`id` text,
	`referrer_id` text,
	`referred_user_id` text UNIQUE,
	`referral_code` text,
	`status` text DEFAULT 'pending',
	`created_at` integer DEFAULT strftime('%s', 'now'),
	`updated_at` integer DEFAULT strftime('%s', 'now'),
	CONSTRAINT `referrals_pk` PRIMARY KEY(`id`, `referrer_id`, `referred_user_id`, `referral_code`, `status`, `created_at`, `updated_at`)
);

CREATE TABLE `analytics` (
	`id` text,
	`profile_id` text,
	`total_clicks` integer DEFAULT 0,
	`total_views` integer DEFAULT 0,
	`device_clicks` text,
	`os_clicks` text,
	`browser_clicks` text,
	`country_clicks` text,
	`city_clicks` text,
	`referrer_clicks` text,
	`analytics_lifetime` text,
	`created_at` integer,
	`updated_at` integer,
	`analytics_24h` text,
	`analytics_7d` text,
	`analytics_30d` text,
	`analytics_12m` text,
	CONSTRAINT `analytics_pk` PRIMARY KEY(`id`, `profile_id`, `total_clicks`, `total_views`, `device_clicks`, `os_clicks`, `browser_clicks`, `country_clicks`, `city_clicks`, `referrer_clicks`, `analytics_lifetime`, `created_at`, `updated_at`, `analytics_24h`, `analytics_7d`, `analytics_30d`, `analytics_12m`),
	CONSTRAINT `fk_analytics_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`)
);
CREATE TABLE `sessions` (
	`id` text,
	`user_id` text,
	`session_token` text UNIQUE,
	`expires_at` text,
	`created_at` text,
	`ip_address` text,
	`user_agent` text,
	CONSTRAINT `sessions_pk` PRIMARY KEY(`id`, `user_id`, `session_token`, `expires_at`, `created_at`, `ip_address`, `user_agent`)
);

CREATE TABLE `subscribers` (
	`id` text,
	`profile_id` text,
	`email` text,
	`name` text,
	`referrer_domain` text,
	`timezone` text,
	`browser_name` text,
	`os_name` text,
	`device_type` text,
	`ip_address` text,
	`country` text,
	`city` text,
	`signup_timestamp` integer DEFAULT strftime('%s','now'),
	`is_blocked` integer DEFAULT 0,
	`is_unsubscribed` integer DEFAULT 0,
	`topics` text DEFAULT '[]',
	CONSTRAINT `subscribers_pk` PRIMARY KEY(`id`, `profile_id`, `email`, `name`, `referrer_domain`, `timezone`, `browser_name`, `os_name`, `device_type`, `ip_address`, `country`, `city`, `signup_timestamp`, `is_blocked`, `is_unsubscribed`, `topics`)
);
CREATE TABLE `plans` (
	`id` text,
	`name` text,
	`display_name` text,
	`price_cents` integer,
	`stripe_price_id` text,
	`features` text,
	`created_at` integer DEFAULT strftime('%s','now'),
	`paddle_product_id` text,
	`paddle_price_id_monthly` text,
	`paddle_price_id_yearly` text,
	CONSTRAINT `plans_pk` PRIMARY KEY(`id`, `name`, `display_name`, `price_cents`, `stripe_price_id`, `features`, `created_at`, `paddle_product_id`, `paddle_price_id_monthly`, `paddle_price_id_yearly`)
);
CREATE TABLE `subscriptions` (
	`id` text,
	`user_id` text,
	`plan_id` text,
	`stripe_subscription_id` text,
	`stripe_user_id` text,
	`status` text DEFAULT 'active',
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT 0,
	`created_at` integer DEFAULT strftime('%s','now'),
	`updated_at` integer DEFAULT strftime('%s','now'),
	`profile_id` text,
	`provider` text DEFAULT 'stripe',
	`external_customer_id` text,
	`external_subscription_id` text,
	`paddle_customer_id` text,
	`paddle_subscription_id` text,
	`paddle_transaction_id` text,
	CONSTRAINT `subscriptions_pk` PRIMARY KEY(`id`, `user_id`, `plan_id`, `stripe_subscription_id`, `stripe_user_id`, `status`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `created_at`, `updated_at`, `profile_id`, `provider`, `external_customer_id`, `external_subscription_id`, `paddle_customer_id`, `paddle_subscription_id`, `paddle_transaction_id`),
	CONSTRAINT `fk_subscriptions_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`),
	CONSTRAINT `fk_subscriptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
CREATE TABLE `affiliate_profiles` (
	`id` text,
	`user_id` text,
	`profile_id` text,
	`referral_code` text UNIQUE,
	`is_active` integer DEFAULT 1,
	`commission_rate` real DEFAULT 25.00,
	`total_earnings` real DEFAULT 0.00,
	`total_paid` real DEFAULT 0.00,
	`pending_earnings` real DEFAULT 0.00,
	`stripe_account_id` text,
	`payout_method` text DEFAULT 'stripe',
	`created_at` integer DEFAULT 'strftime(''%s'', ''now'')',
	`updated_at` integer DEFAULT 'strftime(''%s'', ''now'')',
	`paypal_email` text,
	`referrals_visits` integer DEFAULT 0,
	CONSTRAINT `affiliate_profiles_pk` PRIMARY KEY(`id`, `user_id`, `profile_id`, `referral_code`, `is_active`, `commission_rate`, `total_earnings`, `total_paid`, `pending_earnings`, `stripe_account_id`, `payout_method`, `created_at`, `updated_at`, `paypal_email`, `referrals_visits`)
);
CREATE TABLE `userdb` (
	`id` text,
	`profile_id` text,
	`turso_database_url` text,
	`turso_auth_token` text,
	`created_at` integer DEFAULT strftime('%s','now'),
	`updated_at` integer DEFAULT strftime('%s','now'),
	`last_provisioned_at` integer,
	`schema_version` text,
	CONSTRAINT `userdb_pk` PRIMARY KEY(`id`, `profile_id`, `turso_database_url`, `turso_auth_token`, `created_at`, `updated_at`, `last_provisioned_at`, `schema_version`)
);
CREATE TABLE `userauth` (
	`id` text,
	`profile_id` text,
	`workos_client_id` text,
	`workos_api_key` text,
	`workos_redirect_uri` text,
	`created_at` integer DEFAULT strftime('%s','now'),
	`updated_at` integer DEFAULT strftime('%s','now'),
	CONSTRAINT `userauth_pk` PRIMARY KEY(`id`, `profile_id`, `workos_client_id`, `workos_api_key`, `workos_redirect_uri`, `created_at`, `updated_at`)
);
CREATE TABLE `users` (
	`id` text,
	`workos_id` text UNIQUE,
	`email` text UNIQUE,
	`first_name` text,
	`last_name` text,
	`username` text UNIQUE,
	`bio` text,
	`location` text,
	`website` text,
	`social_links` text DEFAULT '[]',
	`profile_picture_url` text,
	`created_at` integer DEFAULT strftime('%s','now'),
	`updated_at` integer DEFAULT strftime('%s','now'),
	`last_login` integer,
	`is_active` integer DEFAULT 1,
	CONSTRAINT `users_pk` PRIMARY KEY(`id`, `workos_id`, `email`, `first_name`, `last_name`, `username`, `bio`, `location`, `website`, `social_links`, `profile_picture_url`, `created_at`, `updated_at`, `last_login`, `is_active`)
);
CREATE TABLE `payout_accounts` (
	`id` text,
	`user_id` text,
	`label` text,
	`method` text,
	`email` text,
	`stripe_account_id` text,
	`account_holder` text,
	`bank_name` text,
	`bank_country` text,
	`currency` text,
	`iban` text,
	`swift_bic` text,
	`routing_number` text,
	`account_number` text,
	`sort_code` text,
	`ifsc_code` text,
	`is_default` integer DEFAULT 1,
	`is_verified` integer DEFAULT 0,
	`created_at` integer DEFAULT strftime('%s','now'),
	`updated_at` integer DEFAULT strftime('%s','now'),
	CONSTRAINT `payout_accounts_pk` PRIMARY KEY(`id`, `user_id`, `label`, `method`, `email`, `stripe_account_id`, `account_holder`, `bank_name`, `bank_country`, `currency`, `iban`, `swift_bic`, `routing_number`, `account_number`, `sort_code`, `ifsc_code`, `is_default`, `is_verified`, `created_at`, `updated_at`)
);
CREATE TABLE `custom_domains` (
	`id` text,
	`profile_id` text UNIQUE,
	`domain` text,
	`is_verified` integer DEFAULT 0,
	`verified_at` integer,
	`ssl_status` text DEFAULT 'pending',
	`cf_hostname_id` text,
	`cf_dns_record_id` text,
	`created_at` integer DEFAULT strftime('%s','now'),
	`updated_at` integer DEFAULT strftime('%s','now'),
	CONSTRAINT `custom_domains_pk` PRIMARY KEY(`id`, `profile_id`, `domain`, `is_verified`, `verified_at`, `ssl_status`, `cf_hostname_id`, `cf_dns_record_id`, `created_at`, `updated_at`)
);
CREATE TABLE `settings` (
	`id` text,
	`profile_id` text,
	`site_title` text,
	`site_description` text,
	`logo_url` text,
	`favicon` text,
	`og_title` text,
	`og_description` text,
	`og_image` text,
	`canonical_url` text,
	`robots` text DEFAULT 'index,follow',
	`google_tag_manager_id` text,
	`google_site_verification` text,
	`location` text,
	`industry` text,
	`theme` text DEFAULT '{}',
	`crm_auto_approve` integer DEFAULT 0,
	`pipeline_stages` text DEFAULT '["new","contacted","proposal","negotiation","won","lost"]',
	`invoice_sequence` integer DEFAULT 0,
	`proposal_sequence` integer DEFAULT 0,
	`created_at` integer DEFAULT strftime('%s','now'),
	`updated_at` integer DEFAULT strftime('%s','now'),
	`ga_tracking_id` text,
	CONSTRAINT `settings_pk` PRIMARY KEY(`id`, `profile_id`, `site_title`, `site_description`, `logo_url`, `favicon`, `og_title`, `og_description`, `og_image`, `canonical_url`, `robots`, `google_tag_manager_id`, `google_site_verification`, `location`, `industry`, `theme`, `crm_auto_approve`, `pipeline_stages`, `invoice_sequence`, `proposal_sequence`, `created_at`, `updated_at`, `ga_tracking_id`)
);
CREATE TABLE `job_analytics` (
	`job_id` text,
	`profile_id` text,
	`total_visits` integer DEFAULT 0,
	`total_applications` integer DEFAULT 0,
	`device_breakdown` text DEFAULT '{}',
	`os_breakdown` text DEFAULT '{}',
	`browser_breakdown` text DEFAULT '{}',
	`country_breakdown` text DEFAULT '{}',
	`city_breakdown` text DEFAULT '{}',
	`referrer_breakdown` text DEFAULT '{}',
	`utm_source_breakdown` text DEFAULT '{}',
	`utm_medium_breakdown` text DEFAULT '{}',
	`utm_campaign_breakdown` text DEFAULT '{}',
	`applications_7d` text DEFAULT '[]',
	`applications_30d` text DEFAULT '[]',
	`applications_12m` text DEFAULT '[]',
	`applications_lifetime` text DEFAULT '{}',
	`updated_at` text DEFAULT strftime('%Y-%m-%dT%H:%M:%SZ','now'),
	`total_views` integer DEFAULT 0,
	CONSTRAINT `job_analytics_pk` PRIMARY KEY(`job_id`, `profile_id`, `total_visits`, `total_applications`, `device_breakdown`, `os_breakdown`, `browser_breakdown`, `country_breakdown`, `city_breakdown`, `referrer_breakdown`, `utm_source_breakdown`, `utm_medium_breakdown`, `utm_campaign_breakdown`, `applications_7d`, `applications_30d`, `applications_12m`, `applications_lifetime`, `updated_at`, `total_views`)
);
CREATE TABLE `organizations` (
	`id` text,
	`name` text,
	`slug` text UNIQUE,
	`owner_user_id` text,
	`plan` text DEFAULT 'starter',
	`subscription_status` text DEFAULT 'active',
	`subscription_expires_at` integer,
	`cf_account_id` text,
	`cf_api_token` text,
	`created_at` integer DEFAULT unixepoch(),
	`updated_at` integer DEFAULT unixepoch(),
	CONSTRAINT `organizations_pk` PRIMARY KEY(`id`, `name`, `slug`, `owner_user_id`, `plan`, `subscription_status`, `subscription_expires_at`, `cf_account_id`, `cf_api_token`, `created_at`, `updated_at`)
);
CREATE TABLE `deployments` (
	`id` text,
	`organization_id` text,
	`deployment_id` text,
	`profile_id` text,
	`deploy_mode` text DEFAULT 'isolated',
	`custom_domain` text,
	`cf_deployment_url` text,
	`cf_worker_name` text,
	`current_version` text,
	`latest_version` text,
	`status` text DEFAULT 'pending',
	`deployed_at` integer,
	`created_at` integer DEFAULT strftime('%s','now'),
	`updated_at` integer DEFAULT strftime('%s','now'),
	`encryption_secret` text,
	CONSTRAINT `deployments_pk` PRIMARY KEY(`id`, `organization_id`, `deployment_id`, `profile_id`, `deploy_mode`, `custom_domain`, `cf_deployment_url`, `cf_worker_name`, `current_version`, `latest_version`, `status`, `deployed_at`, `created_at`, `updated_at`, `encryption_secret`),
	CONSTRAINT `fk_deployments_deployment_id_deployments_id_fk` FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`),
	CONSTRAINT `fk_deployments_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`)
);
CREATE INDEX `idx_commissions_payout_status` ON `commissions` (`payout_status`);
CREATE INDEX `idx_commissions_affiliate_id` ON `commissions` (`affiliate_id`);
CREATE INDEX `idx_subscribers_active` ON `subscribers` (`is_blocked`,`is_unsubscribed`);
CREATE INDEX `idx_subscribers_email` ON `subscribers` (`email`);
CREATE INDEX `idx_subscriptions_profile_id` ON `subscriptions` (`profile_id`);
CREATE INDEX `idx_products_community_id` ON `products` (`community_id`);
CREATE INDEX `idx_products_cta_clicks` ON `products` (`cta_clicks`);
CREATE INDEX `idx_products_visitors` ON `products` (`unique_visitors`);
CREATE INDEX `idx_products_total_clicks` ON `products` (`total_clicks`);
CREATE INDEX `idx_products_category` ON `products` (`category_id`);
CREATE INDEX `idx_products_type` ON `products` (`type`);
CREATE INDEX `idx_products_user` ON `products` (`user_id`);
CREATE INDEX `idx_products_profile` ON `products` (`profile_id`);
CREATE INDEX `idx_purchases_user_id` ON `purchases` (`user_id`);
CREATE INDEX `idx_purchases_community_member_id` ON `purchases` (`community_member_id`);
CREATE INDEX `idx_purchases_email` ON `purchases` (`email`);
CREATE INDEX `idx_purchases_product` ON `purchases` (`product_id`);
CREATE INDEX `idx_purchases_profile` ON `purchases` (`profile_id`);
CREATE INDEX `idx_affiliate_profiles_referral_code` ON `affiliate_profiles` (`referral_code`);
CREATE INDEX `idx_affiliate_profiles_user_id` ON `affiliate_profiles` (`user_id`);
CREATE INDEX `idx_gateways_profile_provider` ON `gateways` (`profile_id`,`provider`);
CREATE INDEX `idx_gateways_profile_id` ON `gateways` (`profile_id`);
CREATE INDEX `idx_integrations_profile_provider` ON `integrations` (`profile_id`,`provider`);
CREATE INDEX `idx_integrations_profile_id` ON `integrations` (`profile_id`);
CREATE INDEX `idx_link_analytics_link_id` ON `link_analytics` (`link_id`);
CREATE INDEX `idx_link_analytics_profile_id` ON `link_analytics` (`profile_id`);
CREATE INDEX `idx_product_analytics_product_id` ON `product_analytics` (`product_id`);
CREATE INDEX `idx_product_analytics_profile_id` ON `product_analytics` (`profile_id`);
CREATE INDEX `idx_collections_profile_category` ON `collections` (`profile_id`,`category_slug`);
CREATE INDEX `idx_collections_profile_id` ON `collections` (`profile_id`);
CREATE INDEX `userdb_profile_id_unique` ON `userdb` (`profile_id`);
CREATE INDEX `userauth_profile_id_unique` ON `userauth` (`profile_id`);
CREATE INDEX `idx_communities_active` ON `communities` (`profile_id`,`is_active`,`published`);
CREATE INDEX `idx_communities_slug` ON `communities` (`slug`);
CREATE INDEX `idx_communities_profile` ON `communities` (`profile_id`,`created_at`);
CREATE INDEX `idx_community_members_tier` ON `community_members` (`community_id`,`tier`);
CREATE INDEX `idx_community_members_active` ON `community_members` (`community_id`,`last_active_at`);
CREATE INDEX `idx_community_members_token` ON `community_members` (`access_token`);
CREATE INDEX `idx_community_members_points` ON `community_members` (`community_id`,`points`);
CREATE INDEX `idx_community_members_role` ON `community_members` (`community_id`,`role`);
CREATE INDEX `idx_community_members_status` ON `community_members` (`community_id`,`status`);
CREATE INDEX `idx_community_members_user_id` ON `community_members` (`user_id`);
CREATE INDEX `idx_community_members_community` ON `community_members` (`community_id`,`joined_at`);
CREATE INDEX `idx_payout_accounts_user` ON `payout_accounts` (`user_id`);
CREATE INDEX `idx_custom_domains_domain` ON `custom_domains` (`domain`);
CREATE INDEX `idx_custom_domains_profile` ON `custom_domains` (`profile_id`);
CREATE INDEX `idx_settings_profile` ON `settings` (`profile_id`);
CREATE INDEX `idx_job_analytics_profile_id` ON `job_analytics` (`profile_id`);
CREATE INDEX `idx_job_analytics_job_id` ON `job_analytics` (`job_id`);
CREATE INDEX `idx_deployments_profile_id` ON `deployments` (`profile_id`);