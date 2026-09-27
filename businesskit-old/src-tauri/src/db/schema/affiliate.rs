// src-tauri/src/db/schema/affiliate.rs
use super::Migration;

// ─────────────────────────────────────────────────────────────────────────────
// affiliate.ts — Creator Affiliate Program Schema + Provision Helpers
//
// Mirrors community.ts pattern. Same infra as platform affiliate — different DB.
//
// How referral links work (like Skool):
//   Link is ALWAYS available — no generation step needed.
//   ?ref=<user_id>   e.g. /community?ref=6d9ec4bdd8f4451598d68613610a4839
//
// affiliate_referrers — lazy row creation:
//   Promoter copies their link and starts sharing — nothing is created yet.
//   A row is auto-inserted on FIRST CLICK (click handler resolves ?ref=<user_id>,
//   upserts the row). When they later visit the earnings dashboard, the row
//   already exists with accumulated stats.
//
// affiliate_commissions field guide:
//   referrer_id      → affiliate_referrers.id  (the PROMOTER who shared the link)
//   customer_user_id → nullable — user_id of the person who converted
//
// payout_accounts — universal table (reusable beyond affiliate):
//   Stores payment destinations (PayPal, bank, Wise) keyed by user_id.
//   affiliate_payouts.payout_account_id → payout_accounts.id
//
// Tables (UserDB — no `user_` prefix, separate DB from Central):
//   payout_accounts       — universal payment destinations per user
//   affiliate_programs    — one per profile (settings + denormalized stats)
//   affiliate_referrers   — promoters + running totals (lazy-created on first click)
//   affiliate_commissions — one row per conversion event
//   affiliate_payouts     — batch payout records
// ─────────────────────────────────────────────────────────────────────────────

pub const SCHEMA_SQL: &[&str] = &[
    r#"CREATE TABLE IF NOT EXISTS affiliate_programs (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT 'Affiliate Program',
    description TEXT,
    commission_rate INTEGER NOT NULL DEFAULT 10,
    commission_type TEXT NOT NULL DEFAULT 'percent',
    flat_amount_cents INTEGER NOT NULL DEFAULT 0,
    cookie_days INTEGER NOT NULL DEFAULT 30,
    payout_threshold_cents INTEGER NOT NULL DEFAULT 5000,
    payout_method TEXT NOT NULL DEFAULT 'paypal',
    payout_schedule TEXT NOT NULL DEFAULT 'monthly',
    total_referrers INTEGER NOT NULL DEFAULT 0,
    total_clicks INTEGER NOT NULL DEFAULT 0,
    total_conversions INTEGER NOT NULL DEFAULT 0,
    total_revenue_cents INTEGER NOT NULL DEFAULT 0,
    total_commission_cents INTEGER NOT NULL DEFAULT 0,
    total_paid_cents INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    CHECK (commission_type != 'percent' OR (commission_rate >= 0 AND commission_rate <= 100)),
    CHECK (commission_type != 'flat' OR flat_amount_cents >= 0)
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_afp_profile ON affiliate_programs (profile_id)"#,
    r#"CREATE TABLE IF NOT EXISTS affiliate_referrers (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    program_id TEXT NOT NULL,
    user_id TEXT,
    name TEXT,
    email TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    total_clicks INTEGER NOT NULL DEFAULT 0,
    total_conversions INTEGER NOT NULL DEFAULT 0,
    total_revenue_cents INTEGER NOT NULL DEFAULT 0,
    total_earnings_cents INTEGER NOT NULL DEFAULT 0,
    pending_cents INTEGER NOT NULL DEFAULT 0,
    paid_cents INTEGER NOT NULL DEFAULT 0,
    country TEXT,
    city TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_afr_profile ON affiliate_referrers (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_afr_program ON affiliate_referrers (program_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_afr_user_id ON affiliate_referrers (program_id, user_id)"#,
    r#"CREATE TABLE IF NOT EXISTS affiliate_commissions (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    program_id TEXT NOT NULL,
    referrer_id TEXT NOT NULL,
    customer_user_id TEXT,
    source_type TEXT NOT NULL DEFAULT 'purchase',
    source_id TEXT,
    product_id TEXT,
    community_id TEXT,
    sale_amount_cents INTEGER NOT NULL DEFAULT 0,
    commission_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (commission_amount_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'usd',
    commission_rate INTEGER NOT NULL DEFAULT 0,
    commission_type TEXT NOT NULL DEFAULT 'percent',
    customer_email TEXT,
    customer_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    payout_status TEXT NOT NULL DEFAULT 'unpaid',
    payout_id TEXT,
    approved_at INTEGER,
    rejected_at INTEGER,
    rejection_reason TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    referrer TEXT,
    country TEXT,
    city TEXT,
    device TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_afc_profile ON affiliate_commissions (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_afc_referrer ON affiliate_commissions (referrer_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_afc_program ON affiliate_commissions (program_id, status, payout_status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_afc_payout ON affiliate_commissions (payout_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_afc_customer ON affiliate_commissions (customer_user_id)"#,
    r#"CREATE TABLE IF NOT EXISTS affiliate_payouts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    program_id TEXT NOT NULL,
    referrer_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'usd',
    method TEXT NOT NULL DEFAULT 'manual',
    payout_account_id TEXT,
    reference TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'processing',
    commission_ids TEXT NOT NULL DEFAULT '[]',
    processed_at INTEGER,
    failed_at INTEGER,
    failure_reason TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_afpy_profile ON affiliate_payouts (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_afpy_referrer ON affiliate_payouts (referrer_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_afpy_status ON affiliate_payouts (program_id, status)"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
