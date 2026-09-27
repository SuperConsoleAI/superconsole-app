// src-tauri/src/db/schema/community.rs
use super::Migration;

// ─────────────────────────────────────────────────────────────────────────────
// community.ts — Community Schema + Provision Helpers
// Mirrors the pattern of social.ts.
// All SQL is sourced from community.md spec.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// USERDB SCHEMA — provisioned via provision.ts → provisionUserDatabase()
// ─────────────────────────────────────────────────────────────────────────────

pub const SCHEMA_SQL: &[&str] = &[
    r#"CREATE TABLE IF NOT EXISTS communities (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    slider_id TEXT,
    external_product_id TEXT,
    ai_summary TEXT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    tagline TEXT,
    support_email TEXT,
    cover_image_url TEXT,
    logo_url TEXT,
    links TEXT NOT NULL DEFAULT '[]',
    media_items TEXT NOT NULL DEFAULT '[]',
    access_type TEXT NOT NULL DEFAULT 'free',
    price_cents INTEGER NOT NULL DEFAULT 0,
    sale_price_cents INTEGER,
    currency TEXT NOT NULL DEFAULT 'usd',
    billing_interval TEXT,
    trial_days INTEGER NOT NULL DEFAULT 0,
    pricing_plans TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    is_public INTEGER NOT NULL DEFAULT 1,
    published INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    settings TEXT NOT NULL DEFAULT '{}',
    who_can_post TEXT NOT NULL DEFAULT 'member',
    level_name TEXT,
    seo_title TEXT,
    seo_description TEXT,
    seo_og_image TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    forms_id TEXT
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_communities_profile
    ON communities (profile_id, created_at DESC)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_communities_slug
    ON communities (slug)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_communities_active
    ON communities (profile_id, is_active, published)"#,
    r#"CREATE TABLE IF NOT EXISTS community_categories (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    icon TEXT,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    allow_member_posts INTEGER NOT NULL DEFAULT 1,
    color TEXT,
    post_count INTEGER NOT NULL DEFAULT 0,
    space_type TEXT NOT NULL DEFAULT 'discussion',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_categories_community
    ON community_categories (community_id, sort_order ASC)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_community_categories_slug
    ON community_categories (community_id, slug)"#,
    r#"CREATE TABLE IF NOT EXISTS community_members (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    user_id TEXT,
    email TEXT,
    transaction_id TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'active',
    ban_reason TEXT,
    banned_at INTEGER,
    banned_by TEXT,
    access_token TEXT NOT NULL UNIQUE,
    access_token_expires_at INTEGER,
    payment_processor TEXT,
    payment_reference TEXT,
    payment_status TEXT,
    amount_paid_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'usd',
    billing_interval TEXT,
    trial_ends_at INTEGER,
    current_period_end INTEGER,
    cancelled_at INTEGER,
    cancellation_reason TEXT,
    gateway_subscription_id TEXT,
    gateway_customer_id TEXT,
    purchase_id TEXT,
    tier TEXT,
    notification_prefs TEXT NOT NULL DEFAULT '{}',
    is_hidden INTEGER NOT NULL DEFAULT 0,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    device TEXT,
    country TEXT,
    city TEXT,
    joined_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_members_community
    ON community_members (community_id, joined_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_members_user_id
    ON community_members (user_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_members_status
    ON community_members (community_id, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_members_role
    ON community_members (community_id, role)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_members_token
    ON community_members (access_token)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_members_tier
    ON community_members (community_id, tier)"#,
    r#"CREATE TABLE IF NOT EXISTS community_posts (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    slider_id TEXT,
    member_id TEXT NOT NULL,
    category_id TEXT,
    title TEXT,
    body TEXT NOT NULL,
    body_plain TEXT,
    media_items TEXT NOT NULL DEFAULT '[]',
    link_url TEXT,
    link_title TEXT,
    link_description TEXT,
    link_thumbnail_url TEXT,
    post_type TEXT NOT NULL DEFAULT 'post',
    poll_data TEXT,
    event_id TEXT,
    status TEXT NOT NULL DEFAULT 'published',
    rejection_reason TEXT,
    removed_by TEXT,
    removed_at INTEGER,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    is_featured INTEGER NOT NULL DEFAULT 0,
    is_announcement INTEGER NOT NULL DEFAULT 0,
    pin_expires_at INTEGER,
    hidden INTEGER NOT NULL DEFAULT 0,
    like_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    view_count INTEGER NOT NULL DEFAULT 0,
    bot_views INTEGER NOT NULL DEFAULT 0,
    hot_score REAL NOT NULL DEFAULT 0,
    slug TEXT,
    ai_summary TEXT,
    flagged_by_ai INTEGER NOT NULL DEFAULT 0,
    ai_flag_reason TEXT,
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate posts
    idempotency_key TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_posts_community
    ON community_posts (community_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_posts_category
    ON community_posts (category_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_posts_member
    ON community_posts (member_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_posts_pinned
    ON community_posts (community_id, is_pinned DESC, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_posts_status
    ON community_posts (community_id, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_posts_hot
    ON community_posts (community_id, hot_score DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_posts_slug
    ON community_posts (community_id, slug)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_community_posts_idem
    ON community_posts (idempotency_key) WHERE idempotency_key IS NOT NULL"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_posts_board_status
    ON community_posts (community_id, status, created_at DESC)"#,
    r#"CREATE TABLE IF NOT EXISTS community_post_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    community_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    is_bot INTEGER NOT NULL DEFAULT 0,
    viewed_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_community_post_views_unique
    ON community_post_views (member_id, post_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_post_views_post
    ON community_post_views (post_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_post_views_member
    ON community_post_views (member_id, viewed_at DESC)"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_community_post_view_insert
   AFTER INSERT ON community_post_views
   BEGIN
     UPDATE community_posts SET
       view_count = view_count + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
       bot_views = bot_views + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END
     WHERE id = NEW.post_id;
   END"#,
    r#"CREATE TABLE IF NOT EXISTS community_comments (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    parent_id TEXT,
    member_id TEXT NOT NULL,
    body TEXT NOT NULL,
    body_plain TEXT,
    media_items TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'published',
    removed_by TEXT,
    removed_at INTEGER,
    hidden INTEGER NOT NULL DEFAULT 0,
    like_count INTEGER NOT NULL DEFAULT 0,
    reply_count INTEGER NOT NULL DEFAULT 0,
    flagged_by_ai INTEGER NOT NULL DEFAULT 0,
    ai_flag_reason TEXT,
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate comments
    idempotency_key TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_comments_post
    ON community_comments (post_id, created_at ASC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_comments_parent
    ON community_comments (parent_id, created_at ASC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_comments_member
    ON community_comments (member_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_comments_community
    ON community_comments (community_id, created_at DESC)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_community_comments_idem
    ON community_comments (idempotency_key) WHERE idempotency_key IS NOT NULL"#,
    r#"CREATE TABLE IF NOT EXISTS community_post_reactions (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reaction TEXT NOT NULL DEFAULT 'like',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_community_reactions_unique
    ON community_post_reactions (member_id, target_type, target_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_reactions_target
    ON community_post_reactions (target_type, target_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_reactions_community
    ON community_post_reactions (community_id, created_at DESC)"#,
    r#"CREATE TABLE IF NOT EXISTS community_events (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    member_id TEXT NOT NULL,
    category_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    event_type TEXT NOT NULL DEFAULT 'online',
    meeting_url TEXT,
    location TEXT,
    starts_at INTEGER NOT NULL,
    ends_at INTEGER,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    is_all_day INTEGER NOT NULL DEFAULT 0,
    recurring TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    hidden INTEGER NOT NULL DEFAULT 0,
    rsvp_count INTEGER NOT NULL DEFAULT 0,
    max_attendees INTEGER,
    stream_provider TEXT,
    stream_url TEXT,
    recording_url TEXT,
    stream_status TEXT DEFAULT 'scheduled',
    viewer_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_events_community
    ON community_events (community_id, starts_at ASC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_events_upcoming
    ON community_events (community_id, is_active, starts_at ASC)"#,
    r#"CREATE TABLE IF NOT EXISTS community_event_rsvps (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'yes',
    note TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_community_event_rsvps_unique
    ON community_event_rsvps (event_id, member_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_event_rsvps_event
    ON community_event_rsvps (event_id, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_event_rsvps_member
    ON community_event_rsvps (member_id)"#,
    r#"CREATE TABLE IF NOT EXISTS community_leaderboard (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    member_id TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    points_total INTEGER NOT NULL DEFAULT 0,
    points_7d INTEGER NOT NULL DEFAULT 0,
    points_30d INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    streak_days INTEGER NOT NULL DEFAULT 0,
    streak_best INTEGER NOT NULL DEFAULT 0,
    post_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    likes_received INTEGER NOT NULL DEFAULT 0,
    likes_given INTEGER NOT NULL DEFAULT 0,
    lessons_completed INTEGER NOT NULL DEFAULT 0,
    rank_overall INTEGER,
    rank_7d INTEGER,
    rank_30d INTEGER,
    rank_updated_at INTEGER,
    joined_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    last_active_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_leaderboard_community
    ON community_leaderboard (community_id, points_total DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_leaderboard_7d
    ON community_leaderboard (community_id, points_7d DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_leaderboard_30d
    ON community_leaderboard (community_id, points_30d DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_leaderboard_streak
    ON community_leaderboard (community_id, streak_days DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_members_payment
    ON community_members (community_id, payment_status)"#,
    r#"CREATE TABLE IF NOT EXISTS community_badges (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT NOT NULL DEFAULT '#6366f1',
    is_active INTEGER NOT NULL DEFAULT 1,
    is_auto_award INTEGER NOT NULL DEFAULT 0,
    auto_award_condition TEXT,
    award_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_badges_community
    ON community_badges (community_id, is_active)"#,
    r#"CREATE TABLE IF NOT EXISTS community_member_badges (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    badge_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    awarded_by TEXT,
    note TEXT,
    awarded_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_member_badges_member
    ON community_member_badges (member_id, awarded_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_member_badges_badge
    ON community_member_badges (badge_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_member_badges_community
    ON community_member_badges (community_id, awarded_at DESC)"#,
    r#"CREATE TABLE IF NOT EXISTS community_dms (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    body TEXT NOT NULL,
    media_items TEXT NOT NULL DEFAULT '[]',
    is_read INTEGER NOT NULL DEFAULT 0,
    read_at INTEGER,
    hidden_by_sender INTEGER NOT NULL DEFAULT 0,
    hidden_by_recipient INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_dms_conversation
    ON community_dms (conversation_id, created_at ASC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_dms_recipient_unread
    ON community_dms (recipient_id, is_read, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_dms_sender
    ON community_dms (sender_id, created_at DESC)"#,
    r#"CREATE TABLE IF NOT EXISTS community_notifications (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    type TEXT NOT NULL,
    actor_id TEXT,
    entity_type TEXT,
    entity_id TEXT,
    title TEXT NOT NULL,
    body TEXT,
    action_url TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    read_at INTEGER,
    is_emailed INTEGER NOT NULL DEFAULT 0,
    emailed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_notifications_member
    ON community_notifications (member_id, is_read, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_notifications_community
    ON community_notifications (community_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_community_notifications_unread
    ON community_notifications (member_id, is_read)"#,
    r#"CREATE TABLE IF NOT EXISTS community_analytics (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL UNIQUE,
    profile_id TEXT NOT NULL,
    total_members INTEGER NOT NULL DEFAULT 0,
    active_members_7d INTEGER NOT NULL DEFAULT 0,
    active_members_30d INTEGER NOT NULL DEFAULT 0,
    paid_members INTEGER NOT NULL DEFAULT 0,
    free_members INTEGER NOT NULL DEFAULT 0,
    churned_members INTEGER NOT NULL DEFAULT 0,
    pending_members INTEGER NOT NULL DEFAULT 0,
    total_posts INTEGER NOT NULL DEFAULT 0,
    total_comments INTEGER NOT NULL DEFAULT 0,
    total_reactions INTEGER NOT NULL DEFAULT 0,
    total_lessons INTEGER NOT NULL DEFAULT 0,
    total_lesson_completions INTEGER NOT NULL DEFAULT 0,
    total_revenue_cents INTEGER NOT NULL DEFAULT 0,
    mrr_cents INTEGER NOT NULL DEFAULT 0,
    arr_cents INTEGER NOT NULL DEFAULT 0,
    avg_posts_per_member REAL NOT NULL DEFAULT 0,
    avg_comments_per_post REAL NOT NULL DEFAULT 0,
    avg_completion_rate_pct INTEGER NOT NULL DEFAULT 0,
    bot_views INTEGER NOT NULL DEFAULT 0,
    total_views INTEGER NOT NULL DEFAULT 0,
    views_device_breakdown TEXT NOT NULL DEFAULT '{}',
    views_os_breakdown TEXT NOT NULL DEFAULT '{}',
    views_browser_breakdown TEXT NOT NULL DEFAULT '{}',
    views_country_breakdown TEXT NOT NULL DEFAULT '{}',
    views_city_breakdown TEXT NOT NULL DEFAULT '{}',
    views_referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    views_7d TEXT NOT NULL DEFAULT '[]',
    views_30d TEXT NOT NULL DEFAULT '[]',
    views_12m TEXT NOT NULL DEFAULT '[]',
    views_lifetime TEXT NOT NULL DEFAULT '{}',
    members_7d TEXT NOT NULL DEFAULT '[]',
    members_30d TEXT NOT NULL DEFAULT '[]',
    members_12m TEXT NOT NULL DEFAULT '[]',
    members_lifetime TEXT NOT NULL DEFAULT '{}',
    posts_7d TEXT NOT NULL DEFAULT '[]',
    posts_30d TEXT NOT NULL DEFAULT '[]',
    posts_12m TEXT NOT NULL DEFAULT '[]',
    revenue_7d TEXT NOT NULL DEFAULT '[]',
    revenue_30d TEXT NOT NULL DEFAULT '[]',
    revenue_12m TEXT NOT NULL DEFAULT '[]',
    country_breakdown TEXT NOT NULL DEFAULT '{}',
    device_breakdown TEXT NOT NULL DEFAULT '{}',
    referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    utm_source_breakdown TEXT NOT NULL DEFAULT '{}',
    category_post_breakdown TEXT NOT NULL DEFAULT '{}',
    -- Online count: members active in the last hour.
    -- Written by the community aggregator (reads community_online_view).
    -- Valid for 1 hour — stale is acceptable for a sidebar stat.
    online_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    last_aggregated_at INTEGER NOT NULL DEFAULT 0
  )"#,
    r#"CREATE VIEW IF NOT EXISTS community_leaderboard_view AS
SELECT
  cl.id,
  cl.community_id,
  cl.member_id,

  -- Live display name from users table (never stale)
  COALESCE(
    NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''),
    u.email,
    cl.display_name
  ) AS display_name,

  -- Live avatar from users table
  COALESCE(u.profile_picture_url, cl.avatar_url) AS avatar_url,

  cl.points_total,
  cl.post_count,
  cl.comment_count,
  cl.likes_received,
  cl.lessons_completed,
  cl.streak_days,
  cl.streak_best,
  cl.level,
  cl.joined_at,
  cl.last_active_at,
  cl.updated_at,

  -- TRUE 7-day rolling window counted directly from source tables
  COALESCE((
    SELECT COUNT(*) FROM community_posts p
    WHERE p.member_id = cl.member_id AND p.community_id = cl.community_id
      AND p.hidden = 0 AND p.status = 'published'
      AND p.created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', datetime('now', '-7 days'))
  ), 0) +
  COALESCE((
    SELECT COUNT(*) FROM community_comments c
    WHERE c.member_id = cl.member_id AND c.community_id = cl.community_id
      AND c.hidden = 0 AND c.status = 'published'
      AND c.created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', datetime('now', '-7 days'))
  ), 0) +
  COALESCE((
    SELECT COUNT(*) FROM community_post_reactions r
      JOIN community_posts p2 ON p2.id = r.target_id AND r.target_type = 'post'
    WHERE p2.member_id = cl.member_id AND r.community_id = cl.community_id
      AND r.created_at >= strftime('%s','now') - 604800
  ), 0) +
  COALESCE((
    SELECT COUNT(*) FROM community_post_reactions r
      JOIN community_comments c2 ON c2.id = r.target_id AND r.target_type = 'comment'
    WHERE c2.member_id = cl.member_id AND r.community_id = cl.community_id
      AND r.created_at >= strftime('%s','now') - 604800
  ), 0) AS points_7d,

  -- TRUE 30-day rolling window
  COALESCE((
    SELECT COUNT(*) FROM community_posts p
    WHERE p.member_id = cl.member_id AND p.community_id = cl.community_id
      AND p.hidden = 0 AND p.status = 'published'
      AND p.created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', datetime('now', '-30 days'))
  ), 0) +
  COALESCE((
    SELECT COUNT(*) FROM community_comments c
    WHERE c.member_id = cl.member_id AND c.community_id = cl.community_id
      AND c.hidden = 0 AND c.status = 'published'
      AND c.created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', datetime('now', '-30 days'))
  ), 0) +
  COALESCE((
    SELECT COUNT(*) FROM community_post_reactions r
      JOIN community_posts p2 ON p2.id = r.target_id AND r.target_type = 'post'
    WHERE p2.member_id = cl.member_id AND r.community_id = cl.community_id
      AND r.created_at >= strftime('%s','now') - 2592000
  ), 0) +
  COALESCE((
    SELECT COUNT(*) FROM community_post_reactions r
      JOIN community_comments c2 ON c2.id = r.target_id AND r.target_type = 'comment'
    WHERE c2.member_id = cl.member_id AND r.community_id = cl.community_id
      AND r.created_at >= strftime('%s','now') - 2592000
  ), 0) AS points_30d,

  -- Live ranks via SQLite window functions — no cron, always correct
  RANK() OVER (PARTITION BY cl.community_id ORDER BY cl.points_total DESC) AS rank_overall,
  RANK() OVER (PARTITION BY cl.community_id ORDER BY (
    COALESCE((SELECT COUNT(*) FROM community_posts p WHERE p.member_id=cl.member_id AND p.community_id=cl.community_id AND p.hidden=0 AND p.status='published' AND p.created_at>=strftime('%Y-%m-%dT%H:%M:%SZ',datetime('now','-7 days'))),0) +
    COALESCE((SELECT COUNT(*) FROM community_comments c WHERE c.member_id=cl.member_id AND c.community_id=cl.community_id AND c.hidden=0 AND c.status='published' AND c.created_at>=strftime('%Y-%m-%dT%H:%M:%SZ',datetime('now','-7 days'))),0) +
    COALESCE((SELECT COUNT(*) FROM community_post_reactions r JOIN community_posts p2 ON p2.id=r.target_id AND r.target_type='post' WHERE p2.member_id=cl.member_id AND r.community_id=cl.community_id AND r.created_at>=strftime('%s','now')-604800),0) +
    COALESCE((SELECT COUNT(*) FROM community_post_reactions r JOIN community_comments c2 ON c2.id=r.target_id AND r.target_type='comment' WHERE c2.member_id=cl.member_id AND r.community_id=cl.community_id AND r.created_at>=strftime('%s','now')-604800),0)
  ) DESC) AS rank_7d,
  RANK() OVER (PARTITION BY cl.community_id ORDER BY (
    COALESCE((SELECT COUNT(*) FROM community_posts p WHERE p.member_id=cl.member_id AND p.community_id=cl.community_id AND p.hidden=0 AND p.status='published' AND p.created_at>=strftime('%Y-%m-%dT%H:%M:%SZ',datetime('now','-30 days'))),0) +
    COALESCE((SELECT COUNT(*) FROM community_comments c WHERE c.member_id=cl.member_id AND c.community_id=cl.community_id AND c.hidden=0 AND c.status='published' AND c.created_at>=strftime('%Y-%m-%dT%H:%M:%SZ',datetime('now','-30 days'))),0) +
    COALESCE((SELECT COUNT(*) FROM community_post_reactions r JOIN community_posts p2 ON p2.id=r.target_id AND r.target_type='post' WHERE p2.member_id=cl.member_id AND r.community_id=cl.community_id AND r.created_at>=strftime('%s','now')-2592000),0) +
    COALESCE((SELECT COUNT(*) FROM community_post_reactions r JOIN community_comments c2 ON c2.id=r.target_id AND r.target_type='comment' WHERE c2.member_id=cl.member_id AND r.community_id=cl.community_id AND r.created_at>=strftime('%s','now')-2592000),0)
  ) DESC) AS rank_30d

FROM community_leaderboard cl
LEFT JOIN community_members cm ON cm.id = cl.member_id
LEFT JOIN users u ON u.id = cm.user_id;"#,
    r#"CREATE VIEW IF NOT EXISTS community_online_view AS
SELECT
  community_id,
  COUNT(*) AS online_count
FROM community_leaderboard
WHERE updated_at > (strftime('%s','now') - 3600)
GROUP BY community_id"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
