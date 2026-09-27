// src-tauri/src/db/schema/ads.rs
use super::Migration;

// ─────────────────────────────────────────────────────────────────────────────
// ads.ts — Advertising Schema + Provision Helpers
// Provisioned via provision.ts → provisionUserDatabase()
//
// ── Platform support ──────────────────────────────────────────────────────────
//
//  Priority 1 — Zernio Ads API (unified, abstracts platform differences)
//    connection_mode = 'zernio'
//    All CRUD + analytics flow through Zernio → zernio_* IDs stored here
//    Webhook: /api/webhooks/zernio → updates status, spend, conversions
//
//  Priority 2 — Direct platform APIs (user brings own developer app creds)
//    connection_mode = 'direct'
//    Requires connections row: service='meta_ads' | 'linkedin_ads' |
//      'pinterest_ads' | 'tiktok_ads' | 'google_ads' | 'twitter_ads'
//    Platform-specific calls handled in ads-service.ts
//
//  Priority 3 — n8n webhook (dispatch to n8n, callback updates status)
//    connection_mode = 'n8n'
//
// ── Platform hierarchy (unified model) ───────────────────────────────────────
//
//  ad_accounts  →  ad_campaigns  →  ad_groups  →  ads
//
//  Platform naming per level:
//    Meta:       Ad Account → Campaign → Ad Set       → Ad
//    LinkedIn:   Ad Account → Campaign → Ad Group     → Creative
//    Pinterest:  Ad Account → Campaign → Ad Group     → Ad
//    TikTok:     Ad Account → Campaign → Ad Group     → Ad
//    Google Ads: Account    → Campaign → Ad Group     → Ad
//    X Ads:      Ad Account → Campaign → Line Item    → Tweet/Creative
//
// ── Tables (8) ────────────────────────────────────────────────────────────────
//
//   ad_accounts     — connected advertising accounts (1 per platform account)
//   ad_campaigns    — campaigns (budget + objective containers)
//   ad_groups       — ad sets / ad groups / line items (targeting + schedule)
//   ads             — individual ads (creative + copy + destination)
//   ad_creatives    — reusable creative library (images, videos, copy blocks)
//   ad_audiences    — saved/custom/lookalike audiences
//   ad_analytics    — account-level aggregate (1 row/account) — trigger-updated
//   ad_snapshots    — account-level time series (1 row/account) — service-updated
//
// ── Triggers (7) ──────────────────────────────────────────────────────────────
//
//   trg_ad_campaign_insert    — init ad_analytics row + increment campaign_count
//   trg_ad_campaign_activate  — active_campaigns counter
//   trg_ad_campaign_pause     — active/paused counter swap
//   trg_ad_group_insert       — increment group count on campaign
//   trg_ad_insert             — increment ad count on ad_group and campaign
//   trg_ad_spend_update       — keep account spend totals live
//   trg_ad_conversion_update  — keep account conversion totals live
//
// ── Views (3) ─────────────────────────────────────────────────────────────────
//
//   ads_agent_context_view   — one-stop ad account overview per profile
//   ads_performance_view     — per-campaign: spend / ROAS / efficiency
//   ads_budget_pacing_view   — budget consumption + estimated days remaining
//
// ── Analytics update split ────────────────────────────────────────────────────
//
//   DB Triggers → scalar counters (campaign_count, spend, conversions)
//                 fire on INSERT/UPDATE regardless of who writes (agent, n8n, app)
//   Service     → time-series arrays, CTR, CPA, ROAS ratios
//                 computed by syncAdAnalytics() on dashboard page load
//                 (same pattern as community_analytics aggregator)
//
// ─────────────────────────────────────────────────────────────────────────────

pub const SCHEMA_SQL: &[&str] = &[
    r#"CREATE TABLE IF NOT EXISTS ad_accounts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,          -- FK → connections.id
    connection_mode TEXT NOT NULL DEFAULT 'zernio',
    -- 'zernio' | 'direct' | 'n8n'

    -- Zernio identifiers (NULL for direct/n8n)
    zernio_account_id TEXT,
    zernio_profile_id TEXT,

    -- Platform
    platform TEXT NOT NULL,
    -- 'meta' | 'linkedin' | 'pinterest' | 'tiktok' | 'google' | 'twitter'

    -- Platform account identity
    platform_account_id TEXT,           -- native platform account ID
    platform_account_name TEXT,         -- e.g. "Acme Corp Ads"
    platform_account_type TEXT,         -- business_manager | personal | etc.
    platform_timezone TEXT,
    platform_currency TEXT NOT NULL DEFAULT 'USD',

    -- Account type
    account_type TEXT NOT NULL DEFAULT 'business',
    -- 'personal' | 'business' | 'agency' | 'client'

    -- Billing
    billing_threshold_cents INTEGER,    -- auto-charge threshold
    payment_method_last4 TEXT,          -- last 4 digits of payment method
    credit_remaining_cents INTEGER,     -- prepaid credit balance

    -- Health
    is_connected INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    account_status TEXT NOT NULL DEFAULT 'active',
    -- 'active' | 'disabled' | 'unsettled' | 'pending_review' | 'closed'
    token_status TEXT NOT NULL DEFAULT 'valid',
    -- 'valid' | 'expired' | 'revoked' | 'error'
    token_expires_at INTEGER,
    last_health_check_at INTEGER,
    health_error TEXT,

    -- Aggregate counters (trigger-maintained)
    total_campaigns INTEGER NOT NULL DEFAULT 0,
    active_campaigns INTEGER NOT NULL DEFAULT 0,
    total_ad_groups INTEGER NOT NULL DEFAULT 0,
    total_ads INTEGER NOT NULL DEFAULT 0,

    -- Spend totals (trigger-maintained via ad_campaigns updates)
    total_spend_cents INTEGER NOT NULL DEFAULT 0,   -- lifetime
    spend_today_cents INTEGER NOT NULL DEFAULT 0,   -- reset daily by service
    spend_this_month_cents INTEGER NOT NULL DEFAULT 0,

    -- Conversion totals (trigger-maintained)
    total_conversions INTEGER NOT NULL DEFAULT 0,
    total_revenue_cents INTEGER NOT NULL DEFAULT 0, -- attributed revenue

    -- Limits and defaults
    default_timezone TEXT NOT NULL DEFAULT 'UTC',
    auto_approve INTEGER NOT NULL DEFAULT 0,       -- skip approval for AI-created campaigns

    connected_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    disconnected_at INTEGER,
    last_synced_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_accounts_profile      ON ad_accounts (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_accounts_platform     ON ad_accounts (profile_id, platform)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_accounts_active       ON ad_accounts (profile_id, is_active)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_accounts_zernio       ON ad_accounts (zernio_account_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_accounts_connection   ON ad_accounts (connection_id)"#,
    r#"CREATE TABLE IF NOT EXISTS ad_campaigns (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL,           -- FK → ad_accounts.id

    -- Platform identifiers
    zernio_campaign_id TEXT UNIQUE,     -- Zernio campaign ID (set after API call)
    platform_campaign_id TEXT,         -- native platform campaign ID
    platform_campaign_url TEXT,        -- link to platform ads manager

    -- Identity
    name TEXT NOT NULL,
    objective TEXT NOT NULL DEFAULT 'traffic',
    -- 'awareness' | 'traffic' | 'engagement' | 'leads' | 'conversions'
    -- | 'app_installs' | 'catalog_sales' | 'followers' | 'store_traffic'
    platform TEXT NOT NULL,            -- denormalized from account for fast queries

    -- Budget
    budget_type TEXT NOT NULL DEFAULT 'daily',
    -- 'daily' | 'lifetime' | 'shared'
    budget_cents INTEGER NOT NULL DEFAULT 0,
    daily_budget_cents INTEGER,        -- override for lifetime campaigns
    bid_strategy TEXT NOT NULL DEFAULT 'lowest_cost',
    bid_amount_cents INTEGER,          -- CPC/CPM cap (depends on bid_strategy)
    spend_limit_cents INTEGER,         -- account-level spend cap this campaign

    -- Schedule
    start_date TEXT,                   -- YYYY-MM-DD
    end_date TEXT,
    is_ongoing INTEGER NOT NULL DEFAULT 1,

    -- Status
    status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'active' | 'paused' | 'ended' | 'rejected' | 'error' | 'archived'
    approval_status TEXT NOT NULL DEFAULT 'auto_approved',
    -- 'pending' | 'approved' | 'rejected' | 'auto_approved'
    rejection_reason TEXT,
    platform_status TEXT,              -- raw platform status string

    -- Campaign type hints (for targeting/placement constraints)
    campaign_type TEXT NOT NULL DEFAULT 'standard',
    -- 'standard' | 'retargeting' | 'lookalike' | 'prospecting' | 'dynamic' | 'shopping'

    -- Performance (trigger-updated on spend/conversion writes from service sync)
    spend_cents INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    conversions INTEGER NOT NULL DEFAULT 0,
    revenue_cents INTEGER NOT NULL DEFAULT 0,     -- attributed revenue
    roas_x100 INTEGER NOT NULL DEFAULT 0,         -- e.g. 350 = 3.5x
    ctr_bps INTEGER NOT NULL DEFAULT 0,           -- basis points: 150 = 1.50%
    cpc_cents INTEGER NOT NULL DEFAULT 0,
    cpa_cents INTEGER NOT NULL DEFAULT 0,
    cpm_cents INTEGER NOT NULL DEFAULT 0,
    reach INTEGER NOT NULL DEFAULT 0,
    frequency_x100 INTEGER NOT NULL DEFAULT 0,   -- avg frequency × 100
    video_views INTEGER NOT NULL DEFAULT 0,
    video_completion_rate_bps INTEGER NOT NULL DEFAULT 0,

    -- Counts (trigger-maintained)
    total_ad_groups INTEGER NOT NULL DEFAULT 0,
    active_ad_groups INTEGER NOT NULL DEFAULT 0,
    total_ads INTEGER NOT NULL DEFAULT 0,
    active_ads INTEGER NOT NULL DEFAULT 0,

    -- Agent + attribution
    source TEXT NOT NULL DEFAULT 'manual',
    -- 'manual' | 'agent' | 'template'
    ai_generated INTEGER NOT NULL DEFAULT 0,
    ai_prompt TEXT,
    labels TEXT NOT NULL DEFAULT '[]',

    -- Scheduling path
    scheduled_via TEXT NOT NULL DEFAULT 'zernio',
    -- 'zernio' | 'direct' | 'n8n'

    last_synced_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_campaigns_profile     ON ad_campaigns (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_campaigns_account     ON ad_campaigns (account_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_campaigns_platform    ON ad_campaigns (profile_id, platform)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status      ON ad_campaigns (profile_id, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_campaigns_objective   ON ad_campaigns (profile_id, objective)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_campaigns_zernio      ON ad_campaigns (zernio_campaign_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_campaigns_approval    ON ad_campaigns (profile_id, approval_status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_campaigns_active      ON ad_campaigns (account_id, status)"#,
    r#"CREATE TABLE IF NOT EXISTS ad_groups (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,

    -- Platform identifiers
    zernio_ad_group_id TEXT UNIQUE,
    platform_ad_group_id TEXT,
    platform TEXT NOT NULL,

    -- Identity
    name TEXT NOT NULL,
    platform_term TEXT,                -- 'Ad Set' | 'Ad Group' | 'Line Item' (UI label)
    status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'active' | 'paused' | 'ended' | 'rejected' | 'error' | 'archived'

    -- Budget (overrides campaign if set)
    budget_type TEXT,                  -- NULL = inherit from campaign
    budget_cents INTEGER,
    bid_strategy TEXT,
    bid_amount_cents INTEGER,
    optimization_goal TEXT NOT NULL DEFAULT 'link_clicks',

    -- Schedule
    start_date TEXT,
    end_date TEXT,

    -- Targeting (JSON — see schema above)
    targeting TEXT NOT NULL DEFAULT '{}',

    -- Placement (JSON — platform-specific placement options)
    placements TEXT NOT NULL DEFAULT '{}',
    -- Meta: {"facebook":["feed","story"],"instagram":["feed","reels"]}
    -- Google: {"search":true,"display":false,"youtube":false}
    -- TikTok: {"tiktok":true,"pangle":false}
    -- LinkedIn: {"linkedin_feed":true,"linkedin_audience_network":false}

    -- Performance (service-synced)
    spend_cents INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    conversions INTEGER NOT NULL DEFAULT 0,
    revenue_cents INTEGER NOT NULL DEFAULT 0,
    roas_x100 INTEGER NOT NULL DEFAULT 0,
    ctr_bps INTEGER NOT NULL DEFAULT 0,
    cpc_cents INTEGER NOT NULL DEFAULT 0,
    cpa_cents INTEGER NOT NULL DEFAULT 0,
    reach INTEGER NOT NULL DEFAULT 0,
    frequency_x100 INTEGER NOT NULL DEFAULT 0,
    video_views INTEGER NOT NULL DEFAULT 0,

    -- Counts (trigger-maintained)
    total_ads INTEGER NOT NULL DEFAULT 0,
    active_ads INTEGER NOT NULL DEFAULT 0,

    last_synced_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_groups_profile    ON ad_groups (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_groups_campaign   ON ad_groups (campaign_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_groups_account    ON ad_groups (account_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_groups_status     ON ad_groups (profile_id, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_groups_zernio     ON ad_groups (zernio_ad_group_id)"#,
    r#"CREATE TABLE IF NOT EXISTS ads (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    ad_group_id TEXT NOT NULL,
    creative_id TEXT,                  -- FK → ad_creatives.id (NULL = inline creative)

    -- Platform identifiers
    zernio_ad_id TEXT UNIQUE,
    platform_ad_id TEXT,
    platform TEXT NOT NULL,

    -- Identity
    name TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'image',
    -- 'image' | 'video' | 'carousel' | 'collection' | 'story' | 'reel'
    -- | 'responsive' | 'dynamic' | 'text' | 'document' | 'app' | 'lead_form' | 'shopping'

    -- Status
    status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'active' | 'paused' | 'rejected' | 'error' | 'archived'
    approval_status TEXT NOT NULL DEFAULT 'auto_approved',
    -- 'pending' | 'approved' | 'rejected' | 'auto_approved'
    platform_status TEXT,
    rejection_reason TEXT,

    -- Creative content
    headline TEXT,
    headline_2 TEXT,
    headline_3 TEXT,
    description TEXT,
    description_2 TEXT,
    cta_label TEXT,                    -- 'Shop Now' | 'Learn More' | 'Sign Up' | 'Download' | etc.

    -- Responsive ad fields (JSON arrays for Google/Meta RSAs)
    headlines TEXT DEFAULT '[]',       -- [{text, pinned_position?}]
    descriptions TEXT DEFAULT '[]',   -- [{text, pinned_position?}]
    long_headline TEXT,                -- DBA / Performance Max
    business_name TEXT,                -- for responsive display

    -- Media
    media_items TEXT NOT NULL DEFAULT '[]',
    -- [{url, type, thumbnail_url, alt_text, width, height, aspect_ratio, duration_s}]

    -- Destination
    destination_url TEXT,              -- final URL
    display_url TEXT,                  -- shown in ad (can differ from final)
    mobile_url TEXT,                   -- mobile-specific landing page
    url_parameters TEXT,               -- UTM params appended to destination_url
    -- e.g. "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}"

    -- Lead form (for lead_form format)
    lead_form_id TEXT,                 -- platform lead form ID (Meta, LinkedIn, TikTok)

    -- Shopping / dynamic
    catalog_id TEXT,                   -- product catalog ID
    product_set_id TEXT,               -- subset of catalog to target

    -- Platform-specific extra options (JSON)
    -- meta:     {"pixel_id":"xxx","conversion_event":"Purchase","instagram_actor_id":"xxx"}
    -- google:   {"final_urls":[],"tracking_url_template":"","ad_type":"expanded_text"}
    -- tiktok:   {"app_id":"xxx","deep_link_url":"xxx"}
    -- linkedin: {"tenant_id":"xxx","message":"xxx","sponsored_update_id":"xxx"}
    -- twitter:  {"tweet_id":"xxx","card_uri":"xxx"}
    platform_specific_data TEXT NOT NULL DEFAULT '{}',

    -- Performance (service-synced)
    spend_cents INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    conversions INTEGER NOT NULL DEFAULT 0,
    revenue_cents INTEGER NOT NULL DEFAULT 0,
    roas_x100 INTEGER NOT NULL DEFAULT 0,
    ctr_bps INTEGER NOT NULL DEFAULT 0,
    cpc_cents INTEGER NOT NULL DEFAULT 0,
    cpa_cents INTEGER NOT NULL DEFAULT 0,
    reach INTEGER NOT NULL DEFAULT 0,
    frequency_x100 INTEGER NOT NULL DEFAULT 0,
    video_views INTEGER NOT NULL DEFAULT 0,
    video_completion_rate_bps INTEGER NOT NULL DEFAULT 0,
    -- Lead gen specific
    leads INTEGER NOT NULL DEFAULT 0,
    cost_per_lead_cents INTEGER NOT NULL DEFAULT 0,
    -- App installs
    installs INTEGER NOT NULL DEFAULT 0,
    cost_per_install_cents INTEGER NOT NULL DEFAULT 0,

    -- Agent + source
    source TEXT NOT NULL DEFAULT 'manual',
    ai_generated INTEGER NOT NULL DEFAULT 0,
    ai_prompt TEXT,
    labels TEXT NOT NULL DEFAULT '[]',

    last_synced_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ads_profile      ON ads (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ads_campaign     ON ads (campaign_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ads_ad_group     ON ads (ad_group_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ads_account      ON ads (account_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ads_status       ON ads (profile_id, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ads_format       ON ads (profile_id, format)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ads_zernio       ON ads (zernio_ad_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ads_creative     ON ads (creative_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_platform_unique ON ads (platform, platform_ad_id) WHERE platform_ad_id IS NOT NULL"#,
    r#"CREATE TABLE IF NOT EXISTS ad_creatives (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,

    name TEXT NOT NULL,
    type TEXT NOT NULL,
    -- 'image' | 'video' | 'carousel_card' | 'headline_set' | 'copy_set'

    status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'processing' | 'ready' | 'rejected' | 'archived'

    -- Media
    media_url TEXT,                    -- primary file URL (R2/CDN)
    thumbnail_url TEXT,
    alt_text TEXT,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    duration_s INTEGER,                -- video duration in seconds
    file_size_bytes INTEGER,

    -- Copy
    headline TEXT,
    description TEXT,
    long_headline TEXT,
    cta_label TEXT,

    -- Carousel specific (JSON array of cards)
    carousel_cards TEXT DEFAULT '[]',
    -- [{media_url, headline, description, destination_url, thumbnail_url}]

    -- Platform upload IDs (filled after uploading to each platform)
    -- Once uploaded, reference by ID rather than re-uploading the file
    platform_asset_ids TEXT NOT NULL DEFAULT '{}',
    -- {"meta":"12345","tiktok":"TKTK_xxx","google":"GCID_xxx"}

    -- Performance (aggregate across all ads using this creative)
    total_ads_using INTEGER NOT NULL DEFAULT 0,
    avg_ctr_bps INTEGER NOT NULL DEFAULT 0,
    avg_roas_x100 INTEGER NOT NULL DEFAULT 0,
    performance_score INTEGER NOT NULL DEFAULT 0,  -- 0-100 agent-scored

    -- Agent
    ai_generated INTEGER NOT NULL DEFAULT 0,
    ai_prompt TEXT,
    tags TEXT NOT NULL DEFAULT '[]',

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_creatives_profile ON ad_creatives (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_creatives_status  ON ad_creatives (profile_id, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_creatives_type    ON ad_creatives (profile_id, type)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_creatives_score   ON ad_creatives (profile_id, performance_score DESC)"#,
    r#"CREATE TABLE IF NOT EXISTS ad_audiences (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL,

    -- Platform identifiers
    platform TEXT NOT NULL,
    platform_audience_id TEXT,
    zernio_audience_id TEXT,

    -- Identity
    name TEXT NOT NULL,
    description TEXT,
    audience_type TEXT NOT NULL DEFAULT 'saved',
    -- 'saved' | 'custom' | 'lookalike' | 'combined'

    -- Custom audience source
    source_type TEXT,
    -- 'customer_list' | 'website_traffic' | 'app_activity' | 'engagement'
    -- | 'video_viewers' | 'crm_subscribers' | 'crm_customers'
    source_id TEXT,                    -- e.g. pixel ID, app ID, or video ID

    -- Lookalike settings
    lookalike_source_audience_id TEXT, -- FK → ad_audiences.id (seed audience)
    lookalike_country TEXT,
    lookalike_ratio_bps INTEGER,       -- similarity: 100 = 1%, 500 = 5%, 1000 = 10%

    -- Saved audience targeting (JSON — same format as ad_groups.targeting)
    targeting TEXT DEFAULT '{}',

    -- Size estimate
    size_lower INTEGER,
    size_upper INTEGER,
    size_updated_at INTEGER,

    -- Status
    status TEXT NOT NULL DEFAULT 'active',
    -- 'active' | 'building' | 'ready' | 'error' | 'archived' | 'expired'
    platform_status TEXT,
    health_error TEXT,

    -- CRM sync (auto-populate audience from BusinessKit data)
    crm_sync_enabled INTEGER NOT NULL DEFAULT 0,
    crm_sync_last_at INTEGER,
    crm_sync_count INTEGER NOT NULL DEFAULT 0,

    -- Usage tracking
    active_campaigns_using INTEGER NOT NULL DEFAULT 0,
    active_ad_groups_using INTEGER NOT NULL DEFAULT 0,

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_audiences_profile   ON ad_audiences (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_audiences_account   ON ad_audiences (account_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_audiences_platform  ON ad_audiences (profile_id, platform)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_audiences_type      ON ad_audiences (profile_id, audience_type)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ad_audiences_status    ON ad_audiences (profile_id, status)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_audiences_platform_id ON ad_audiences (platform, platform_audience_id) WHERE platform_audience_id IS NOT NULL"#,
    r#"CREATE TABLE IF NOT EXISTS ad_analytics (
    account_id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,

    -- Campaign funnel counts (trigger-maintained)
    total_campaigns INTEGER NOT NULL DEFAULT 0,
    active_campaigns INTEGER NOT NULL DEFAULT 0,
    paused_campaigns INTEGER NOT NULL DEFAULT 0,
    draft_campaigns INTEGER NOT NULL DEFAULT 0,
    ended_campaigns INTEGER NOT NULL DEFAULT 0,

    -- Spend totals (service-synced on analytics refresh)
    total_spend_cents INTEGER NOT NULL DEFAULT 0,        -- all-time
    spend_today_cents INTEGER NOT NULL DEFAULT 0,
    spend_this_month_cents INTEGER NOT NULL DEFAULT 0,

    -- Engagement totals (service-synced)
    total_impressions INTEGER NOT NULL DEFAULT 0,
    total_clicks INTEGER NOT NULL DEFAULT 0,
    total_conversions INTEGER NOT NULL DEFAULT 0,
    total_leads INTEGER NOT NULL DEFAULT 0,
    total_installs INTEGER NOT NULL DEFAULT 0,
    total_revenue_cents INTEGER NOT NULL DEFAULT 0,      -- attributed revenue
    total_reach INTEGER NOT NULL DEFAULT 0,

    -- Derived metrics (service-computed)
    avg_ctr_bps INTEGER NOT NULL DEFAULT 0,
    avg_cpc_cents INTEGER NOT NULL DEFAULT 0,
    avg_cpa_cents INTEGER NOT NULL DEFAULT 0,
    avg_cpm_cents INTEGER NOT NULL DEFAULT 0,
    avg_roas_x100 INTEGER NOT NULL DEFAULT 0,
    avg_frequency_x100 INTEGER NOT NULL DEFAULT 0,

    -- Time series (JSON int arrays — oldest first, same as profile_analytics)
    spend_7d TEXT NOT NULL DEFAULT '[]',                 -- [N×7] daily cents
    spend_30d TEXT NOT NULL DEFAULT '[]',                -- [N×30] daily cents
    spend_12m TEXT NOT NULL DEFAULT '[]',                -- [N×12] monthly cents
    spend_lifetime TEXT NOT NULL DEFAULT '{}',           -- {"YYYY-MM": cents}
    impressions_7d TEXT NOT NULL DEFAULT '[]',
    impressions_30d TEXT NOT NULL DEFAULT '[]',
    impressions_12m TEXT NOT NULL DEFAULT '[]',
    clicks_7d TEXT NOT NULL DEFAULT '[]',
    clicks_30d TEXT NOT NULL DEFAULT '[]',
    clicks_12m TEXT NOT NULL DEFAULT '[]',
    conversions_7d TEXT NOT NULL DEFAULT '[]',
    conversions_30d TEXT NOT NULL DEFAULT '[]',
    conversions_12m TEXT NOT NULL DEFAULT '[]',
    roas_7d TEXT NOT NULL DEFAULT '[]',                  -- [N×7] roas_x100 daily avg
    roas_30d TEXT NOT NULL DEFAULT '[]',

    -- Breakdown analytics (service-computed)
    platform_breakdown TEXT NOT NULL DEFAULT '{}',
    -- {"meta":{"spend":5000,"conversions":12},"google":{"spend":3000,"conversions":8}}
    objective_breakdown TEXT NOT NULL DEFAULT '{}',
    -- {"conversions":{"spend":4000,"roas_x100":420},"traffic":{"spend":2000}}
    device_breakdown TEXT NOT NULL DEFAULT '{}',
    -- {"mobile":{"impressions":8000,"spend":3500},"desktop":{"impressions":2000,"spend":500}}
    country_breakdown TEXT NOT NULL DEFAULT '{}',
    top_campaigns TEXT NOT NULL DEFAULT '[]',
    -- [{campaign_id, name, spend, roas_x100, status}] top-5 by ROAS

    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    last_aggregated_at INTEGER NOT NULL DEFAULT 0
  )"#,
    r#"CREATE TABLE IF NOT EXISTS ad_snapshots (
    account_id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,

    -- Rolling window for charts (replaced each sync)
    dates TEXT NOT NULL DEFAULT '[]',                   -- ['YYYY-MM-DD', ...]
    spend TEXT NOT NULL DEFAULT '[]',                   -- [cents, ...]
    impressions TEXT NOT NULL DEFAULT '[]',
    clicks TEXT NOT NULL DEFAULT '[]',
    conversions TEXT NOT NULL DEFAULT '[]',
    roas TEXT NOT NULL DEFAULT '[]',                    -- [roas_x100, ...]
    ctr TEXT NOT NULL DEFAULT '[]',                     -- [ctr_bps, ...]
    reach TEXT NOT NULL DEFAULT '[]',

    -- Campaign performance snapshot (top 10 by spend for dashboard table)
    top_campaigns_snapshot TEXT NOT NULL DEFAULT '[]',
    -- [{id, name, status, spend, impressions, clicks, conversions, roas_x100}]

    -- Period covered by this snapshot
    period_start TEXT,
    period_end TEXT,
    period_label TEXT,

    synced_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_ad_campaign_insert
   AFTER INSERT ON ad_campaigns
   BEGIN
     INSERT INTO ad_analytics (account_id, profile_id, total_campaigns,
       draft_campaigns, active_campaigns)
     VALUES (NEW.account_id, NEW.profile_id, 1,
       CASE WHEN NEW.status = 'draft'  THEN 1 ELSE 0 END,
       CASE WHEN NEW.status = 'active' THEN 1 ELSE 0 END
     )
     ON CONFLICT(account_id) DO UPDATE SET
       total_campaigns  = total_campaigns + 1,
       draft_campaigns  = draft_campaigns  + CASE WHEN NEW.status = 'draft'  THEN 1 ELSE 0 END,
       active_campaigns = active_campaigns + CASE WHEN NEW.status = 'active' THEN 1 ELSE 0 END,
       updated_at       = strftime('%s','now');

     UPDATE ad_accounts SET
       total_campaigns = total_campaigns + 1,
       updated_at      = strftime('%s','now')
     WHERE id = NEW.account_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_ad_campaign_activate
   AFTER UPDATE OF status ON ad_campaigns
   WHEN NEW.status = 'active' AND OLD.status != 'active'
   BEGIN
     UPDATE ad_analytics SET
       active_campaigns = active_campaigns + 1,
       draft_campaigns  = MAX(0, draft_campaigns  - CASE WHEN OLD.status = 'draft'    THEN 1 ELSE 0 END),
       paused_campaigns = MAX(0, paused_campaigns - CASE WHEN OLD.status = 'paused'   THEN 1 ELSE 0 END),
       ended_campaigns  = MAX(0, ended_campaigns  - CASE WHEN OLD.status IN ('ended','archived','rejected','error') THEN 1 ELSE 0 END),
       updated_at       = strftime('%s','now')
     WHERE account_id = NEW.account_id;

     UPDATE ad_accounts SET
       active_campaigns = active_campaigns + 1,
       updated_at       = strftime('%s','now')
     WHERE id = NEW.account_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_ad_campaign_pause
   AFTER UPDATE OF status ON ad_campaigns
   WHEN NEW.status IN ('paused','ended','archived')
     AND OLD.status = 'active'
   BEGIN
     UPDATE ad_analytics SET
       active_campaigns = MAX(0, active_campaigns - 1),
       paused_campaigns = paused_campaigns + CASE WHEN NEW.status = 'paused' THEN 1 ELSE 0 END,
       ended_campaigns  = ended_campaigns  + CASE WHEN NEW.status IN ('ended','archived') THEN 1 ELSE 0 END,
       updated_at       = strftime('%s','now')
     WHERE account_id = NEW.account_id;

     UPDATE ad_accounts SET
       active_campaigns = MAX(0, active_campaigns - 1),
       updated_at       = strftime('%s','now')
     WHERE id = NEW.account_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_ad_group_insert
   AFTER INSERT ON ad_groups
   BEGIN
     UPDATE ad_campaigns SET
       total_ad_groups  = total_ad_groups + 1,
       active_ad_groups = active_ad_groups + CASE WHEN NEW.status = 'active' THEN 1 ELSE 0 END,
       updated_at       = strftime('%s','now')
     WHERE id = NEW.campaign_id;

     UPDATE ad_accounts SET
       total_ad_groups = total_ad_groups + 1,
       updated_at      = strftime('%s','now')
     WHERE id = NEW.account_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_ad_insert
   AFTER INSERT ON ads
   BEGIN
     UPDATE ad_groups SET
       total_ads  = total_ads + 1,
       active_ads = active_ads + CASE WHEN NEW.status = 'active' THEN 1 ELSE 0 END,
       updated_at = strftime('%s','now')
     WHERE id = NEW.ad_group_id;

     UPDATE ad_campaigns SET
       total_ads  = total_ads + 1,
       active_ads = active_ads + CASE WHEN NEW.status = 'active' THEN 1 ELSE 0 END,
       updated_at = strftime('%s','now')
     WHERE id = NEW.campaign_id;

     UPDATE ad_accounts SET
       total_ads  = total_ads + 1,
       updated_at = strftime('%s','now')
     WHERE id = NEW.account_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_ad_spend_update
   AFTER UPDATE OF spend_cents ON ad_campaigns
   WHEN NEW.spend_cents != OLD.spend_cents
   BEGIN
     UPDATE ad_analytics SET
       total_spend_cents = total_spend_cents + (NEW.spend_cents - OLD.spend_cents),
       updated_at        = strftime('%s','now')
     WHERE account_id = NEW.account_id;

     UPDATE ad_accounts SET
       total_spend_cents = total_spend_cents + (NEW.spend_cents - OLD.spend_cents),
       updated_at        = strftime('%s','now')
     WHERE id = NEW.account_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_ad_conversion_update
   AFTER UPDATE OF conversions, revenue_cents ON ad_campaigns
   WHEN NEW.conversions != OLD.conversions OR NEW.revenue_cents != OLD.revenue_cents
   BEGIN
     UPDATE ad_analytics SET
       total_conversions  = total_conversions  + (NEW.conversions   - OLD.conversions),
       total_revenue_cents= total_revenue_cents+ (NEW.revenue_cents  - OLD.revenue_cents),
       updated_at         = strftime('%s','now')
     WHERE account_id = NEW.account_id;

     UPDATE ad_accounts SET
       total_conversions   = total_conversions   + (NEW.conversions   - OLD.conversions),
       total_revenue_cents = total_revenue_cents  + (NEW.revenue_cents  - OLD.revenue_cents),
       updated_at          = strftime('%s','now')
     WHERE id = NEW.account_id;
   END"#,
    r#"CREATE VIEW IF NOT EXISTS ads_agent_context_view AS
  SELECT
    aa.profile_id,
    COUNT(DISTINCT aa.id) AS total_accounts,
    GROUP_CONCAT(DISTINCT aa.platform) AS connected_platforms,

    -- Aggregate totals across all accounts for this profile
    SUM(COALESCE(ana.total_spend_cents, 0)) AS total_spend_cents,
    SUM(COALESCE(ana.total_impressions, 0)) AS total_impressions,
    SUM(COALESCE(ana.total_clicks, 0)) AS total_clicks,
    SUM(COALESCE(ana.total_conversions, 0)) AS total_conversions,
    SUM(COALESCE(ana.total_revenue_cents, 0)) AS total_revenue_cents,
    SUM(COALESCE(ana.total_reach, 0)) AS total_reach,
    SUM(COALESCE(aa.active_campaigns, 0)) AS total_active_campaigns,
    SUM(COALESCE(aa.total_campaigns, 0)) AS total_campaigns_all,

    -- Weighted avg ROAS (weight by spend)
    CASE
      WHEN SUM(COALESCE(ana.total_spend_cents, 0)) > 0
      THEN CAST(
        SUM(COALESCE(ana.avg_roas_x100, 0) * COALESCE(ana.total_spend_cents, 0))
        / SUM(COALESCE(ana.total_spend_cents, 0))
      AS INTEGER)
      ELSE 0
    END AS weighted_avg_roas_x100,

    -- Best performing platform (by ROAS)
    (
      SELECT a2.platform
      FROM ad_accounts a2
      LEFT JOIN ad_analytics an2 ON an2.account_id = a2.id
      WHERE a2.profile_id = aa.profile_id
        AND a2.is_active = 1
      ORDER BY COALESCE(an2.avg_roas_x100, 0) DESC
      LIMIT 1
    ) AS best_roas_platform,

    -- Top campaign (by spend)
    (
      SELECT c.name FROM ad_campaigns c
      WHERE c.profile_id = aa.profile_id AND c.status = 'active'
      ORDER BY c.spend_cents DESC LIMIT 1
    ) AS top_campaign_by_spend,
    (
      SELECT c.spend_cents FROM ad_campaigns c
      WHERE c.profile_id = aa.profile_id AND c.status = 'active'
      ORDER BY c.spend_cents DESC LIMIT 1
    ) AS top_campaign_spend_cents,

    -- Top campaign (by ROAS)
    (
      SELECT c.name FROM ad_campaigns c
      WHERE c.profile_id = aa.profile_id AND c.status = 'active'
        AND c.spend_cents > 1000
      ORDER BY c.roas_x100 DESC LIMIT 1
    ) AS top_campaign_by_roas,
    (
      SELECT c.roas_x100 FROM ad_campaigns c
      WHERE c.profile_id = aa.profile_id AND c.status = 'active'
        AND c.spend_cents > 1000
      ORDER BY c.roas_x100 DESC LIMIT 1
    ) AS top_campaign_roas_x100,

    -- Health: any accounts with token issues?
    SUM(CASE WHEN aa.token_status != 'valid' THEN 1 ELSE 0 END) AS unhealthy_accounts,
    MAX(COALESCE(aa.last_synced_at, 0)) AS newest_sync,

    -- Action hints for agent
    CASE
      WHEN SUM(COALESCE(aa.active_campaigns, 0)) = 0
        THEN 'No active campaigns. Create a campaign to start advertising.'
      WHEN SUM(COALESCE(ana.total_spend_cents, 0)) > 0
        AND CASE WHEN SUM(COALESCE(ana.total_spend_cents, 0)) > 0
          THEN CAST(SUM(COALESCE(ana.total_revenue_cents, 0)) AS REAL)
            / SUM(COALESCE(ana.total_spend_cents, 0)) * 100
          ELSE 0 END < 200
        THEN 'Average ROAS below 2x — review targeting, creative, and landing pages.'
      WHEN SUM(CASE WHEN aa.token_status != 'valid' THEN 1 ELSE 0 END) > 0
        THEN 'One or more ad accounts have expired tokens — reconnect in Settings.'
      ELSE 'Ads performance nominal.'
    END AS ads_action_hint

  FROM ad_accounts aa
  LEFT JOIN ad_analytics ana ON ana.account_id = aa.id
  WHERE aa.is_active = 1
  GROUP BY aa.profile_id"#,
    r#"CREATE VIEW IF NOT EXISTS ads_performance_view AS
  SELECT
    c.id,
    c.profile_id,
    c.account_id,
    c.name,
    c.platform,
    c.objective,
    c.status,
    c.budget_type,
    c.budget_cents,
    c.start_date,
    c.end_date,
    c.spend_cents,
    c.impressions,
    c.clicks,
    c.conversions,
    c.leads,
    c.revenue_cents,
    c.reach,
    ROUND(CAST(c.ctr_bps AS REAL) / 100.0, 2)           AS ctr_pct,
    ROUND(CAST(c.roas_x100 AS REAL) / 100.0, 2)          AS roas,
    c.cpc_cents,
    c.cpa_cents,
    c.cpm_cents,
    c.total_ad_groups,
    c.active_ad_groups,
    c.total_ads,
    c.active_ads,
    -- Budget utilization (for daily budget campaigns, estimates for lifetime)
    CASE
      WHEN c.budget_type = 'daily' AND c.budget_cents > 0
        THEN ROUND(CAST(c.spend_today_cents AS REAL) / c.budget_cents * 100, 1)
      WHEN c.budget_type = 'lifetime' AND c.budget_cents > 0
        THEN ROUND(CAST(c.spend_cents AS REAL) / c.budget_cents * 100, 1)
      ELSE 0
    END AS budget_utilization_pct,
    -- Efficiency label
    CASE
      WHEN c.spend_cents < 1000 THEN 'insufficient_data'
      WHEN c.roas_x100 >= 400   THEN 'excellent'
      WHEN c.roas_x100 >= 200   THEN 'good'
      WHEN c.roas_x100 >= 100   THEN 'break_even'
      WHEN c.roas_x100 > 0      THEN 'underperforming'
      ELSE 'no_conversions'
    END AS efficiency_label,
    c.last_synced_at,
    c.created_at
  FROM ad_campaigns c"#,
    r#"CREATE VIEW IF NOT EXISTS ads_budget_pacing_view AS
  SELECT
    c.id,
    c.profile_id,
    c.name,
    c.platform,
    c.status,
    c.budget_type,
    c.budget_cents,
    c.spend_cents,
    c.daily_budget_cents,
    c.start_date,
    c.end_date,
    -- Days remaining in campaign (NULL if no end_date)
    CASE
      WHEN c.end_date IS NOT NULL
        THEN CAST(
          (julianday(c.end_date) - julianday('now')) AS INTEGER
        )
      ELSE NULL
    END AS days_remaining,
    -- Ideal spend so far (lifetime budget campaigns)
    CASE
      WHEN c.budget_type = 'lifetime' AND c.start_date IS NOT NULL AND c.end_date IS NOT NULL
        THEN CAST(
          c.budget_cents *
          (julianday('now') - julianday(c.start_date)) /
          NULLIF(julianday(c.end_date) - julianday(c.start_date), 0)
        AS INTEGER)
      ELSE NULL
    END AS ideal_spend_to_date_cents,
    -- Pacing status
    CASE
      WHEN c.budget_type = 'lifetime'
        AND c.start_date IS NOT NULL AND c.end_date IS NOT NULL
        AND c.budget_cents > 0
        AND c.spend_cents > CAST(
          c.budget_cents *
          (julianday('now') - julianday(c.start_date)) /
          NULLIF(julianday(c.end_date) - julianday(c.start_date), 0)
        AS INTEGER) * 1.15
        THEN 'overpacing'
      WHEN c.budget_type = 'lifetime'
        AND c.start_date IS NOT NULL AND c.end_date IS NOT NULL
        AND c.budget_cents > 0
        AND c.spend_cents < CAST(
          c.budget_cents *
          (julianday('now') - julianday(c.start_date)) /
          NULLIF(julianday(c.end_date) - julianday(c.start_date), 0)
        AS INTEGER) * 0.70
        THEN 'underpacing'
      WHEN c.budget_cents > 0 AND c.spend_cents >= c.budget_cents
        THEN 'budget_exhausted'
      ELSE 'on_pace'
    END AS pacing_status,
    ROUND(CAST(c.roas_x100 AS REAL) / 100.0, 2) AS roas
  FROM ad_campaigns c
  WHERE c.status = 'active'"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
