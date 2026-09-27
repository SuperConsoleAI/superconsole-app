// src-tauri/src/db/schema/social.rs
use super::Migration;

// ─────────────────────────────────────────────────────────────────────────────
// social.ts — Social Media Schema + Provision Helpers
// Provisioned via provision.ts → provisionUserDatabase()
//
// ── Design principles ────────────────────────────────────────────────────────
//
//  1. social_posts = 1 row per post per platform
//     - If same content posted to 5 platforms → 5 rows
//     - group_id links them (cross-post group, optional)
//     - Content column is platform-specific (Twitter 280 chars, LinkedIn longer)
//     - platform_post_id is a first-class indexed column on this table
//     - Works for Zernio AND direct platform API AND n8n
//
//  2. social_post_analytics = 1 row per social_post.id (the "hot table")
//     - All engagement counters here: likes, comments, shares, impressions etc
//     - Written by: Zernio webhook, direct platform API polling, or analytics sync
//     - Indexed heavily for time-series queries
//
//  3. social_accounts = identity + connection + audience demographics ONLY
//     - NO engagement/analytics columns here
//     - Audience demographics (city/country/gender/age) live here — they describe
//       the account's audience, not its posts
//     - Platform metrics like follower_count and following_count live here
//       because they're account-level, not post-level
//
//  4. social_analytics = per-account aggregate analytics (1 row per account)
//     - Time-series JSON arrays, aggregate totals
//     - Updated by: analytics aggregator job (daily/weekly)
//     - Trigger-updated columns: total_posts (INSERT on social_posts)
//     - API-call-updated: everything else (follower trends, engagement series)
//
//  5. social_analytics_view = 1 row per profile_id (agent fast lookup)
//     - Joins social_accounts + social_analytics across all accounts for a profile
//     - Used by AI agents for cross-platform overview without N queries
//
//  6. social_posts_analytics_view = 1 row per profile_id last-30d summary
//     - Aggregates social_post_analytics for agent briefings
//
//  7. social_post_groups = lightweight table, 1 row per cross-post group
//     - id only + profile_id + created_at
//     - social_posts.group_id → FK → social_post_groups.id
//
//  8. social_competitors + social_competitor_posts = competitor monitoring
//     - Track competitor/inspiration accounts and their posts
//     - For strategy analysis and content inspiration
//
// ── Posting modes ─────────────────────────────────────────────────────────────
//
//  Mode A — Zernio platform key (env.ZERNIO_API_KEY)
//    scheduled_via = 'platform'
//    zernio_post_id set after API call
//    platform_post_id set by Zernio webhook (post.published event)
//
//  Mode B — Zernio BYOK (user's own Zernio key in connections table)
//    scheduled_via = 'byok'
//    zernio_post_id set after API call
//    platform_post_id set by Zernio webhook
//
//  Mode C — Direct platform API (user brings own developer app tokens)
//    scheduled_via = 'direct'
//    zernio_post_id = NULL
//    platform_post_id set by direct API response
//    Requires connections row: service='twitter_direct' etc
//    Schedule: cron reads social_posts WHERE status='scheduled' AND scheduled_for<=now()
//
//  Mode D — n8n webhook
//    scheduled_via = 'n8n'
//    zernio_post_id = NULL
//    Payload forwarded to n8n, callback sets platform_post_id + status
//
// ── Which columns are updated by what ────────────────────────────────────────
//
//  social_posts:
//    status, platform_post_id, platform_post_url, published_at
//      → Zernio webhook (post.published / post.failed)
//      → Direct API response
//      → n8n callback
//    retry_count, last_retry_at
//      → App-level retry logic
//    approval_status
//      → App dashboard approval flow
//
//  social_post_analytics:
//    All engagement columns (likes, comments, shares, impressions, reach, etc.)
//      → Zernio analytics webhook / analytics sync job (daily)
//      → Direct platform API polling (social_accounts.metrics_synced_at gate)
//    analytics_synced_at
//      → Written on every sync
//
//  social_analytics (per-account aggregate):
//    total_posts
//      → DB TRIGGER on social_posts INSERT (when status='published')
//    total_scheduled
//      → DB TRIGGER on social_posts INSERT (when status='scheduled')
//    Everything else (time series, totals, breakdowns)
//      → Analytics aggregator job (daily/on-demand)
//    follower_count mirrored from social_accounts
//      → API call (platform metrics sync)
//
//  social_accounts:
//    follower_count, following_count, post_count
//      → API call (platform metrics sync, scheduled or on-demand)
//    audience_* demographics
//      → API call (Zernio analytics add-on or direct platform API)
//    token_status, health_error
//      → Health check job / webhook token revocation events
//
// ─────────────────────────────────────────────────────────────────────────────

pub const SCHEMA_SQL: &[&str] = &[

    // ── social_accounts (linked profiles via Zernio or native) ──
    r#"CREATE TABLE IF NOT EXISTS social_accounts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    -- 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok'
    platform TEXT NOT NULL,
    -- 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok'
    -- | 'youtube' | 'pinterest' | 'reddit' | 'bluesky' | 'threads'
    -- | 'googlebusiness' | 'telegram' | 'snapchat'

    -- Creator's own account identity (from platform after OAuth/connection)
    platform_username TEXT,
    platform_user_id TEXT,
    platform_display_name TEXT,
    platform_avatar_url TEXT,
    platform_bio TEXT,
    platform_url TEXT,
    platform_website TEXT,
    platform_category TEXT,
    platform_verified INTEGER NOT NULL DEFAULT 0,

    -- Account-level reach metrics (synced periodically from platform / Zernio)
    -- These are ACCOUNT attributes, not post metrics.
    follower_count INTEGER NOT NULL DEFAULT 0,
    following_count INTEGER NOT NULL DEFAULT 0,
    platform_post_count INTEGER NOT NULL DEFAULT 0,
    -- ↑ total posts ever on the platform (their historical count, not ours)

    -- ── Audience Demographics ─────────────────────────────────────────────────
    -- JSON objects with percentage values (floats).
    -- Weighted average across time; updated by API call, not triggers.
    -- Used for media kit page (public-facing creator stats for brand deals).

    audience_city_breakdown TEXT,
    -- {"New York":12.5,"London":8.3,"Mumbai":5.1,...}
    -- Available: Instagram, Facebook, LinkedIn, TikTok, YouTube

    audience_country_breakdown TEXT,
    -- {"US":45.2,"UK":18.1,"IN":8.4,...}
    -- Available: all platforms with analytics APIs

    audience_gender_breakdown TEXT,
    -- {"male":48.2,"female":44.8,"other":7.0}
    -- Available: Instagram, Facebook, TikTok, YouTube, LinkedIn
    -- NOT available: Twitter/X (not provided by platform)

    audience_age_breakdown TEXT,
    -- {"13-17":2.5,"18-24":22.1,"25-34":38.4,"35-44":24.8,"45-54":8.1,"55+":4.1}
    -- Available: Instagram, Facebook, TikTok, YouTube, LinkedIn

    audience_language_breakdown TEXT,
    -- {"en":78.2,"es":11.8,"pt":5.6,"fr":2.1,...}
    -- Available: Instagram, Facebook, TikTok, YouTube

    audience_interest_breakdown TEXT,
    -- {"Technology":44.2,"Business":29.8,"Science":15.1,...}
    -- Available: Instagram, Facebook only (Meta audience insights)

    audience_device_breakdown TEXT,
    -- {"mobile":82.4,"desktop":14.1,"tablet":3.5}
    -- Available: Instagram, Facebook, TikTok, YouTube

    audience_reachability TEXT,
    -- {"mass":35,"micro":28,"nano":37}  — follower distribution of YOUR followers
    -- Useful for LinkedIn B2B positioning

    audience_synced_at INTEGER,
    -- Timestamp of last audience demographics sync (API call)
    metrics_synced_at INTEGER,
    -- Timestamp of last follower_count / platform_post_count sync (API call)

    -- Connection health
    is_connected INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    token_status TEXT NOT NULL DEFAULT 'valid',
    -- 'valid' | 'expired' | 'revoked' | 'error'
    token_expires_at INTEGER,
    last_health_check_at INTEGER,
    health_error TEXT,

    -- Secondary selection (Facebook page, LinkedIn org, Pinterest board, GMB location)
    selected_page_id TEXT,
    selected_page_name TEXT,

    -- Posting defaults
    default_timezone TEXT NOT NULL DEFAULT 'UTC',
    auto_post INTEGER NOT NULL DEFAULT 0,

    -- Platform-specific extra data (JSON)
    -- twitter:   {"tweet_mode":"extended","max_tweet_length":280}
    -- instagram: {"ig_user_id":"12345","account_type":"BUSINESS"}
    -- reddit:    {"default_subreddit":"r/webdev"}
    -- youtube:   {"channel_id":"UCxxx","upload_default_privacy":"public"}
    -- tiktok:    {"open_id":"xxx","union_id":"xxx"}
    platform_data TEXT NOT NULL DEFAULT '{}',

    -- DM opt-out compliance
    -- Keyword that triggers opt-out from DM sequences (e.g. 'STOP', 'UNSUBSCRIBE')
    dm_opt_out_keyword TEXT DEFAULT 'STOP',

    connected_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    disconnected_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_accounts_profile    ON social_accounts (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_accounts_platform   ON social_accounts (profile_id, platform)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_accounts_active     ON social_accounts (profile_id, is_active)"#,
    // ── social_account_connections (bridge table for integrations) ──
    r#"CREATE TABLE IF NOT EXISTS social_account_connections (
    social_account_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    external_profile_id TEXT,
    external_account_id TEXT,
    external_user_id TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    
    PRIMARY KEY (social_account_id, connection_id),
    FOREIGN KEY (social_account_id) REFERENCES social_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sac_account ON social_account_connections (social_account_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sac_connection ON social_account_connections (connection_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sac_int_profile ON social_account_connections (external_profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sac_int_account ON social_account_connections (external_account_id)"#,
    // ── social_post_groups (logical groupings of cross-platform posts) ──
    r#"CREATE TABLE IF NOT EXISTS social_post_groups (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    -- Optional label (e.g. "Product launch Jan 2026")
    name TEXT,
    -- The "source" content before platform-specific adaptation
    -- Useful when AI rewrites content per platform from a single brief
    source_content TEXT,
    -- Number of platforms in this group (denormalized for UI)
    platform_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_post_groups_profile ON social_post_groups (profile_id, created_at DESC)"#,
    // ── social_posts (individual posts on platforms) ──
    r#"CREATE TABLE IF NOT EXISTS social_posts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL,    -- FK → social_accounts.id
    group_id TEXT,               -- FK → social_post_groups.id (NULL = single-platform)

    -- Platform (denormalized from social_accounts for fast queries)
    platform TEXT NOT NULL,
    -- 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok'
    -- | 'youtube' | 'pinterest' | 'reddit' | 'bluesky' | 'threads'
    -- | 'googlebusiness' | 'telegram' | 'snapchat'

    -- ★ Platform post ID — first-class indexed column
    -- The actual tweet ID / IG media ID / LinkedIn share URN / YouTube video ID etc.
    -- Set by: Zernio webhook (post.published), direct API response, or n8n callback.
    -- NULL = not yet published.
    platform_post_id TEXT,
    platform_post_url TEXT,
    -- Direct URL to the live post on the platform

    -- Integration identifiers (NULL for direct/n8n modes)
    -- One external_post_id per post-per-platform (Integrations give separate IDs per platform)
    external_post_id TEXT UNIQUE,
    external_account_id TEXT,      -- mirrors social_account_connections.external_account_id (fast webhook lookup)

    -- Content
    -- Platform-specific content (can differ per row even in same group)
    -- Twitter: max 280 chars | LinkedIn: max 3000 | Instagram: max 2200 etc.
    content TEXT NOT NULL,
    media_items TEXT NOT NULL DEFAULT '[]',
    -- JSON: [{url, type:'image'|'video'|'document', thumbnail_url?, alt_text?}]
    link_url TEXT,
    link_title TEXT,
    link_description TEXT,
    link_thumbnail_url TEXT,

    -- Platform-specific publishing options (see per-platform JSON schema above)
    platform_specific_data TEXT NOT NULL DEFAULT '{}',

    -- Scheduling
    status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'scheduled' | 'queued' | 'publishing' | 'published'
    -- | 'partial' | 'failed' | 'cancelled'
    scheduled_for INTEGER,        -- Unix timestamp e.g. 178392182
    timezone TEXT NOT NULL DEFAULT 'UTC',
    publish_now INTEGER NOT NULL DEFAULT 0,
    use_queue INTEGER NOT NULL DEFAULT 0,
    queue_slot_id TEXT,          -- FK → social_queue.id (direct mode queue only)
    published_at INTEGER,        -- Unix timestamp, set when status → 'published'

    -- Agent approval loop
    approval_status TEXT NOT NULL DEFAULT 'auto_sent',
    -- 'pending' | 'approved' | 'rejected' | 'auto_sent'
    approval_requested_at INTEGER,
    approved_at INTEGER,

    -- Content origin / attribution
    source TEXT,
    -- 'manual' | 'agent' | 'blog_crosspost' | 'product_launch'
    -- | 'rss' | 'n8n' | 'automation' | 'competitor_inspired'
    source_id TEXT,              -- FK → posts.id / products.id when cross-posted

    -- AI generation
    ai_generated INTEGER NOT NULL DEFAULT 0,
    ai_prompt TEXT,
    -- Future: ML content classification label (topic, sentiment, content_type)
    -- Written by a background labeling job, NULL until processed
    ai_labeled INTEGER NOT NULL DEFAULT 0,
    ai_label TEXT,
    -- e.g. 'promotional' | 'educational' | 'engagement' | 'testimonial' | 'announcement'

    -- User labels (FK → social_labels.id, JSON array)
    labels TEXT NOT NULL DEFAULT '[]',

    -- Security / posting path tracking
    scheduled_via TEXT NOT NULL DEFAULT 'byok',
    -- 'byok'     = user's own Zernio key
    -- 'platform' = BusinessKit platform Zernio key (capped at FREE_TIER_CAP/month)
    -- 'direct'   = posted directly to platform API (Mode C)
    -- 'n8n'      = dispatched via n8n webhook (Mode D)
    platform_schedule_count INTEGER NOT NULL DEFAULT 0,
    -- Posts sent via 'platform' key this calendar month
    platform_schedule_month TEXT,
    -- 'YYYY-MM' — checked to reset counter on new month

    -- Error state
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_retry_at INTEGER,

    hidden INTEGER NOT NULL DEFAULT 0,
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate posts
    idempotency_key TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_profile          ON social_posts (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_account          ON social_posts (account_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_platform         ON social_posts (profile_id, platform)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_status           ON social_posts (profile_id, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_scheduled        ON social_posts (status, scheduled_for ASC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_queued           ON social_posts (account_id, use_queue, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_platform_post_id ON social_posts (platform_post_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_sp_platform_unique ON social_posts (platform, platform_post_id) WHERE platform_post_id IS NOT NULL"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_external_post      ON social_posts (external_post_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_external_account   ON social_posts (external_account_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_group            ON social_posts (group_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_source           ON social_posts (source_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_approval         ON social_posts (profile_id, approval_status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_platform_cap     ON social_posts (profile_id, scheduled_via, platform_schedule_month)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_published_at     ON social_posts (profile_id, published_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sp_ai_labeled       ON social_posts (profile_id, ai_labeled)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled ON social_posts (profile_id, status, scheduled_for) WHERE status = 'scheduled'"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_social_posts_idem ON social_posts (idempotency_key) WHERE idempotency_key IS NOT NULL"#,
    // ── social_post_analytics (engagement metrics per post) ──
    r#"CREATE TABLE IF NOT EXISTS social_post_analytics (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL UNIQUE,   -- FK → social_posts.id
    profile_id TEXT NOT NULL,       -- denormalized for profile-level aggregation
    account_id TEXT NOT NULL,       -- denormalized for account-level aggregation
    platform TEXT NOT NULL,         -- denormalized for platform-level queries

    -- Engagement counters
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    reposts INTEGER NOT NULL DEFAULT 0,  -- Twitter retweets / LinkedIn reshares
    impressions INTEGER NOT NULL DEFAULT 0,
    reach INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,   -- link clicks in post
    saves INTEGER NOT NULL DEFAULT 0,    -- Pinterest saves / Instagram saves
    views INTEGER NOT NULL DEFAULT 0,    -- YouTube/TikTok/Reels video views

    -- Video-specific (NULL for non-video)
    watch_time_seconds INTEGER,
    completion_rate_pct INTEGER,         -- basis points e.g. 6500 = 65.00%
    avg_view_duration_seconds INTEGER,

    -- Derived metric — computed by analytics sync job
    engagement_rate INTEGER NOT NULL DEFAULT 0,
    -- basis points: (likes + comments + shares + saves) / impressions * 10000

    -- Audience breakdown for THIS post (where did impressions come from)
    -- JSON objects, same format as social_accounts audience_* columns
    post_country_breakdown TEXT,
    post_city_breakdown TEXT,
    post_age_breakdown TEXT,
    post_gender_breakdown TEXT,
    post_device_breakdown TEXT,

    -- Raw analytics payload from last sync (cached for re-processing)
    raw_analytics TEXT,

    analytics_synced_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_spa_post_id      ON social_post_analytics (post_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_spa_profile             ON social_post_analytics (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_spa_account             ON social_post_analytics (account_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_spa_platform            ON social_post_analytics (profile_id, platform)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_spa_sync                ON social_post_analytics (profile_id, analytics_synced_at ASC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_spa_engagement          ON social_post_analytics (profile_id, engagement_rate DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_spa_impressions         ON social_post_analytics (profile_id, impressions DESC)"#,
    // ── social_analytics (aggregated daily profile performance) ──
    r#"CREATE TABLE IF NOT EXISTS social_analytics (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL UNIQUE, -- FK → social_accounts.id

    -- Mirrored from social_accounts (set by aggregator, not trigger)
    follower_count INTEGER NOT NULL DEFAULT 0,
    follower_change_7d INTEGER NOT NULL DEFAULT 0,
    follower_change_30d INTEGER NOT NULL DEFAULT 0,

    -- Post volume (trigger-updated for published/scheduled; aggregator for the rest)
    total_posts INTEGER NOT NULL DEFAULT 0,       -- TRIGGER: INSERT published
    total_scheduled INTEGER NOT NULL DEFAULT 0,   -- TRIGGER: INSERT scheduled
    total_published INTEGER NOT NULL DEFAULT 0,   -- TRIGGER: UPDATE → published
    total_failed INTEGER NOT NULL DEFAULT 0,      -- TRIGGER: UPDATE → failed

    -- Engagement aggregates (aggregator job)
    total_likes INTEGER NOT NULL DEFAULT 0,
    total_comments INTEGER NOT NULL DEFAULT 0,
    total_shares INTEGER NOT NULL DEFAULT 0,
    total_impressions INTEGER NOT NULL DEFAULT 0,
    total_reach INTEGER NOT NULL DEFAULT 0,
    total_clicks INTEGER NOT NULL DEFAULT 0,
    total_saves INTEGER NOT NULL DEFAULT 0,
    total_views INTEGER NOT NULL DEFAULT 0,
    avg_engagement_rate INTEGER NOT NULL DEFAULT 0, -- basis points

    -- Time series (aggregator job — int arrays, index 0 = oldest)
    posts_7d TEXT NOT NULL DEFAULT '[]',
    posts_30d TEXT NOT NULL DEFAULT '[]',
    posts_12m TEXT NOT NULL DEFAULT '[]',
    impressions_7d TEXT NOT NULL DEFAULT '[]',
    impressions_30d TEXT NOT NULL DEFAULT '[]',
    impressions_12m TEXT NOT NULL DEFAULT '[]',
    engagement_7d TEXT NOT NULL DEFAULT '[]',
    engagement_30d TEXT NOT NULL DEFAULT '[]',
    engagement_12m TEXT NOT NULL DEFAULT '[]',
    follower_7d TEXT NOT NULL DEFAULT '[]',
    follower_30d TEXT NOT NULL DEFAULT '[]',

    -- Breakdown analytics (aggregator job)
    top_posts TEXT NOT NULL DEFAULT '[]',
    best_time_breakdown TEXT NOT NULL DEFAULT '{}',
    content_type_breakdown TEXT NOT NULL DEFAULT '{}',
    -- {"image":42,"video":18,"text":7,"link":3}

    -- Raw Zernio analytics response cache (for re-processing without API call)
    zernio_analytics_raw TEXT,

    last_aggregated_at INTEGER,
    last_synced_at INTEGER,    -- last platform metrics sync (follower_count etc)
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_social_analytics_account ON social_analytics (account_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_analytics_profile        ON social_analytics (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_analytics_sync           ON social_analytics (last_synced_at ASC)"#,
    // ── social_media_kit (media assets for social posts) ──
    r#"CREATE TABLE IF NOT EXISTS social_media_kit (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL UNIQUE,
    total_followers INTEGER NOT NULL DEFAULT 0,
    total_reach_30d INTEGER NOT NULL DEFAULT 0,
    avg_engagement_rate INTEGER NOT NULL DEFAULT 0,
    follower_growth_30d INTEGER NOT NULL DEFAULT 0,
    platform_breakdown TEXT NOT NULL DEFAULT '{}',
    audience_country_breakdown TEXT NOT NULL DEFAULT '{}',
    audience_city_breakdown TEXT NOT NULL DEFAULT '{}',
    audience_gender_breakdown TEXT NOT NULL DEFAULT '{}',
    audience_age_breakdown TEXT NOT NULL DEFAULT '{}',
    audience_language_breakdown TEXT NOT NULL DEFAULT '{}',
    audience_interest_breakdown TEXT NOT NULL DEFAULT '{}',
    audience_device_breakdown TEXT NOT NULL DEFAULT '{}',
    top_posts TEXT NOT NULL DEFAULT '[]',
    content_type_breakdown TEXT NOT NULL DEFAULT '{}',
    best_time_breakdown TEXT NOT NULL DEFAULT '{}',
    -- Visibility settings
    is_public INTEGER NOT NULL DEFAULT 1,
    show_country INTEGER NOT NULL DEFAULT 1,
    show_city INTEGER NOT NULL DEFAULT 0,
    show_gender INTEGER NOT NULL DEFAULT 1,
    show_age INTEGER NOT NULL DEFAULT 1,
    show_platform_breakdown INTEGER NOT NULL DEFAULT 1,
    show_engagement_rate INTEGER NOT NULL DEFAULT 1,
    last_computed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_social_media_kit_profile ON social_media_kit (profile_id)"#,
    // ── social_queue (queue slots for direct publishing) ──
    r#"CREATE TABLE IF NOT EXISTS social_queue (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    zernio_slot_id TEXT UNIQUE,
    day_of_week INTEGER NOT NULL,
    -- 0=Sunday 1=Monday 2=Tuesday 3=Wednesday 4=Thursday 5=Friday 6=Saturday
    time_of_day TEXT NOT NULL,   -- HH:MM 24-hour e.g. '09:00'
    timezone TEXT NOT NULL DEFAULT 'UTC',
    is_active INTEGER NOT NULL DEFAULT 1,
    last_used_at INTEGER,
    next_scheduled_for INTEGER,   -- computed Unix timestamp of next slot occurrence
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate queue slots
    idempotency_key TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_queue_profile  ON social_queue (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_queue_account  ON social_queue (account_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_queue_next     ON social_queue (is_active, next_scheduled_for ASC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_queue_schedule ON social_queue (account_id, day_of_week, time_of_day)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_social_queue_idem ON social_queue (idempotency_key) WHERE idempotency_key IS NOT NULL"#,
    // ── social_conversations (threads for DMs, emails, etc.) ──
    r#"CREATE TABLE IF NOT EXISTS social_conversations (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    inbox_source TEXT NOT NULL DEFAULT 'integration',
    -- 'integration' | 'direct' | 'n8n' | 'manual' | 'composio' | 'official'
    platform TEXT NOT NULL,
    external_conversation_id TEXT,
    platform_conversation_id TEXT, -- native platform conversation ID
    
    -- CRM linkage
    crm_contact_id TEXT,

    -- Participant identity (the person we are talking to)
    participant_platform_id TEXT,
    participant_username TEXT,
    participant_name TEXT,
    participant_picture TEXT,
    participant_profile_url TEXT,
    participant_follower_count INTEGER,

    -- State
    status TEXT NOT NULL DEFAULT 'open',
    -- 'open' | 'archived' | 'spam' | 'snoozed'
    unread_count INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    last_message_preview TEXT,
    last_message_at INTEGER,
    last_message_id TEXT, -- FK to social_messages.id
    
    -- Assignment and labels
    assigned_to TEXT,
    assigned_at INTEGER,
    snoozed_until INTEGER,
    labels TEXT NOT NULL DEFAULT '[]',

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_conv_profile       ON social_conversations (profile_id, last_message_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_conv_unread        ON social_conversations (profile_id, unread_count)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_conv_account       ON social_conversations (account_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_conv_status        ON social_conversations (profile_id, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_conv_crm           ON social_conversations (crm_contact_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_conv_assigned      ON social_conversations (profile_id, assigned_to)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_conv_pinned        ON social_conversations (profile_id, is_pinned)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_conv_snoozed       ON social_conversations (profile_id, snoozed_until) WHERE snoozed_until IS NOT NULL"#,
    // ── social_messages (individual messages within a conversation) ──
    r#"CREATE TABLE IF NOT EXISTS social_messages (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    -- FK → social_conversations.id
    account_id TEXT NOT NULL,
    
    inbox_source TEXT NOT NULL DEFAULT 'integration',
    -- 'integration' | 'direct' | 'n8n' | 'manual' | 'composio' | 'official'
    external_message_id TEXT,
    platform_message_id TEXT,

    type TEXT NOT NULL,
    -- 'dm' | 'comment' | 'review' | 'email'
    platform TEXT NOT NULL,
    
    -- Sender identity (for group chats or distinguishing sides)
    sender_platform_id TEXT,
    sender_username TEXT,
    sender_display_name TEXT,
    sender_avatar_url TEXT,
    sender_profile_url TEXT,
    is_own INTEGER NOT NULL DEFAULT 0, -- 1 if sent by us, 0 if received
    
    in_reply_to_message_id TEXT, -- for nested replies
    
    -- Linked post context (for comments)
    post_id TEXT,                -- FK → social_posts.id (if comment on our post)
    platform_post_id TEXT,       -- platform-native post ID

    -- Content
    content TEXT,
    media_urls TEXT NOT NULL DEFAULT '[]',

    -- Review fields
    rating INTEGER,
    review_title TEXT,

    -- State
    status TEXT NOT NULL DEFAULT 'unread',
    -- 'unread' | 'read' | 'replied' | 'delivered' | 'failed'
    is_starred INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    sentiment TEXT,
    read_at INTEGER,

    -- Reply tracking
    reply_content TEXT,
    replied_at INTEGER,
    replied_by TEXT,             -- 'agent' | 'user'

    -- Agent processing state
    agent_draft TEXT,
    agent_sentiment TEXT,
    agent_suggested_action TEXT,
    agent_processed INTEGER NOT NULL DEFAULT 0,
    approval_status TEXT NOT NULL DEFAULT 'auto_sent',
    -- 'pending' | 'approved' | 'rejected' | 'auto_sent'

    -- Auto-reply tracking
    auto_reply_sent INTEGER NOT NULL DEFAULT 0,
    auto_reply_automation_id TEXT,
    auto_reply_sent_at INTEGER,

    -- Email columns
    email_message_id TEXT,
    email_thread_id TEXT,
    email_subject TEXT,
    email_from TEXT,
    email_to TEXT,

    received_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_msg_profile       ON social_messages (profile_id, received_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_msg_conv          ON social_messages (conversation_id, received_at ASC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_msg_conv_own      ON social_messages (conversation_id, is_own, received_at)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_msg_type          ON social_messages (profile_id, type)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_msg_unread        ON social_messages (profile_id, status, received_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_msg_approval      ON social_messages (profile_id, approval_status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_msg_post          ON social_messages (platform_post_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_msg_starred       ON social_messages (profile_id, is_starred) WHERE is_starred = 1"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_msg_sender        ON social_messages (profile_id, sender_platform_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_msg_reply         ON social_messages (conversation_id, in_reply_to_message_id)"#,
    // ── social_labels (custom tagging system for posts/inbox) ──
    r#"CREATE TABLE IF NOT EXISTS social_labels (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    icon TEXT,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_labels_profile    ON social_labels (profile_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_social_labels_unique ON social_labels (profile_id, name)"#,
    // ── social_conversation_labels (junction table) ──
    r#"CREATE TABLE IF NOT EXISTS social_conversation_labels (
    conversation_id TEXT NOT NULL,
    label_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    
    PRIMARY KEY (conversation_id, label_id),
    FOREIGN KEY (conversation_id) REFERENCES social_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (label_id) REFERENCES social_labels(id) ON DELETE CASCADE
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_conv_labels_conv         ON social_conversation_labels (conversation_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_conv_labels_label        ON social_conversation_labels (label_id)"#,
    // ── social_automations (rules for auto-reply, labeling, etc.) ──
    r#"CREATE TABLE IF NOT EXISTS social_automations (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT,             -- FK → social_accounts.id (required for engagement)
    name TEXT NOT NULL,
    description TEXT,
    automation_family TEXT NOT NULL DEFAULT 'content',
    -- 'content' | 'engagement'

    trigger_type TEXT NOT NULL,
    -- Content:
    --   'new_blog_post' | 'new_product' | 'new_subscriber_milestone'
    --   | 'schedule' | 'manual' | 'n8n_webhook' | 'rss_update'
    -- Engagement:
    --   'comment_keyword_dm' — comment matches keyword → auto DM (Instagram + Facebook only)
    --   'dm_keyword_reply'   — incoming DM matches keyword → auto-reply
    --     trigger_config shape: {
    --       "keywords": ["price", "how much", "cost"],
    --       "reply_message": "Hey {{firstName}}, our pricing starts at...",
    --       "add_to_crm": true,
    --       "enroll_sequence_id": "seq_xxx"  -- optional follow-up sequence
    --     }
    trigger_config TEXT NOT NULL DEFAULT '{}',

    -- Integration automation ID (engagement type only — set after POST /v1/automations)
    external_automation_id TEXT UNIQUE,

    -- Content automation: target accounts + action
    target_account_ids TEXT NOT NULL DEFAULT '[]',
    -- JSON: [account_id, ...]
    action_type TEXT NOT NULL DEFAULT 'schedule_post',
    -- 'schedule_post' | 'publish_now' | 'add_to_queue' | 'draft_only'
    content_template TEXT,
    -- Handlebars: {{title}} {{url}} {{excerpt}} {{price}} {{firstName}}
    ai_generate INTEGER NOT NULL DEFAULT 0,
    ai_prompt_template TEXT,
    use_queue INTEGER NOT NULL DEFAULT 0,

    is_active INTEGER NOT NULL DEFAULT 1,
    last_triggered_at INTEGER,
    trigger_count INTEGER NOT NULL DEFAULT 0,
    dm_sent_count INTEGER NOT NULL DEFAULT 0,
    crm_leads_created INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_automations_profile  ON social_automations (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_automations_active   ON social_automations (profile_id, is_active)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_automations_trigger  ON social_automations (profile_id, trigger_type)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_automations_family   ON social_automations (profile_id, automation_family)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_automations_integration ON social_automations (external_automation_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_automations_account  ON social_automations (account_id)"#,
    // ── social_automation_logs (audit log of automation executions) ──
    r#"CREATE TABLE IF NOT EXISTS social_automation_logs (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    automation_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    triggered_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    -- Engagement: commenter context
    commenter_platform_id TEXT,
    commenter_username TEXT,
    commenter_display_name TEXT,
    comment_content TEXT,
    keyword_matched TEXT,
    -- Result
    status TEXT NOT NULL DEFAULT 'sent',
    -- 'sent' | 'failed' | 'skipped'
    dm_sent INTEGER NOT NULL DEFAULT 0,
    comment_reply_sent INTEGER NOT NULL DEFAULT 0,
    -- CRM
    crm_contact_id TEXT,
    -- Content automation
    social_post_id TEXT,         -- FK → social_posts.id
    error TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sal_automation  ON social_automation_logs (automation_id, triggered_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sal_profile     ON social_automation_logs (profile_id, triggered_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sal_commenter   ON social_automation_logs (commenter_platform_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sal_crm         ON social_automation_logs (crm_contact_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sal_status      ON social_automation_logs (automation_id, status)"#,
    // ── social_sequences (drip campaigns for social interactions) ──
    r#"CREATE TABLE IF NOT EXISTS social_sequences (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    zernio_sequence_id TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    platform TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'active' | 'paused' | 'archived'
    total_enrolled INTEGER NOT NULL DEFAULT 0,
    total_completed INTEGER NOT NULL DEFAULT 0,
    total_unsubscribed INTEGER NOT NULL DEFAULT 0,
    total_replied INTEGER NOT NULL DEFAULT 0,
    reply_rate_pct INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    activated_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_sequences_profile  ON social_sequences (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_sequences_account  ON social_sequences (account_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_sequences_active   ON social_sequences (profile_id, is_active)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_sequences_zernio   ON social_sequences (zernio_sequence_id)"#,
    // ── social_sequence_steps (individual steps in a sequence) ──
    r#"CREATE TABLE IF NOT EXISTS social_sequence_steps (
    id TEXT PRIMARY KEY,
    sequence_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    step_order INTEGER NOT NULL DEFAULT 1,
    delay_minutes INTEGER NOT NULL DEFAULT 0,
    message_text TEXT NOT NULL,
    media_urls TEXT NOT NULL DEFAULT '[]',

    -- ── Conditional branching — ManyChat-style flow logic ──────────────────────
    -- condition_type:
    --   NULL              = linear — always execute (default, backwards-compatible)
    --   'keyword_match'   = contact's last reply contains keyword
    --   'replied'         = contact replied to any previous step
    --   'not_replied'     = contact has not replied
    --   'tag_has'         = contact has CRM tag
    --   'crm_status'      = contact.status matches value
    condition_type TEXT,
    -- condition_value JSON:
    --   keyword_match:  {"keywords":["yes","interested","sign me up"]}
    --   tag_has:        {"tag":"vip"}
    --   crm_status:     {"status":"customer"}
    condition_value TEXT,
    on_condition_true TEXT,   -- FK → social_sequence_steps.id (branch if condition met)
    on_condition_false TEXT,  -- FK → social_sequence_steps.id (branch if condition not met)

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sss_sequence ON social_sequence_steps (sequence_id, step_order ASC)"#,
    // ── social_sequence_enrollments (users enrolled in sequences) ──
    r#"CREATE TABLE IF NOT EXISTS social_sequence_enrollments (
    id TEXT PRIMARY KEY,
    sequence_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    zernio_enrollment_id TEXT,
    zernio_contact_id TEXT,
    contact_platform_id TEXT NOT NULL,
    contact_username TEXT,
    contact_display_name TEXT,
    crm_contact_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    -- 'active' | 'completed' | 'unsubscribed' | 'failed' | 'paused' | 'opted_out'
    current_step INTEGER NOT NULL DEFAULT 1,
    -- current_step_id tracks position within branched (non-linear) flows
    current_step_id TEXT,                    -- FK → social_sequence_steps.id
    last_message_sent_at INTEGER,
    next_message_at INTEGER,
    replied INTEGER NOT NULL DEFAULT 0,
    replied_at INTEGER,

    -- ── DM opt-out compliance ─────────────────────────────────────────────────
    -- Triggered when contact sends social_accounts.dm_opt_out_keyword
    opted_out INTEGER NOT NULL DEFAULT 0,
    opted_out_at INTEGER,
    opted_out_reason TEXT,
    -- 'user_request' | 'keyword_stop' | 'admin'

    enrolled_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    completed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sse_sequence     ON social_sequence_enrollments (sequence_id, enrolled_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sse_profile      ON social_sequence_enrollments (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sse_status       ON social_sequence_enrollments (sequence_id, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sse_crm          ON social_sequence_enrollments (crm_contact_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sse_contact      ON social_sequence_enrollments (contact_platform_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sse_next_message ON social_sequence_enrollments (status, next_message_at ASC)"#,
    // ── social_broadcasts (mass DMs or announcements) ──
    r#"CREATE TABLE IF NOT EXISTS social_broadcasts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    zernio_broadcast_id TEXT UNIQUE,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    message_text TEXT NOT NULL,
    media_urls TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed'
    scheduled_for INTEGER,
    sent_at INTEGER,
    recipient_count INTEGER NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    reply_count INTEGER NOT NULL DEFAULT 0,
    segment_config TEXT,
    -- {"tags":["vip"],"platforms":["instagram"]}

    -- ── CRM campaign/group targeting ──────────────────────────────────────────
    -- Send to everyone in a CRM campaign or specific contact group
    campaign_id TEXT,    -- FK → crm_campaigns.id
    crm_group_id TEXT,   -- FK → crm_contact_groups.group_id

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_broadcasts_profile ON social_broadcasts (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_broadcasts_status  ON social_broadcasts (profile_id, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_social_broadcasts_zernio  ON social_broadcasts (zernio_broadcast_id)"#,
    // ── social_competitors (tracked competitor profiles) ──
    r#"CREATE TABLE IF NOT EXISTS social_competitors (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    -- Platform handle / username (without @)
    username TEXT NOT NULL,
    -- Platform-native user/page/channel ID (set after first API lookup)
    platform_user_id TEXT,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    platform_url TEXT,
    website TEXT,
    category TEXT,
    is_verified INTEGER NOT NULL DEFAULT 0,
    -- Reach metrics (synced periodically)
    follower_count INTEGER NOT NULL DEFAULT 0,
    following_count INTEGER NOT NULL DEFAULT 0,
    platform_post_count INTEGER NOT NULL DEFAULT 0,
    avg_engagement_rate INTEGER NOT NULL DEFAULT 0, -- basis points
    avg_likes_per_post INTEGER NOT NULL DEFAULT 0,
    avg_comments_per_post INTEGER NOT NULL DEFAULT 0,
    avg_views_per_post INTEGER NOT NULL DEFAULT 0,
    -- Audience demographics (JSON, same format as social_accounts)
    audience_country_breakdown TEXT,
    audience_age_breakdown TEXT,
    audience_gender_breakdown TEXT,
    -- Classification / relationship
    relationship TEXT NOT NULL DEFAULT 'competitor',
    -- 'competitor' | 'inspiration' | 'partner' | 'client' | 'influencer' | 'watch'
    tags TEXT NOT NULL DEFAULT '[]',    -- JSON string[]
    niche TEXT,                          -- e.g. "SaaS" "Creator Economy" "Fitness"
    -- Agent-generated notes (updated by /cmo or /seo agent)
    analysis_notes TEXT,
    last_analyzed_at INTEGER,
    -- Tracking state
    is_active INTEGER NOT NULL DEFAULT 1,
    track_posts INTEGER NOT NULL DEFAULT 1,   -- whether to mirror their posts
    metrics_synced_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_competitors_profile    ON social_competitors (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_competitors_platform   ON social_competitors (profile_id, platform)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_competitors_username   ON social_competitors (profile_id, platform, username)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_competitors_active     ON social_competitors (profile_id, is_active)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_competitors_rel        ON social_competitors (profile_id, relationship)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_competitors_sync       ON social_competitors (profile_id, metrics_synced_at ASC)"#,
    // ── social_competitor_posts (scraped competitor posts) ──
    r#"CREATE TABLE IF NOT EXISTS social_competitor_posts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    competitor_id TEXT NOT NULL,    -- FK → social_competitors.id
    platform TEXT NOT NULL,
    platform_post_id TEXT NOT NULL, -- the actual post ID on the platform
    platform_post_url TEXT,
    -- Content snapshot (truncated/summarized — we don't store full copyrighted text)
    content_preview TEXT,           -- first 500 chars max
    media_type TEXT,                -- 'image' | 'video' | 'carousel' | 'text' | 'link'
    thumbnail_url TEXT,
    post_type TEXT NOT NULL DEFAULT 'post',
    -- Published timestamp on the platform
    posted_at INTEGER NOT NULL,
    -- Engagement metrics at time of sync
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    saves INTEGER NOT NULL DEFAULT 0,
    engagement_rate INTEGER NOT NULL DEFAULT 0,  -- basis points
    -- AI analysis (set by agent, NULL until processed)
    ai_analyzed INTEGER NOT NULL DEFAULT 0,
    ai_topic TEXT,
    ai_hook TEXT,
    ai_cta TEXT,
    ai_notes TEXT,
    -- How interesting is this post? 0-100 score set by agent (for sorting/filtering)
    ai_score INTEGER NOT NULL DEFAULT 0,
    -- User actions
    is_bookmarked INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    metrics_synced_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_comp_posts_profile     ON social_competitor_posts (profile_id, posted_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_comp_posts_competitor  ON social_competitor_posts (competitor_id, posted_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_comp_posts_platform    ON social_competitor_posts (profile_id, platform, posted_at DESC)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_posts_unique ON social_competitor_posts (competitor_id, platform_post_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_comp_posts_score       ON social_competitor_posts (profile_id, ai_score DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_comp_posts_bookmarked  ON social_competitor_posts (profile_id, is_bookmarked)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_comp_posts_analyzed    ON social_competitor_posts (profile_id, ai_analyzed)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_comp_posts_sync        ON social_competitor_posts (competitor_id, metrics_synced_at ASC)"#,
    // ── social_sequence_step_analytics (metrics per sequence step) ──
    r#"CREATE TABLE IF NOT EXISTS social_sequence_step_analytics (
    id TEXT PRIMARY KEY,
    step_id TEXT NOT NULL UNIQUE,    -- FK → social_sequence_steps.id
    sequence_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    sent_count INTEGER NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    reply_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    opted_out_count INTEGER NOT NULL DEFAULT 0,
    condition_true_count INTEGER NOT NULL DEFAULT 0,
    condition_false_count INTEGER NOT NULL DEFAULT 0,
    reply_rate_pct INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ssa_step     ON social_sequence_step_analytics (step_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ssa_sequence ON social_sequence_step_analytics (sequence_id)"#,
    r#"CREATE VIEW IF NOT EXISTS social_analytics_view AS
SELECT
  sa.profile_id,
  COUNT(DISTINCT sa.id) AS total_accounts,
  -- Follower totals
  SUM(sa.follower_count) AS total_followers,
  MAX(sa.follower_count) AS top_account_followers,
  -- Platform breakdown JSON: {"twitter":{"followers":X,"engagement_rate":Y},...}
  -- Built as aggregated JSON — SQLite json_group_object
  json_group_object(
    sa.platform,
    json_object(
      'account_id',       sa.id,
      'username',         sa.platform_username,
      'followers',        sa.follower_count,
      'engagement_rate',  COALESCE(san.avg_engagement_rate, 0),
      'total_posts',      COALESCE(san.total_posts, 0),
      'total_impressions',COALESCE(san.total_impressions, 0),
      'total_likes',      COALESCE(san.total_likes, 0),
      'follower_change_30d', COALESCE(san.follower_change_30d, 0),
      'metrics_synced_at',COALESCE(sa.metrics_synced_at, 0),
      'token_status',     sa.token_status,
      'is_connected',     sa.is_connected
    )
  ) AS platform_breakdown,
  -- Aggregate totals across all accounts for this profile
  SUM(COALESCE(san.total_posts, 0)) AS total_posts_all_platforms,
  SUM(COALESCE(san.total_published, 0)) AS total_published_all_platforms,
  SUM(COALESCE(san.total_impressions, 0)) AS total_impressions_all_platforms,
  SUM(COALESCE(san.total_likes, 0)) AS total_likes_all_platforms,
  SUM(COALESCE(san.total_comments, 0)) AS total_comments_all_platforms,
  SUM(COALESCE(san.total_shares, 0)) AS total_shares_all_platforms,
  SUM(COALESCE(san.total_reach, 0)) AS total_reach_all_platforms,
  SUM(COALESCE(san.total_views, 0)) AS total_views_all_platforms,
  -- Weighted avg engagement rate
  CASE
    WHEN SUM(sa.follower_count) > 0
    THEN CAST(
      SUM(COALESCE(san.avg_engagement_rate, 0) * sa.follower_count) / SUM(sa.follower_count)
    AS INTEGER)
    ELSE 0
  END AS weighted_avg_engagement_rate,
  -- Follower growth (sum across platforms)
  SUM(COALESCE(san.follower_change_30d, 0)) AS total_follower_change_30d,
  -- Health: any accounts with token issues?
  SUM(CASE WHEN sa.token_status != 'valid' THEN 1 ELSE 0 END) AS unhealthy_accounts,
  -- Last sync timestamps
  MIN(COALESCE(sa.metrics_synced_at, 0)) AS oldest_metrics_sync,
  MAX(COALESCE(sa.metrics_synced_at, 0)) AS newest_metrics_sync
FROM social_accounts sa
LEFT JOIN social_analytics san ON san.account_id = sa.id
WHERE sa.is_active = 1
GROUP BY sa.profile_id;"#,
    r#"CREATE VIEW IF NOT EXISTS social_posts_analytics_view AS
SELECT
  sp.profile_id,
  -- Total posts across all platforms last 30 days
  COUNT(DISTINCT sp.id)                          AS posts_30d,
  COUNT(DISTINCT sp.platform)                    AS active_platforms_30d,
  -- Engagement totals
  SUM(COALESCE(spa.impressions, 0))              AS impressions_30d,
  SUM(COALESCE(spa.reach, 0))                    AS reach_30d,
  SUM(COALESCE(spa.likes, 0))                    AS likes_30d,
  SUM(COALESCE(spa.comments, 0))                 AS comments_30d,
  SUM(COALESCE(spa.shares, 0))                   AS shares_30d,
  SUM(COALESCE(spa.clicks, 0))                   AS clicks_30d,
  SUM(COALESCE(spa.saves, 0))                    AS saves_30d,
  SUM(COALESCE(spa.views, 0))                    AS video_views_30d,
  -- Averages
  CAST(AVG(COALESCE(spa.engagement_rate, 0)) AS INTEGER) AS avg_engagement_rate_30d,
  CAST(AVG(COALESCE(spa.impressions, 0)) AS INTEGER)     AS avg_impressions_per_post_30d,
  CAST(AVG(COALESCE(spa.likes, 0)) AS INTEGER)           AS avg_likes_per_post_30d,
  -- Platform with most posts in period
  (
    SELECT sp2.platform
    FROM social_posts sp2
    WHERE sp2.profile_id = sp.profile_id
      AND sp2.status = 'published'
      AND sp2.published_at >= strftime('%s','now') - 2592000
    GROUP BY sp2.platform
    ORDER BY COUNT(*) DESC
    LIMIT 1
  ) AS top_platform_by_posts,
  -- Platform with highest avg engagement
  (
    SELECT sp3.platform
    FROM social_posts sp3
    LEFT JOIN social_post_analytics spa3 ON spa3.post_id = sp3.id
    WHERE sp3.profile_id = sp.profile_id
      AND sp3.status = 'published'
      AND sp3.published_at >= strftime('%s','now') - 2592000
    GROUP BY sp3.platform
    ORDER BY AVG(COALESCE(spa3.engagement_rate, 0)) DESC
    LIMIT 1
  ) AS top_platform_by_engagement,
  -- AI label breakdown (JSON object: {"promotional":12,"educational":8,...})
  -- Only counts rows where ai_labeled = 1
  json_group_object(
    COALESCE(sp.ai_label, 'unlabeled'),
    COUNT(CASE WHEN sp.ai_labeled = 1 THEN 1 ELSE NULL END)
  ) AS ai_label_breakdown,
  MIN(sp.published_at) AS first_post_at_30d,
  MAX(sp.published_at) AS last_post_at_30d
FROM social_posts sp
LEFT JOIN social_post_analytics spa ON spa.post_id = sp.id
WHERE sp.status = 'published'
  AND sp.published_at >= strftime('%s','now') - 2592000
GROUP BY sp.profile_id;"#,
    r#"DROP TRIGGER IF EXISTS trg_social_post_published_insert"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_social_post_published_insert
   AFTER INSERT ON social_posts
   WHEN NEW.status = 'published'
   BEGIN
     INSERT INTO social_analytics (id, profile_id, account_id, total_posts, total_published)
     VALUES (hex(randomblob(16)), NEW.profile_id, NEW.account_id, 1, 1)
     ON CONFLICT(account_id) DO UPDATE SET
       total_posts     = total_posts + 1,
       total_published = total_published + 1,
       updated_at      = strftime('%s','now');
   END"#,
    r#"DROP TRIGGER IF EXISTS trg_social_post_scheduled_insert"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_social_post_scheduled_insert
   AFTER INSERT ON social_posts
   WHEN NEW.status = 'scheduled'
   BEGIN
     INSERT INTO social_analytics (id, profile_id, account_id, total_posts, total_scheduled)
     VALUES (hex(randomblob(16)), NEW.profile_id, NEW.account_id, 1, 1)
     ON CONFLICT(account_id) DO UPDATE SET
       total_posts     = total_posts + 1,
       total_scheduled = total_scheduled + 1,
       updated_at      = strftime('%s','now');
   END"#,
    r#"DROP TRIGGER IF EXISTS trg_social_post_status_published"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_social_post_status_published
   AFTER UPDATE OF status ON social_posts
   WHEN NEW.status = 'published'
     AND OLD.status != 'published'
   BEGIN
     UPDATE social_analytics SET
       total_published  = total_published + 1,
       total_scheduled  = MAX(0, total_scheduled - CASE
                               WHEN OLD.status IN ('scheduled','queued','publishing','draft') THEN 1
                               ELSE 0 END),
       updated_at       = strftime('%s','now')
     WHERE account_id = NEW.account_id;
   END"#,
    r#"DROP TRIGGER IF EXISTS trg_social_post_status_failed"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_social_post_status_failed
   AFTER UPDATE OF status ON social_posts
   WHEN NEW.status = 'failed'
     AND OLD.status != 'failed'
   BEGIN
     UPDATE social_analytics SET
       total_failed    = total_failed + 1,
       total_scheduled = MAX(0, total_scheduled - CASE
                              WHEN OLD.status IN ('scheduled','queued','publishing','draft') THEN 1
                              ELSE 0 END),
       updated_at      = strftime('%s','now')
     WHERE account_id = NEW.account_id;
   END"#,
    r#"DROP TRIGGER IF EXISTS trg_social_post_analytics_insert"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_social_post_analytics_insert
   AFTER INSERT ON social_posts
   BEGIN
     INSERT OR IGNORE INTO social_post_analytics
       (id, post_id, profile_id, account_id, platform)
     VALUES
       (hex(randomblob(16)), NEW.id, NEW.profile_id, NEW.account_id, NEW.platform);
   END"#,
    r#"DROP TRIGGER IF EXISTS trg_social_post_group_count"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_social_post_group_count
   AFTER INSERT ON social_posts
   WHEN NEW.group_id IS NOT NULL
   BEGIN
     UPDATE social_post_groups SET
       platform_count = platform_count + 1
     WHERE id = NEW.group_id;
   END"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
