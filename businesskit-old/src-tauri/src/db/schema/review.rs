// src-tauri/src/db/schema/review.rs
use super::Migration;

// ─────────────────────────────────────────────────────────────────────────────
// review.ts — Review Management Schema + Provision Helpers
// ─────────────────────────────────────────────────────────────────────────────

pub const SCHEMA_SQL: &[&str] = &[
    r#"CREATE TABLE IF NOT EXISTS testimonials (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    slider_id TEXT,
    user_id TEXT,
    name TEXT NOT NULL,
    role TEXT,
    company TEXT,
    bio TEXT,
    avatar_url TEXT,
    logo_url TEXT,
    image_url TEXT,
    video_url TEXT,
    rating INTEGER NOT NULL DEFAULT 0,
    platform TEXT,
    text TEXT,
    source_url TEXT,
    published INTEGER NOT NULL DEFAULT 1,
    hidden INTEGER NOT NULL DEFAULT 0,
    google_review_id TEXT,
    is_verified INTEGER NOT NULL DEFAULT 0,
    ai_reply_generated TEXT,
    replied_at INTEGER,
    is_featured INTEGER NOT NULL DEFAULT 0,
    sentiment TEXT,
    source_synced_at INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_testimonials_profile ON testimonials (profile_id, created_at DESC)"#,
    r#"CREATE TABLE IF NOT EXISTS review_requests (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    contact_id TEXT,
    document_id TEXT,
    reservation_id TEXT,
    item_id TEXT,
    channel TEXT NOT NULL DEFAULT 'email',
    status TEXT NOT NULL DEFAULT 'pending',
    review_platform TEXT,
    google_place_id TEXT,
    review_link TEXT,
    sent_at INTEGER,
    opened_at INTEGER,
    clicked_at INTEGER,
    reviewed_at INTEGER,
    follow_up_count INTEGER NOT NULL DEFAULT 0,
    last_follow_up_at INTEGER,
    cooldown_until INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_review_requests_profile ON review_requests (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_review_requests_status ON review_requests (status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_review_requests_doc ON review_requests (document_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_review_requests_res ON review_requests (reservation_id)"#,
    r#"CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    contact_id TEXT,
    document_id TEXT,
    reservation_id TEXT,
    item_id TEXT,
    variant_id TEXT,
    direction TEXT NOT NULL DEFAULT 'guest_to_host',
    rating INTEGER,
    title TEXT,
    review_text TEXT,
    is_verified_purchase INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 1,
    response_text TEXT,
    responded_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_reviews_profile ON reviews (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_reviews_item ON reviews (profile_id, item_id, is_published)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_reviews_doc ON reviews (document_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_reviews_res ON reviews (reservation_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_reviews_contact ON reviews (contact_id)"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_reviews_item_insert
   AFTER INSERT ON reviews
   WHEN NEW.item_id IS NOT NULL
   BEGIN
     UPDATE shop_items SET
       avg_rating = ROUND(COALESCE((SELECT AVG(rating) FROM reviews WHERE item_id = NEW.item_id AND is_published = 1 AND rating IS NOT NULL), 0), 2),
       review_count = COALESCE((SELECT COUNT(*) FROM reviews WHERE item_id = NEW.item_id AND is_published = 1), 0),
       updated_at = strftime('%s','now')
     WHERE id = NEW.item_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_reviews_item_update
   AFTER UPDATE ON reviews
   WHEN NEW.item_id IS NOT NULL OR OLD.item_id IS NOT NULL
   BEGIN
     UPDATE shop_items SET
       avg_rating = ROUND(COALESCE((SELECT AVG(rating) FROM reviews WHERE item_id = NEW.item_id AND is_published = 1 AND rating IS NOT NULL), 0), 2),
       review_count = COALESCE((SELECT COUNT(*) FROM reviews WHERE item_id = NEW.item_id AND is_published = 1), 0),
       updated_at = strftime('%s','now')
     WHERE id = NEW.item_id;

     UPDATE shop_items SET
       avg_rating = ROUND(COALESCE((SELECT AVG(rating) FROM reviews WHERE item_id = OLD.item_id AND is_published = 1 AND rating IS NOT NULL), 0), 2),
       review_count = COALESCE((SELECT COUNT(*) FROM reviews WHERE item_id = OLD.item_id AND is_published = 1), 0),
       updated_at = strftime('%s','now')
     WHERE id = OLD.item_id AND OLD.item_id != NEW.item_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_reviews_item_delete
   AFTER DELETE ON reviews
   WHEN OLD.item_id IS NOT NULL
   BEGIN
     UPDATE shop_items SET
       avg_rating = ROUND(COALESCE((SELECT AVG(rating) FROM reviews WHERE item_id = OLD.item_id AND is_published = 1 AND rating IS NOT NULL), 0), 2),
       review_count = COALESCE((SELECT COUNT(*) FROM reviews WHERE item_id = OLD.item_id AND is_published = 1), 0),
       updated_at = strftime('%s','now')
     WHERE id = OLD.item_id;
   END"#,
    r#"CREATE TABLE IF NOT EXISTS reviews_synced (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    external_review_id TEXT,
    reviewer_name TEXT,
    reviewer_avatar TEXT,
    star_rating INTEGER NOT NULL DEFAULT 0,
    review_text TEXT,
    published_at INTEGER,
    platform_url TEXT,
    ai_reply TEXT,
    replied_at INTEGER,
    synced_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    is_published_on_profile INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_reviews_synced_profile ON reviews_synced (profile_id, created_at DESC)"#,
    r#"CREATE TABLE IF NOT EXISTS review_analytics (
    profile_id TEXT PRIMARY KEY,
    total_sent INTEGER NOT NULL DEFAULT 0,
    total_opened INTEGER NOT NULL DEFAULT 0,
    total_clicked INTEGER NOT NULL DEFAULT 0,
    total_reviews_generated INTEGER NOT NULL DEFAULT 0,
    avg_rating REAL NOT NULL DEFAULT 0,
    open_rate REAL NOT NULL DEFAULT 0,
    click_rate REAL NOT NULL DEFAULT 0,
    conversion_rate REAL NOT NULL DEFAULT 0,
    last_aggregated_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_testimonials_no_delete
   BEFORE DELETE ON testimonials
   BEGIN SELECT RAISE(ABORT, 'testimonials are append-only. Set hidden=1 instead.'); END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_review_request_insert
   AFTER INSERT ON review_requests
   BEGIN
     INSERT OR IGNORE INTO review_analytics (profile_id) VALUES (NEW.profile_id);
     
     UPDATE review_analytics SET
       total_sent = total_sent + CASE WHEN NEW.status != 'pending' THEN 1 ELSE 0 END,
       updated_at = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_review_request_status_update
   AFTER UPDATE OF status ON review_requests
   WHEN NEW.status != OLD.status
   BEGIN
     UPDATE review_analytics SET
       total_sent = total_sent + CASE WHEN OLD.status = 'pending' AND NEW.status != 'pending' THEN 1 ELSE 0 END,
       total_opened = total_opened + CASE WHEN NEW.status IN ('opened', 'clicked', 'reviewed') AND OLD.status NOT IN ('opened', 'clicked', 'reviewed') THEN 1 ELSE 0 END,
       total_clicked = total_clicked + CASE WHEN NEW.status IN ('clicked', 'reviewed') AND OLD.status NOT IN ('clicked', 'reviewed') THEN 1 ELSE 0 END,
       total_reviews_generated = total_reviews_generated + CASE WHEN NEW.status = 'reviewed' AND OLD.status != 'reviewed' THEN 1 ELSE 0 END,
       updated_at = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_review_synced_insert
   AFTER INSERT ON reviews_synced
   BEGIN
     INSERT OR IGNORE INTO review_analytics (profile_id) VALUES (NEW.profile_id);
     
     UPDATE review_analytics SET
       total_reviews_generated = total_reviews_generated + 1,
       updated_at = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END"#,
    r#"CREATE VIEW vw_review_analytics AS
   SELECT 
     ra.profile_id,
     ra.total_sent,
     ra.total_opened,
     ra.total_clicked,
     ra.total_reviews_generated,
     ra.last_aggregated_at,
     ra.updated_at,
     -- Calculate rates dynamically on the fly to prevent needing schema changes later
     CASE WHEN ra.total_sent > 0 THEN ROUND(CAST(ra.total_opened AS REAL) / ra.total_sent * 100, 2) ELSE 0 END AS open_rate,
     CASE WHEN ra.total_opened > 0 THEN ROUND(CAST(ra.total_clicked AS REAL) / ra.total_opened * 100, 2) ELSE 0 END AS click_rate,
     CASE WHEN ra.total_sent > 0 THEN ROUND(CAST(ra.total_reviews_generated AS REAL) / ra.total_sent * 100, 2) ELSE 0 END AS conversion_rate,
     -- Dynamically compute the global average rating across synced, testimonials, and native reviews
     COALESCE((
        SELECT ROUND(AVG(rating), 2)
        FROM (
          SELECT star_rating as rating FROM reviews_synced WHERE profile_id = ra.profile_id AND star_rating > 0
          UNION ALL
          SELECT rating FROM testimonials WHERE profile_id = ra.profile_id AND rating > 0
          UNION ALL
          SELECT rating FROM reviews WHERE profile_id = ra.profile_id AND rating > 0 AND is_published = 1
        )
     ), 0) AS avg_rating
   FROM review_analytics ra;"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
