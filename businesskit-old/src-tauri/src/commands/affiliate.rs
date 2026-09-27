// src-tauri/src/commands/affiliate.rs
//
// WHAT:  Affiliate program management — referrers, commissions, payouts.
//
// HOW:   Reads/writes the affiliate_* tables in UserDB.
//        The affiliate system lets the profile owner reward people who refer
//        new customers. Each referrer gets a unique code; when a sale happens
//        the Worker records a commission; the desktop app approves/rejects and
//        triggers payouts.
//
// FLOW:
//   get_affiliate_program   → 1 row per profile (program config)
//   list_referrers          → all people who have referral codes
//   list_commissions        → all pending/approved/paid commissions
//   approve_commission      → sets status=approved
//   reject_commission       → sets status=rejected
//   list_payouts            → payout batches created by admin
//   create_payout           → groups approved commissions into a payout record
//
// TABLES TOUCHED:
//   affiliate_programs    — config (rate, cookie days, payout threshold)
//   affiliate_referrers   — one row per referrer (user or email)
//   affiliate_commissions — one row per conversion event
//   affiliate_payouts     — payout batches
//
// REFERENCE: src/lib/affiliate.ts + src/lib/affiliate-service.ts

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AffiliateProgramRow {
    pub id: String,
    pub profile_id: String,
    pub is_active: bool,
    pub commission_type: String, // percent | flat
    pub commission_rate: i64,    // basis points for %, cents for flat
    pub cookie_days: i64,
    pub payout_threshold: i64, // cents minimum before payout
    pub terms: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferrerRow {
    pub id: String,
    pub profile_id: String,
    pub user_id: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    pub referral_code: String,
    pub status: String, // active | suspended | pending
    pub total_clicks: i64,
    pub total_conversions: i64,
    pub total_earned: i64, // cents
    pub total_paid: i64,   // cents
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommissionRow {
    pub id: String,
    pub profile_id: String,
    pub referrer_id: String,
    pub purchase_id: Option<String>,
    pub amount: i64,    // cents
    pub status: String, // pending | approved | rejected | paid
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PayoutRow {
    pub id: String,
    pub profile_id: String,
    pub referrer_id: String,
    pub amount: i64,
    pub status: String, // pending | processing | paid | failed
    pub payout_method: Option<String>,
    pub payout_reference: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

// ── Row extractors ────────────────────────────────────────────────────────────

fn program_from_row(row: &crate::db::turso::TursoRow) -> Result<AffiliateProgramRow, String> {
    Ok(AffiliateProgramRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        is_active: row.get::<i64>(2).unwrap_or(0) != 0,
        commission_type: row.get(3).map_err(|e| e.to_string())?,
        commission_rate: row.get::<i64>(4).unwrap_or(0),
        cookie_days: row.get::<i64>(5).unwrap_or(30),
        payout_threshold: row.get::<i64>(6).unwrap_or(5000),
        terms: row.get(7).map_err(|e| e.to_string())?,
        created_at: row.get::<i64>(8).unwrap_or(0),
        updated_at: row.get::<i64>(9).unwrap_or(0),
    })
}

fn referrer_from_row(row: &crate::db::turso::TursoRow) -> Result<ReferrerRow, String> {
    Ok(ReferrerRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        user_id: row.get(2).map_err(|e| e.to_string())?,
        email: row.get(3).map_err(|e| e.to_string())?,
        name: row.get(4).map_err(|e| e.to_string())?,
        referral_code: row.get(5).map_err(|e| e.to_string())?,
        status: row.get(6).map_err(|e| e.to_string())?,
        total_clicks: row.get::<i64>(7).unwrap_or(0),
        total_conversions: row.get::<i64>(8).unwrap_or(0),
        total_earned: row.get::<i64>(9).unwrap_or(0),
        total_paid: row.get::<i64>(10).unwrap_or(0),
        created_at: row.get::<i64>(11).unwrap_or(0),
    })
}

fn commission_from_row(row: &crate::db::turso::TursoRow) -> Result<CommissionRow, String> {
    Ok(CommissionRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        referrer_id: row.get(2).map_err(|e| e.to_string())?,
        purchase_id: row.get(3).map_err(|e| e.to_string())?,
        amount: row.get::<i64>(4).unwrap_or(0),
        status: row.get(5).map_err(|e| e.to_string())?,
        created_at: row.get::<i64>(6).unwrap_or(0),
        updated_at: row.get::<i64>(7).unwrap_or(0),
    })
}

fn payout_from_row(row: &crate::db::turso::TursoRow) -> Result<PayoutRow, String> {
    Ok(PayoutRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        referrer_id: row.get(2).map_err(|e| e.to_string())?,
        amount: row.get::<i64>(3).unwrap_or(0),
        status: row.get(4).map_err(|e| e.to_string())?,
        payout_method: row.get(5).map_err(|e| e.to_string())?,
        payout_reference: row.get(6).map_err(|e| e.to_string())?,
        created_at: row.get::<i64>(7).unwrap_or(0),
        updated_at: row.get::<i64>(8).unwrap_or(0),
    })
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Get or auto-create the affiliate program config for the active profile.
#[tauri::command]
pub async fn get_affiliate_program(
    state: State<'_, Arc<AppState>>,
) -> Result<AffiliateProgramRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Auto-create default program row if missing
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT OR IGNORE INTO affiliate_programs
           (id, profile_id, is_active, commission_type, commission_rate,
            cookie_days, payout_threshold, created_at, updated_at)
         VALUES (?1,?2,0,'percent',2000,30,5000, unixepoch(), unixepoch())",
        crate::turso_params![id, profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, is_active, commission_type, commission_rate,
                cookie_days, payout_threshold, terms, created_at, updated_at
         FROM affiliate_programs WHERE profile_id = ?1 LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        program_from_row(&row)
    } else {
        Err("Affiliate program not found".to_string())
    }
}

/// Update the affiliate program configuration.
#[tauri::command]
pub async fn update_affiliate_program(
    is_active: Option<bool>,
    commission_type: Option<String>,
    commission_rate: Option<i64>,
    cookie_days: Option<i64>,
    payout_threshold: Option<i64>,
    terms: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<AffiliateProgramRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE affiliate_programs SET
           is_active         = COALESCE(?1, is_active),
           commission_type   = COALESCE(?2, commission_type),
           commission_rate   = COALESCE(?3, commission_rate),
           cookie_days       = COALESCE(?4, cookie_days),
           payout_threshold  = COALESCE(?5, payout_threshold),
           terms             = COALESCE(?6, terms),
           updated_at        = unixepoch()
         WHERE profile_id = ?7",
        crate::turso_params![
            is_active.map(|v| v as i64),
            commission_type,
            commission_rate,
            cookie_days,
            payout_threshold,
            terms,
            profile_id.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    get_affiliate_program(state).await
}

/// List all referrers for the active profile.
#[tauri::command]
pub async fn list_referrers(
    status: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ReferrerRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, user_id, email, name, referral_code, status,
                total_clicks, total_conversions, total_earned, total_paid, created_at
         FROM affiliate_referrers
         WHERE profile_id = ?1 AND (?2 IS NULL OR status = ?2)
         ORDER BY total_earned DESC",
            crate::turso_params![profile_id, status],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(referrer_from_row(&row)?);
    }
    Ok(items)
}

/// List commissions. Filter by status: pending | approved | rejected | paid.
#[tauri::command]
pub async fn list_commissions(
    status: Option<String>,
    referrer_id: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CommissionRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, referrer_id, purchase_id, amount, status,
                created_at, updated_at
         FROM affiliate_commissions
         WHERE profile_id = ?1
           AND (?2 IS NULL OR status = ?2)
           AND (?3 IS NULL OR referrer_id = ?3)
         ORDER BY created_at DESC",
            crate::turso_params![profile_id, status, referrer_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(commission_from_row(&row)?);
    }
    Ok(items)
}

/// Approve a pending commission.
#[tauri::command]
pub async fn approve_commission(
    commission_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE affiliate_commissions SET status='approved', updated_at=unixepoch()
         WHERE id=?1 AND profile_id=?2 AND status='pending'",
        crate::turso_params![commission_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Reject a pending commission.
#[tauri::command]
pub async fn reject_commission(
    commission_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE affiliate_commissions SET status='rejected', updated_at=unixepoch()
         WHERE id=?1 AND profile_id=?2 AND status='pending'",
        crate::turso_params![commission_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// List payout batches for a referrer (or all referrers if referrer_id=None).
#[tauri::command]
pub async fn list_payouts(
    referrer_id: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<PayoutRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, referrer_id, amount, status,
                payout_method, payout_reference, created_at, updated_at
         FROM affiliate_payouts
         WHERE profile_id=?1 AND (?2 IS NULL OR referrer_id=?2)
         ORDER BY created_at DESC",
            crate::turso_params![profile_id, referrer_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(payout_from_row(&row)?);
    }
    Ok(items)
}

/// Create a payout record for a referrer. Marks included commissions as 'paid'.
#[tauri::command]
pub async fn create_payout(
    referrer_id: String,
    amount: i64,
    payout_method: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<PayoutRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO affiliate_payouts
           (id, profile_id, referrer_id, amount, status, payout_method,
            created_at, updated_at)
         VALUES (?1,?2,?3,?4,'pending',?5, unixepoch(), unixepoch())",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            referrer_id.clone(),
            amount,
            payout_method
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Mark all approved commissions for this referrer as paid
    conn.execute(
        "UPDATE affiliate_commissions SET status='paid', updated_at=unixepoch()
         WHERE profile_id=?1 AND referrer_id=?2 AND status='approved'",
        crate::turso_params![profile_id.clone(), referrer_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, referrer_id, amount, status,
                payout_method, payout_reference, created_at, updated_at
         FROM affiliate_payouts WHERE id=?1",
            crate::turso_params![id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        payout_from_row(&row)
    } else {
        Err("Payout insert failed".to_string())
    }
}
