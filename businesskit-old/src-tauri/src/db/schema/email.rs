// src-tauri/src/db/schema/email.rs
use super::Migration;

// ─────────────────────────────────────────────────────────────────────────────
// email-tracking.ts — Schema + Triggers only
// Place at: src/lib/email-tracking.ts
//
// Tables added to UserDB:
//   email_events          — append-only, one row per tracking event
//   newsletter_stats      — 1 row per newsletter  (open/click/bounce/unsub counts)
//   email_tracking_stats  — 1 row per profile     (global health + subscriber analytics)
//
// email_events key columns:
//   newsletter_id  → FK newsletter.id  (NULL for transactional/CRM)
//   purchase_id    → FK purchases.id   (NULL for newsletter/CRM)
//   product_id     → FK products.id    (denormalized for trigger lookup)
//   proposal_id    → FK crm_proposals.id (NULL unless tracking a proposal email)
//   invoice_id     → FK crm_invoices.id  (NULL unless tracking an invoice email)
//   Exactly ONE of newsletter_id | purchase_id | proposal_id | invoice_id is non-NULL.
//
// Columns added via migrations:
//   product_analytics  → email_open, email_clicks
//   profile_analytics  → product_email_open, product_email_clicks
//   subscribers        → blocked_at, unsubscribed_at, block_reason
//                        (is_blocked, is_unsubscribed already in new-DB definition)
//   email_events       → proposal_id, invoice_id
//
// Triggers (17 total):
//   trg_email_block_on_bounce        bounce      → subscribers.is_blocked = 1
//   trg_email_block_on_complaint     complaint   → subscribers.is_blocked = 1
//   trg_email_unsubscribe            unsubscribe → subscribers.is_unsubscribed = 1
//   trg_email_stats_open_newsletter  open(nl)    → newsletter_stats.open_count + 1
//   trg_email_stats_open_product     open(tx)    → product_analytics.email_open + 1
//   trg_email_stats_click_newsletter click(nl)   → newsletter_stats.click_count + 1
//   trg_email_stats_click_product    click(tx)   → product_analytics.email_clicks + 1
//   trg_email_stats_bounce           bounce      → newsletter_stats.bounce_count + 1
//   trg_email_stats_complaint        complaint   → newsletter_stats.complaint_count + 1
//   trg_email_stats_unsubscribe      unsubscribe → newsletter_stats.unsubscribe_count + 1
//   trg_subscriber_insert            INSERT      → email_tracking_stats.total_subscribers + 1
//   trg_subscriber_block             is_blocked flip   → total_blocked + 1
//   trg_subscriber_unsub             is_unsubscribed flip → total_unsubscribed + 1
//   trg_email_stats_open_proposal    open(crm proposal)  → crm_proposals.view_count + 1
//   trg_email_stats_click_proposal   click(crm proposal) → email_tracking_stats.total_clicks + 1
//   trg_email_stats_open_invoice     open(crm invoice)   → crm_invoices.view_count + 1
//   trg_email_stats_click_invoice    click(crm invoice)  → email_tracking_stats.total_clicks + 1
//
// Central DB sync (app layer — triggers cannot make HTTP calls):
//   centralSyncOnBlock()  — syncs is_blocked=1 to Central DB after bounce/complaint
//   centralSyncOnUnsub()  — syncs is_unsubscribed=1 to Central DB after unsubscribe
//
// Aggregate subscriber analytics (NOT in triggers — refreshed on demand):
//   subscriber_7d/30d/12m/lifetime, device/os/browser/country/city/referrer/utm
//   Updated by EmailTrackingService.refreshSubscriberAnalytics() when user opens
//   the subscriber analytics page (same pattern as community leaderboard ranks).
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA SQL
// Spread into provision.ts → SCHEMA_SQL: ...EMAIL_TRACKING_SCHEMA_SQL
// ─────────────────────────────────────────────────────────────────────────────

pub const SCHEMA_SQL: &[&str] = &[
    r#"CREATE TABLE IF NOT EXISTS email_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,

    newsletter_id TEXT,           -- FK → newsletter.id      (NULL for non-newsletter)
    campaign_id TEXT,             -- FK → crm_campaigns.id   (NULL for non-campaign)
    purchase_id TEXT,             -- FK → purchases.id       (NULL for non-transactional)
    product_id TEXT,              -- FK → products.id        (denormalized for trigger lookup)
    proposal_id TEXT,             -- FK → crm_proposals.id   (NULL unless proposal email)
    invoice_id TEXT,              -- FK → crm_invoices.id    (NULL unless invoice email)
    -- Exactly ONE of: newsletter_id | campaign_id | purchase_id | proposal_id | invoice_id is set.

    subscriber_id TEXT NOT NULL,  -- FK → subscribers.id
    email TEXT NOT NULL,          -- denormalized — safe even if subscriber row deleted

    event_type TEXT NOT NULL,
    -- 'open' | 'click' | 'bounce' | 'complaint' | 'unsubscribe'

    click_url TEXT,               -- decoded redirect target URL (click events only)

    ses_message_id TEXT,          -- SES Message-ID for deduplication
    ses_event_raw TEXT,           -- raw SES event JSON (audit/debug)

    user_agent TEXT,
    ip_address TEXT,
    country TEXT,

    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_email_events_profile    ON email_events (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_email_events_newsletter ON email_events (newsletter_id, event_type)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_email_events_campaign   ON email_events (campaign_id, event_type)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_email_events_purchase   ON email_events (purchase_id, event_type)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_email_events_product    ON email_events (product_id, event_type)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_email_events_proposal   ON email_events (proposal_id, event_type)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_email_events_invoice    ON email_events (invoice_id, event_type)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_email_events_subscriber ON email_events (subscriber_id, event_type)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_email_events_type       ON email_events (profile_id, event_type, created_at DESC)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_ses_dedup
     ON email_events (ses_message_id, event_type)
     WHERE ses_message_id IS NOT NULL"#,
    r#"CREATE TABLE IF NOT EXISTS newsletter_stats (
    newsletter_id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,

    sent_count INTEGER NOT NULL DEFAULT 0,
    open_count INTEGER NOT NULL DEFAULT 0,
    unique_open_count INTEGER NOT NULL DEFAULT 0,
    click_count INTEGER NOT NULL DEFAULT 0,
    unique_click_count INTEGER NOT NULL DEFAULT 0,
    unsubscribe_count INTEGER NOT NULL DEFAULT 0,
    bounce_count INTEGER NOT NULL DEFAULT 0,
    complaint_count INTEGER NOT NULL DEFAULT 0,

    -- Basis points (10000 = 100.00%) — updated by stats refresh
    open_rate_bps INTEGER NOT NULL DEFAULT 0,
    click_rate_bps INTEGER NOT NULL DEFAULT 0,
    bounce_rate_bps INTEGER NOT NULL DEFAULT 0,

    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_newsletter_stats_profile ON newsletter_stats (profile_id)"#,
    r#"CREATE TABLE IF NOT EXISTS email_tracking_stats (
    profile_id TEXT PRIMARY KEY,

    -- Email health (trigger-updated)
    total_sent INTEGER NOT NULL DEFAULT 0,
    total_opens INTEGER NOT NULL DEFAULT 0,
    total_clicks INTEGER NOT NULL DEFAULT 0,
    total_unsubscribes INTEGER NOT NULL DEFAULT 0,
    total_bounces INTEGER NOT NULL DEFAULT 0,
    total_complaints INTEGER NOT NULL DEFAULT 0,

    -- Subscriber list health (trigger-updated)
    total_subscribers INTEGER NOT NULL DEFAULT 0,
    total_blocked INTEGER NOT NULL DEFAULT 0,
    total_unsubscribed INTEGER NOT NULL DEFAULT 0,

    -- Growth time series (refreshed on demand)
    subscriber_7d TEXT NOT NULL DEFAULT '[]',
    subscriber_30d TEXT NOT NULL DEFAULT '[]',
    subscriber_12m TEXT NOT NULL DEFAULT '[]',
    subscriber_lifetime TEXT NOT NULL DEFAULT '{}',

    -- Attribute breakdowns (refreshed on demand)
    subscriber_device TEXT NOT NULL DEFAULT '{}',
    subscriber_os TEXT NOT NULL DEFAULT '{}',
    subscriber_browser TEXT NOT NULL DEFAULT '{}',
    subscriber_countries TEXT NOT NULL DEFAULT '{}',
    subscriber_cities TEXT NOT NULL DEFAULT '{}',
    subscriber_referrer TEXT NOT NULL DEFAULT '{}',
    utm_source_subscriber TEXT NOT NULL DEFAULT '{}',
    utm_medium_subscriber TEXT NOT NULL DEFAULT '{}',
    utm_campaign_subscriber TEXT NOT NULL DEFAULT '{}',
    last_aggregated_at INTEGER NOT NULL DEFAULT 0,

    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_events_xor
   BEFORE INSERT ON email_events
   WHEN (
     (NEW.newsletter_id IS NOT NULL) +
     (NEW.campaign_id IS NOT NULL) +
     (NEW.purchase_id IS NOT NULL) +
     (NEW.proposal_id IS NOT NULL) +
     (NEW.invoice_id IS NOT NULL)
   ) != 1
   BEGIN
     SELECT RAISE(ABORT, 'email_events requires exactly one of newsletter_id/campaign_id/purchase_id/proposal_id/invoice_id');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_block_on_bounce
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'bounce'
   BEGIN
     UPDATE subscribers
     SET is_blocked   = 1,
         blocked_at   = strftime('%s','now'),
         block_reason = 'bounce'
     WHERE email = NEW.email
       AND profile_id = NEW.profile_id
       AND is_blocked = 0;

     INSERT INTO email_tracking_stats (profile_id, total_bounces, total_blocked)
     VALUES (NEW.profile_id, 1,
       CASE WHEN EXISTS(
         SELECT 1 FROM subscribers
         WHERE email = NEW.email AND profile_id = NEW.profile_id AND is_blocked = 0
       ) THEN 1 ELSE 0 END
     )
     ON CONFLICT(profile_id) DO UPDATE SET
       total_bounces = total_bounces + 1,
       total_blocked = total_blocked + CASE
         WHEN EXISTS(
           SELECT 1 FROM subscribers
           WHERE email = NEW.email AND profile_id = NEW.profile_id AND is_blocked = 0
         ) THEN 1 ELSE 0
       END,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_block_on_complaint
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'complaint'
   BEGIN
     UPDATE subscribers
     SET is_blocked   = 1,
         blocked_at   = strftime('%s','now'),
         block_reason = 'complaint'
     WHERE email = NEW.email
       AND profile_id = NEW.profile_id
       AND is_blocked = 0;

     INSERT INTO email_tracking_stats (profile_id, total_complaints, total_blocked)
     VALUES (NEW.profile_id, 1,
       CASE WHEN EXISTS(
         SELECT 1 FROM subscribers
         WHERE email = NEW.email AND profile_id = NEW.profile_id AND is_blocked = 0
       ) THEN 1 ELSE 0 END
     )
     ON CONFLICT(profile_id) DO UPDATE SET
       total_complaints = total_complaints + 1,
       total_blocked    = total_blocked + CASE
         WHEN EXISTS(
           SELECT 1 FROM subscribers
           WHERE email = NEW.email AND profile_id = NEW.profile_id AND is_blocked = 0
         ) THEN 1 ELSE 0
       END,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_unsubscribe
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'unsubscribe'
   BEGIN
     UPDATE subscribers
     SET is_unsubscribed = 1,
         unsubscribed_at = strftime('%s','now')
     WHERE id = NEW.subscriber_id
       AND profile_id = NEW.profile_id
       AND is_unsubscribed = 0;

     INSERT INTO email_tracking_stats (profile_id, total_unsubscribes, total_unsubscribed)
     VALUES (NEW.profile_id, 1,
       CASE WHEN EXISTS(
         SELECT 1 FROM subscribers
         WHERE id = NEW.subscriber_id AND profile_id = NEW.profile_id AND is_unsubscribed = 0
       ) THEN 1 ELSE 0 END
     )
     ON CONFLICT(profile_id) DO UPDATE SET
       total_unsubscribes = total_unsubscribes + 1,
       total_unsubscribed = total_unsubscribed + CASE
         WHEN EXISTS(
           SELECT 1 FROM subscribers
           WHERE id = NEW.subscriber_id AND profile_id = NEW.profile_id AND is_unsubscribed = 0
         ) THEN 1 ELSE 0
       END,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_stats_open_newsletter
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'open' AND NEW.newsletter_id IS NOT NULL
   BEGIN
     INSERT INTO newsletter_stats (newsletter_id, profile_id, open_count)
     VALUES (NEW.newsletter_id, NEW.profile_id, 1)
     ON CONFLICT(newsletter_id) DO UPDATE SET
       open_count = open_count + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now');

     INSERT INTO email_tracking_stats (profile_id, total_opens)
     VALUES (NEW.profile_id, 1)
     ON CONFLICT(profile_id) DO UPDATE SET
       total_opens = total_opens + 1,
       updated_at  = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_stats_open_product
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'open'
     AND NEW.purchase_id IS NOT NULL
     AND NEW.product_id IS NOT NULL
   BEGIN
     UPDATE product_analytics
     SET email_opens = email_opens + 1,
         updated_at = strftime('%s','now')
     WHERE product_id = NEW.product_id AND profile_id = NEW.profile_id;

     UPDATE profile_analytics
     SET product_email_opens = product_email_opens + 1,
         updated_at         = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_stats_click_newsletter
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'click' AND NEW.newsletter_id IS NOT NULL
   BEGIN
     INSERT INTO newsletter_stats (newsletter_id, profile_id, click_count)
     VALUES (NEW.newsletter_id, NEW.profile_id, 1)
     ON CONFLICT(newsletter_id) DO UPDATE SET
       click_count = click_count + 1,
       updated_at  = strftime('%Y-%m-%dT%H:%M:%SZ','now');

     INSERT INTO email_tracking_stats (profile_id, total_clicks)
     VALUES (NEW.profile_id, 1)
     ON CONFLICT(profile_id) DO UPDATE SET
       total_clicks = total_clicks + 1,
       updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_stats_click_product
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'click'
     AND NEW.purchase_id IS NOT NULL
     AND NEW.product_id IS NOT NULL
   BEGIN
     UPDATE product_analytics
     SET email_clicks = email_clicks + 1,
         updated_at   = strftime('%s','now')
     WHERE product_id = NEW.product_id AND profile_id = NEW.profile_id;

     UPDATE profile_analytics
     SET product_email_clicks = product_email_clicks + 1,
         updated_at            = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_stats_bounce
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'bounce' AND NEW.newsletter_id IS NOT NULL
   BEGIN
     INSERT INTO newsletter_stats (newsletter_id, profile_id, bounce_count)
     VALUES (NEW.newsletter_id, NEW.profile_id, 1)
     ON CONFLICT(newsletter_id) DO UPDATE SET
       bounce_count = bounce_count + 1,
       updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_stats_complaint
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'complaint' AND NEW.newsletter_id IS NOT NULL
   BEGIN
     INSERT INTO newsletter_stats (newsletter_id, profile_id, complaint_count)
     VALUES (NEW.newsletter_id, NEW.profile_id, 1)
     ON CONFLICT(newsletter_id) DO UPDATE SET
       complaint_count = complaint_count + 1,
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_stats_unsubscribe
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'unsubscribe' AND NEW.newsletter_id IS NOT NULL
   BEGIN
     INSERT INTO newsletter_stats (newsletter_id, profile_id, unsubscribe_count)
     VALUES (NEW.newsletter_id, NEW.profile_id, 1)
     ON CONFLICT(newsletter_id) DO UPDATE SET
       unsubscribe_count = unsubscribe_count + 1,
       updated_at        = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_subscriber_insert
   AFTER INSERT ON subscribers
   BEGIN
     INSERT INTO email_tracking_stats (profile_id, total_subscribers)
     VALUES (NEW.profile_id, 1)
     ON CONFLICT(profile_id) DO UPDATE SET
       total_subscribers = total_subscribers + 1,
       updated_at        = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_subscriber_block
   AFTER UPDATE OF is_blocked ON subscribers
   WHEN NEW.is_blocked = 1 AND OLD.is_blocked = 0
   BEGIN
     UPDATE email_tracking_stats
     SET total_blocked = total_blocked + 1,
         updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE profile_id = NEW.profile_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_subscriber_unsub
   AFTER UPDATE OF is_unsubscribed ON subscribers
   WHEN NEW.is_unsubscribed = 1 AND OLD.is_unsubscribed = 0
   BEGIN
     UPDATE email_tracking_stats
     SET total_unsubscribed = total_unsubscribed + 1,
         updated_at         = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE profile_id = NEW.profile_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_stats_open_proposal
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'open' AND NEW.proposal_id IS NOT NULL
   BEGIN
     UPDATE crm_proposals SET
       email_opened_at  = COALESCE(email_opened_at, strftime('%s','now')),
       email_open_count = email_open_count + 1,
       view_count       = view_count + 1,
       viewed_at        = COALESCE(viewed_at, strftime('%s','now')),
       status           = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
       updated_at       = strftime('%s','now')
     WHERE id = NEW.proposal_id AND profile_id = NEW.profile_id;

     INSERT INTO email_tracking_stats (profile_id, total_opens)
     VALUES (NEW.profile_id, 1)
     ON CONFLICT(profile_id) DO UPDATE SET
       total_opens = total_opens + 1,
       updated_at  = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_stats_click_proposal
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'click' AND NEW.proposal_id IS NOT NULL
   BEGIN
     UPDATE crm_proposals SET
       email_clicked_at = COALESCE(email_clicked_at, strftime('%s','now')),
       updated_at       = strftime('%s','now')
     WHERE id = NEW.proposal_id AND profile_id = NEW.profile_id;

     INSERT INTO email_tracking_stats (profile_id, total_clicks)
     VALUES (NEW.profile_id, 1)
     ON CONFLICT(profile_id) DO UPDATE SET
       total_clicks = total_clicks + 1,
       updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_stats_open_invoice
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'open' AND NEW.invoice_id IS NOT NULL
   BEGIN
     UPDATE crm_invoices SET
       email_opened_at  = COALESCE(email_opened_at, strftime('%s','now')),
       email_open_count = email_open_count + 1,
       view_count       = view_count + 1,
       viewed_at        = COALESCE(viewed_at, strftime('%s','now')),
       status           = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
       updated_at       = strftime('%s','now')
     WHERE id = NEW.invoice_id AND profile_id = NEW.profile_id;

     INSERT INTO email_tracking_stats (profile_id, total_opens)
     VALUES (NEW.profile_id, 1)
     ON CONFLICT(profile_id) DO UPDATE SET
       total_opens = total_opens + 1,
       updated_at  = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_stats_click_invoice
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'click' AND NEW.invoice_id IS NOT NULL
   BEGIN
     UPDATE crm_invoices SET
       email_clicked_at = COALESCE(email_clicked_at, strftime('%s','now')),
       updated_at       = strftime('%s','now')
     WHERE id = NEW.invoice_id AND profile_id = NEW.profile_id;

     INSERT INTO email_tracking_stats (profile_id, total_clicks)
     VALUES (NEW.profile_id, 1)
     ON CONFLICT(profile_id) DO UPDATE SET
       total_clicks = total_clicks + 1,
       updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_open_purchase_row
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'open'
     AND NEW.purchase_id IS NOT NULL
   BEGIN
     UPDATE purchases SET
       email_opened_at  = COALESCE(email_opened_at, strftime('%s','now')),
       email_open_count = email_open_count + 1,
       updated_at       = strftime('%s','now')
     WHERE id = NEW.purchase_id AND profile_id = NEW.profile_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_email_click_purchase_row
   AFTER INSERT ON email_events
   WHEN NEW.event_type = 'click'
     AND NEW.purchase_id IS NOT NULL
   BEGIN
     UPDATE purchases SET
       email_clicked_at = COALESCE(email_clicked_at, strftime('%s','now')),
       updated_at       = strftime('%s','now')
     WHERE id = NEW.purchase_id AND profile_id = NEW.profile_id;
   END"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
