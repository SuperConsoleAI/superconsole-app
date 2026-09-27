// src-tauri/src/db/schema/product_triggers.rs
use super::Migration;

// ─────────────────────────────────────────────────────────────────────────────
// product-triggers.ts — SQLite Triggers for Links & Products Analytics
//
// Why triggers over app-level aggregation:
//   - Zero CF Worker compute for high-frequency events (link clicks, purchases)
//   - Atomic — counters update in same transaction as the raw event row
//   - Agents / n8n / webhooks writing directly to DB stay in sync automatically
//   - At scale = massive Worker request savings (no aggregateLinkAnalytics() on
//     every page load required for the scalar totals)
//
// ── Triggers in this file ────────────────────────────────────────────────────
//
//   trg_link_click_insert   ← clicks_analytics INSERT
//                             → link_analytics  : total_clicks + 1  (UPSERT)
//                             → profile_analytics: total_clicks + 1 (UPSERT)
//
//   trg_purchase_insert     ← purchases INSERT  (payment_status = 'completed')
//                             → product_analytics: total_sales + 1
//                                                  total_revenue_cents += NEW.amount_cents
//                             → profile_analytics: total_sales + 1
//                                                  total_earnings += NEW.amount_cents
//
//   trg_purchase_refund     ← purchases UPDATE  (status → 'refunded')
//                             Exact reversal of trg_purchase_insert (MAX(0,…) guard)
//
// ── What these triggers do NOT handle ────────────────────────────────────────
//
//   Time-series JSON arrays (analytics_7d, analytics_30d, sales_30d, revenue_30d…)
//   are still computed by aggregateXxx() on page visits — SQLite cannot atomically
//   shift a JSON array. These triggers only own the scalar integer counters that
//   appear prominently in the UI ("Total Clicks", "Total Sales", "Total Earnings").
//
// ── Tables updated ────────────────────────────────────────────────────────────
//
//   link_analytics    — total_clicks               (per-link, already JOINed by UI)
//   profile_analytics — total_clicks               (profile-level sum)
//   product_analytics — total_sales, total_revenue_cents  (per-product)
//   profile_analytics — total_sales, total_earnings       (profile-level sum)
//
// ── Key design choices ────────────────────────────────────────────────────────
//
//   link_analytics uses UPSERT (INSERT … ON CONFLICT DO UPDATE) so the trigger
//   works even on the very first click before any app-side aggregation has run.
//
//   profile_analytics uses the same UPSERT pattern.
//
//   Revenue is NEW.amount_cents (real sale price), NOT a fixed +1.
//
//   No column added to links table — that table is already wide; total_clicks
//   lives in link_analytics where the UI already reads it via JOIN.
//
// ── How to apply ──────────────────────────────────────────────────────────────
//
//   provisionProductTriggers() is called from provisionUserDatabase() in
//   provision.ts after all SCHEMA_SQL tables are created.
//   All triggers use CREATE TRIGGER IF NOT EXISTS — safe to run repeatedly.
//   DROP TRIGGER IF EXISTS runs first so schema changes are always re-applied.
//
// ─────────────────────────────────────────────────────────────────────────────

pub const SCHEMA_SQL: &[&str] = &[
    r#"DROP TRIGGER IF EXISTS trg_link_click_insert"#,
    r#"DROP TRIGGER IF EXISTS trg_purchase_insert"#,
    r#"DROP TRIGGER IF EXISTS trg_purchase_refund"#,
    r#"DROP TRIGGER IF EXISTS trg_product_insert"#,
    r#"DROP TRIGGER IF EXISTS trg_product_delete"#,
    r#"DROP TRIGGER IF EXISTS trg_product_update_published"#,
    r#"DROP TRIGGER IF EXISTS trg_link_insert"#,
    r#"DROP TRIGGER IF EXISTS trg_link_delete"#,
    r#"DROP TRIGGER IF EXISTS trg_link_update_active"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_link_click_insert
   AFTER INSERT ON clicks_analytics
   BEGIN
     -- Per-link counter in link_analytics (UPSERT in case row doesn't exist yet)
     INSERT INTO link_analytics (id, link_id, profile_id, total_clicks, bot_clicks)
     VALUES (hex(randomblob(16)), NEW.link_id, NEW.profile_id, 1, COALESCE(NEW.is_bot, 0))
     ON CONFLICT(link_id) DO UPDATE SET
       total_clicks = total_clicks + 1,
       bot_clicks   = bot_clicks + COALESCE(NEW.is_bot, 0),
       updated_at   = strftime('%s','now');

     -- Profile-level total_clicks counter in profile_analytics
     INSERT INTO profile_analytics (id, profile_id, total_clicks, bot_clicks)
     VALUES (hex(randomblob(16)), NEW.profile_id, 1, COALESCE(NEW.is_bot, 0))
     ON CONFLICT(profile_id) DO UPDATE SET
       total_clicks = total_clicks + 1,
       bot_clicks   = bot_clicks + COALESCE(NEW.is_bot, 0),
       updated_at   = strftime('%s','now');

     -- Link Analytics By Category counter (with self-healing fallback)
     INSERT INTO link_analytics_by_category (
       id, profile_id, category_id, total_links, active_links, total_clicks, bot_clicks
     )
     SELECT 
       hex(randomblob(16)), NEW.profile_id, 
       l.category_id,
       (SELECT COUNT(*) FROM links WHERE category_id = l.category_id),
       (SELECT COUNT(*) FROM links WHERE category_id = l.category_id AND is_active = 1),
       1, COALESCE(NEW.is_bot, 0)
     FROM links l WHERE l.id = NEW.link_id
     ON CONFLICT(profile_id, category_id) DO UPDATE SET
       total_links  = (SELECT COUNT(*) FROM links WHERE category_id = EXCLUDED.category_id),
       active_links = (SELECT COUNT(*) FROM links WHERE category_id = EXCLUDED.category_id AND is_active = 1),
       total_clicks = total_clicks + 1,
       bot_clicks   = bot_clicks + COALESCE(NEW.is_bot, 0),
       updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_purchase_insert
   AFTER INSERT ON purchases
   WHEN NEW.payment_status = 'completed'
   BEGIN
     -- Per-product totals in product_analytics
     INSERT INTO product_analytics (id, product_id, profile_id, total_sales, total_revenue_cents)
     VALUES (hex(randomblob(16)), NEW.product_id, NEW.profile_id, 1, NEW.amount_cents)
     ON CONFLICT(product_id) DO UPDATE SET
       total_sales         = total_sales + 1,
       total_revenue_cents = total_revenue_cents + NEW.amount_cents,
       updated_at          = strftime('%s','now');

     -- Profile-level totals in profile_analytics
     INSERT INTO profile_analytics (id, profile_id, total_sales, total_earnings)
     VALUES (hex(randomblob(16)), NEW.profile_id, 1, NEW.amount_cents)
     ON CONFLICT(profile_id) DO UPDATE SET
       total_sales    = total_sales + 1,
       total_earnings = total_earnings + NEW.amount_cents,
       updated_at     = strftime('%s','now');

     -- CMS-level totals in cms_analytics (find cms_id by product type)
     INSERT INTO cms_analytics (id, cms_id, profile_id, total_sales, total_revenue)
     SELECT hex(randomblob(16)), c.id, NEW.profile_id, 1, NEW.amount_cents
     FROM products p
     JOIN cms c ON c.slug = p.type
     WHERE p.id = NEW.product_id
     ON CONFLICT(cms_id) DO UPDATE SET
       total_sales    = total_sales + 1,
       total_revenue  = total_revenue + NEW.amount_cents,
       updated_at     = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_product_insert
    AFTER INSERT ON products
    BEGIN
      INSERT INTO cms_analytics (
        id, cms_id, profile_id, total_posts, total_published, total_draft
      )
      SELECT 
        hex(randomblob(16)), c.id, NEW.profile_id, 1, 
        CASE WHEN NEW.published = 1 THEN 1 ELSE 0 END,
        CASE WHEN NEW.published = 0 THEN 1 ELSE 0 END
      FROM cms c WHERE c.slug = NEW.type
      ON CONFLICT(cms_id) DO UPDATE SET
        total_posts     = total_posts + 1,
        total_published = total_published + CASE WHEN NEW.published = 1 THEN 1 ELSE 0 END,
        total_draft     = total_draft + CASE WHEN NEW.published = 0 THEN 1 ELSE 0 END,
        updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now');
    END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_product_update_published
AFTER UPDATE OF published ON products
WHEN NEW.published != OLD.published
BEGIN
  INSERT INTO cms_analytics (
    id, cms_id, profile_id, total_posts, total_published, total_draft, created_at, updated_at
  )
  SELECT 
    hex(randomblob(16)), c.id, NEW.profile_id, 
    (SELECT COUNT(*) FROM products WHERE type = NEW.type),
    CASE WHEN NEW.published = 1 THEN 1 ELSE 0 END,
    CASE WHEN NEW.published = 0 THEN 1 ELSE 0 END,
    strftime('%Y-%m-%dT%H:%M:%SZ','now'),
    strftime('%Y-%m-%dT%H:%M:%SZ','now')
  FROM cms c WHERE c.slug = NEW.type
  ON CONFLICT(cms_id) DO UPDATE SET
    total_posts     = (SELECT COUNT(*) FROM products WHERE type = NEW.type),
    total_published = MAX(0, total_published + CASE WHEN NEW.published = 1 THEN 1 WHEN OLD.published = 1 THEN -1 ELSE 0 END),
    total_draft     = MAX(0, total_draft + CASE WHEN NEW.published = 0 THEN 1 WHEN OLD.published = 0 THEN -1 ELSE 0 END),
    updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now');
END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_product_delete
    AFTER DELETE ON products
    BEGIN
      UPDATE cms_analytics SET
        total_posts     = MAX(0, total_posts - 1),
        total_published = MAX(0, total_published - CASE WHEN OLD.published = 1 THEN 1 ELSE 0 END),
        total_draft     = MAX(0, total_draft - CASE WHEN OLD.published = 0 THEN 1 ELSE 0 END),
        updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE cms_id = (SELECT id FROM cms WHERE slug = OLD.type);
    END"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
