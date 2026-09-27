// src-tauri/src/commands/shop/shift.rs
//
// WHAT: POS Shift Register & Reconciliation (Z-Report / Day Close).
//       Modeled after Shopify POS / Square POS for physical store cash drawers.
//
// FEATURES:
//   - Open Shift with float cash amount & staff assignment
//   - Real-time aggregation of sales by payment mode (Cash, UPI, Card, Bank, Credit)
//   - Blind cash count at shift close with automatic discrepancy / variance detection
//   - Z-Report summary generation & history logging

use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopShift {
    pub id: String,
    pub profile_id: String,
    pub staff_id: Option<String>,
    pub opened_by: String,
    pub closed_by: Option<String>,
    pub opened_by_name: Option<String>,
    pub closed_by_name: Option<String>,
    pub staff_name: Option<String>,
    pub opened_at: i64,
    pub closed_at: Option<i64>,
    pub opening_float: f64,
    pub cash_sales: f64,
    pub cash_refunds: f64,
    pub cash_payouts: f64,
    pub expected_cash: f64,
    pub counted_cash: Option<f64>,
    pub variance: f64,
    pub status: String,
    pub notes: Option<String>,
    pub summary_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct OpenShiftData {
    pub opening_float: f64,
    pub staff_id: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CloseShiftData {
    pub shift_id: String,
    pub counted_cash: f64,
    pub cash_payouts: Option<f64>,
    pub notes: Option<String>,
}

fn new_id(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    format!("{}-{}", prefix, ts)
}

/// Fetches the currently open shift for the profile (optionally filtered by staff).
#[tauri::command]
pub async fn shop_get_active_shift(
    staff_id: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<ShopShift>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let sql = if staff_id.is_some() {
        "SELECT s.id, s.profile_id, s.staff_id, s.opened_by, s.closed_by, s.opened_at, s.closed_at, \
                s.opening_float, s.cash_sales, s.cash_refunds, s.cash_payouts, s.expected_cash, \
                s.counted_cash, s.variance, s.status, s.notes, s.summary_json, s.created_at, s.updated_at, \
                COALESCE(NULLIF(TRIM(COALESCE(uo.first_name, '') || ' ' || COALESCE(uo.last_name, '')), ''), uo.username, uo.email, s.opened_by) as opened_by_name, \
                COALESCE(NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email, s.closed_by) as closed_by_name, \
                st.name as staff_name \
         FROM shop_shifts s \
         LEFT JOIN users uo ON uo.id = s.opened_by \
         LEFT JOIN users uc ON uc.id = s.closed_by \
         LEFT JOIN shop_staff st ON st.id = s.staff_id \
         WHERE s.profile_id = ?1 AND s.status = 'open' AND s.staff_id = ?2 \
         ORDER BY s.opened_at DESC LIMIT 1"
    } else {
        "SELECT s.id, s.profile_id, s.staff_id, s.opened_by, s.closed_by, s.opened_at, s.closed_at, \
                s.opening_float, s.cash_sales, s.cash_refunds, s.cash_payouts, s.expected_cash, \
                s.counted_cash, s.variance, s.status, s.notes, s.summary_json, s.created_at, s.updated_at, \
                COALESCE(NULLIF(TRIM(COALESCE(uo.first_name, '') || ' ' || COALESCE(uo.last_name, '')), ''), uo.username, uo.email, s.opened_by) as opened_by_name, \
                COALESCE(NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email, s.closed_by) as closed_by_name, \
                st.name as staff_name \
         FROM shop_shifts s \
         LEFT JOIN users uo ON uo.id = s.opened_by \
         LEFT JOIN users uc ON uc.id = s.closed_by \
         LEFT JOIN shop_staff st ON st.id = s.staff_id \
         WHERE s.profile_id = ?1 AND s.status = 'open' \
         ORDER BY s.opened_at DESC LIMIT 1"
    };

    let params = if let Some(ref sid) = staff_id {
        crate::turso_params![profile_id.clone(), sid.clone()]
    } else {
        crate::turso_params![profile_id.clone()]
    };

    let mut rows = conn.query(sql, params).await.map_err(|e| e.to_string())?;
    if let Ok(Some(row)) = rows.next().await {
        let mut shift = ShopShift {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            staff_id: row.get(2).ok(),
            opened_by: row.get(3).unwrap_or_default(),
            closed_by: row.get(4).ok(),
            opened_by_name: row.get(19).ok(),
            closed_by_name: row.get(20).ok(),
            staff_name: row.get(21).ok(),
            opened_at: row.get(5).unwrap_or(0),
            closed_at: row.get(6).ok(),
            opening_float: row.get(7).unwrap_or(0.0),
            cash_sales: row.get(8).unwrap_or(0.0),
            cash_refunds: row.get(9).unwrap_or(0.0),
            cash_payouts: row.get(10).unwrap_or(0.0),
            expected_cash: row.get(11).unwrap_or(0.0),
            counted_cash: row.get(12).ok(),
            variance: row.get(13).unwrap_or(0.0),
            status: row.get(14).unwrap_or_else(|_| "open".into()),
            notes: row.get(15).ok(),
            summary_json: row.get(16).unwrap_or_else(|_| "{}".into()),
            created_at: row.get(17).unwrap_or(0),
            updated_at: row.get(18).unwrap_or(0),
        };

        // Recalculate live totals since opened_at
        let (cash_in, upi_in, card_in, other_in, invoices_count, modified_count) =
            calculate_shift_metrics(&conn, &profile_id, shift.opened_at, None).await?;

        shift.cash_sales = cash_in;
        shift.expected_cash = (shift.opening_float + cash_in - shift.cash_refunds - shift.cash_payouts).max(0.0);
        shift.summary_json = serde_json::json!({
            "cash": cash_in,
            "upi": upi_in,
            "card": card_in,
            "other": other_in,
            "total_sales": cash_in + upi_in + card_in + other_in,
            "invoices_count": invoices_count,
            "modified_invoices_count": modified_count,
        }).to_string();

        Ok(Some(shift))
    } else {
        Ok(None)
    }
}

/// Opens a new shift / cash register session.
#[tauri::command]
pub async fn shop_open_shift(
    data: OpenShiftData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopShift, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Check if there is already an open shift for this staff/profile
    let existing = shop_get_active_shift(data.staff_id.clone(), state.clone()).await?;
    if let Some(s) = existing {
        return Err(format!("A shift (#{}) is already active. Please close it before opening a new one.", s.id));
    }

    let shift_id = new_id("shift");
    let active_uid = state.get_current_user_id().await;
    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "INSERT INTO shop_shifts \
         (id, profile_id, staff_id, opened_by, opened_at, opening_float, expected_cash, status, notes, summary_json, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8, '{}', ?5, ?5)",
        crate::turso_params![
            shift_id.clone(),
            profile_id.clone(),
            data.staff_id.clone(),
            active_uid.clone(),
            now,
            data.opening_float,
            data.opening_float,
            data.notes.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let opened = shop_get_active_shift(data.staff_id.clone(), state.clone())
        .await?
        .ok_or_else(|| "Failed to retrieve opened shift".to_string())?;

    Ok(opened)
}

/// Closes an active shift with blind count, computes final variance, locks shift, and generates Z-Report.
#[tauri::command]
pub async fn shop_close_shift(
    data: CloseShiftData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopShift, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let active_uid = state.get_current_user_id().await;
    let now = chrono::Utc::now().timestamp();

    // Load target shift
    let mut rows = conn
        .query(
            "SELECT id, profile_id, staff_id, opened_by, opened_at, opening_float, cash_refunds, cash_payouts, notes \
             FROM shop_shifts WHERE id = ?1 AND profile_id = ?2",
            crate::turso_params![data.shift_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let (opened_at, opening_float, refunds, existing_payouts, _staff_id, _opened_by, prev_notes) =
        if let Ok(Some(row)) = rows.next().await {
            let o_at: i64 = row.get(4).unwrap_or(0);
            let o_fl: f64 = row.get(5).unwrap_or(0.0);
            let refn: f64 = row.get(6).unwrap_or(0.0);
            let payo: f64 = row.get(7).unwrap_or(0.0);
            let s_id: Option<String> = row.get(2).ok();
            let o_by: String = row.get(3).unwrap_or_default();
            let p_not: Option<String> = row.get(8).ok();
            (o_at, o_fl, refn, payo, s_id, o_by, p_not)
        } else {
            return Err("Shift not found".to_string());
        };

    let payouts = data.cash_payouts.unwrap_or(existing_payouts);

    // Compute final sales numbers during this shift period
    let (cash_in, upi_in, card_in, other_in, invoices_count, modified_count) =
        calculate_shift_metrics(&conn, &profile_id, opened_at, Some(now)).await?;

    let expected_cash = (opening_float + cash_in - refunds - payouts).round();
    let variance = (data.counted_cash - expected_cash).round();

    let combined_notes = match (prev_notes, data.notes) {
        (Some(p), Some(n)) if !n.trim().is_empty() => Some(format!("{} | {}", p, n)),
        (Some(p), _) => Some(p),
        (_, Some(n)) => Some(n),
        _ => None,
    };

    let summary_obj = serde_json::json!({
        "opening_float": opening_float,
        "cash_sales": cash_in,
        "upi_sales": upi_in,
        "card_sales": card_in,
        "other_sales": other_in,
        "total_gross_sales": cash_in + upi_in + card_in + other_in,
        "cash_refunds": refunds,
        "cash_payouts": payouts,
        "expected_cash": expected_cash,
        "counted_cash": data.counted_cash,
        "variance": variance,
        "invoices_count": invoices_count,
        "modified_invoices_count": modified_count,
        "closed_at": now,
        "closed_by": active_uid,
    });
    let summary_str = summary_obj.to_string();

    conn.execute(
        "UPDATE shop_shifts \
         SET status = 'closed', closed_by = ?1, closed_at = ?2, cash_sales = ?3, \
             cash_payouts = ?4, expected_cash = ?5, counted_cash = ?6, variance = ?7, \
             notes = ?8, summary_json = ?9, updated_at = ?2 \
         WHERE id = ?10 AND profile_id = ?11",
        crate::turso_params![
            active_uid.clone(),
            now,
            cash_in,
            payouts,
            expected_cash,
            data.counted_cash,
            variance,
            combined_notes.clone(),
            summary_str.clone(),
            data.shift_id.clone(),
            profile_id.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Query closed shift with resolved names
    let mut closed_rows = conn
        .query(
            "SELECT s.id, s.profile_id, s.staff_id, s.opened_by, s.closed_by, s.opened_at, s.closed_at, \
                    s.opening_float, s.cash_sales, s.cash_refunds, s.cash_payouts, s.expected_cash, \
                    s.counted_cash, s.variance, s.status, s.notes, s.summary_json, s.created_at, s.updated_at, \
                    COALESCE(NULLIF(TRIM(COALESCE(uo.first_name, '') || ' ' || COALESCE(uo.last_name, '')), ''), uo.username, uo.email, s.opened_by) as opened_by_name, \
                    COALESCE(NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email, s.closed_by) as closed_by_name, \
                    st.name as staff_name \
             FROM shop_shifts s \
             LEFT JOIN users uo ON uo.id = s.opened_by \
             LEFT JOIN users uc ON uc.id = s.closed_by \
             LEFT JOIN shop_staff st ON st.id = s.staff_id \
             WHERE s.id = ?1 AND s.profile_id = ?2",
            crate::turso_params![data.shift_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = closed_rows.next().await {
        Ok(ShopShift {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            staff_id: row.get(2).ok(),
            opened_by: row.get(3).unwrap_or_default(),
            closed_by: row.get(4).ok(),
            opened_by_name: row.get(19).ok(),
            closed_by_name: row.get(20).ok(),
            staff_name: row.get(21).ok(),
            opened_at: row.get(5).unwrap_or(0),
            closed_at: row.get(6).ok(),
            opening_float: row.get(7).unwrap_or(0.0),
            cash_sales: row.get(8).unwrap_or(0.0),
            cash_refunds: row.get(9).unwrap_or(0.0),
            cash_payouts: row.get(10).unwrap_or(0.0),
            expected_cash: row.get(11).unwrap_or(0.0),
            counted_cash: row.get(12).ok(),
            variance: row.get(13).unwrap_or(0.0),
            status: row.get(14).unwrap_or_else(|_| "closed".into()),
            notes: row.get(15).ok(),
            summary_json: row.get(16).unwrap_or_else(|_| "{}".into()),
            created_at: row.get(17).unwrap_or(0),
            updated_at: row.get(18).unwrap_or(0),
        })
    } else {
        Err("Failed to load closed shift".to_string())
    }
}

/// Lists recent shifts (closed or open) for reporting.
#[tauri::command]
pub async fn shop_list_shifts(
    limit: Option<i64>,
    offset: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopShift>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let l = limit.unwrap_or(30).max(1);
    let o = offset.unwrap_or(0).max(0);

    let mut rows = conn
        .query(
            "SELECT s.id, s.profile_id, s.staff_id, s.opened_by, s.closed_by, s.opened_at, s.closed_at, \
                    s.opening_float, s.cash_sales, s.cash_refunds, s.cash_payouts, s.expected_cash, \
                    s.counted_cash, s.variance, s.status, s.notes, s.summary_json, s.created_at, s.updated_at, \
                    COALESCE(NULLIF(TRIM(COALESCE(uo.first_name, '') || ' ' || COALESCE(uo.last_name, '')), ''), uo.username, uo.email, s.opened_by) as opened_by_name, \
                    COALESCE(NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email, s.closed_by) as closed_by_name, \
                    st.name as staff_name \
             FROM shop_shifts s \
             LEFT JOIN users uo ON uo.id = s.opened_by \
             LEFT JOIN users uc ON uc.id = s.closed_by \
             LEFT JOIN shop_staff st ON st.id = s.staff_id \
             WHERE s.profile_id = ?1 \
             ORDER BY s.opened_at DESC \
             LIMIT ?2 OFFSET ?3",
            crate::turso_params![profile_id.clone(), l, o],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(ShopShift {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            staff_id: row.get(2).ok(),
            opened_by: row.get(3).unwrap_or_default(),
            closed_by: row.get(4).ok(),
            opened_by_name: row.get(19).ok(),
            closed_by_name: row.get(20).ok(),
            staff_name: row.get(21).ok(),
            opened_at: row.get(5).unwrap_or(0),
            closed_at: row.get(6).ok(),
            opening_float: row.get(7).unwrap_or(0.0),
            cash_sales: row.get(8).unwrap_or(0.0),
            cash_refunds: row.get(9).unwrap_or(0.0),
            cash_payouts: row.get(10).unwrap_or(0.0),
            expected_cash: row.get(11).unwrap_or(0.0),
            counted_cash: row.get(12).ok(),
            variance: row.get(13).unwrap_or(0.0),
            status: row.get(14).unwrap_or_else(|_| "open".into()),
            notes: row.get(15).ok(),
            summary_json: row.get(16).unwrap_or_else(|_| "{}".into()),
            created_at: row.get(17).unwrap_or(0),
            updated_at: row.get(18).unwrap_or(0),
        });
    }

    Ok(list)
}

// ── Helper: Aggregate shift metrics ──────────────────────────────────────────
async fn calculate_shift_metrics(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
    opened_at: i64,
    closed_at: Option<i64>,
) -> Result<(f64, f64, f64, f64, i64, i64), String> {
    let until = closed_at.unwrap_or_else(|| chrono::Utc::now().timestamp());

    // 1. Payment breakdown
    let mut pay_rows = conn
        .query(
            "SELECT LOWER(payment_mode), SUM(amount) \
             FROM shop_document_payments \
             WHERE profile_id = ?1 AND payment_date >= ?2 AND payment_date <= ?3 \
             GROUP BY LOWER(payment_mode)",
            crate::turso_params![profile_id.to_string(), opened_at, until],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut cash_in = 0.0;
    let mut upi_in = 0.0;
    let mut card_in = 0.0;
    let mut other_in = 0.0;

    while let Ok(Some(row)) = pay_rows.next().await {
        let mode: String = row.get(0).unwrap_or_default();
        let amt: f64 = row.get(1).unwrap_or(0.0);
        match mode.as_str() {
            "cash" => cash_in += amt,
            "upi" => upi_in += amt,
            "card" => card_in += amt,
            _ => other_in += amt,
        }
    }

    // 2. Invoice count and modified invoices count
    let mut doc_rows = conn
        .query(
            "SELECT COUNT(id), SUM(CASE WHEN updated_at > created_at + 5 THEN 1 ELSE 0 END) \
             FROM shop_documents \
             WHERE profile_id = ?1 AND doc_type = 'invoice' AND doc_date >= ?2 AND doc_date <= ?3",
            crate::turso_params![profile_id.to_string(), opened_at, until],
        )
        .await
        .map_err(|e| e.to_string())?;

    let (invoices_count, modified_count) = if let Ok(Some(row)) = doc_rows.next().await {
        let ic: i64 = row.get(0).unwrap_or(0);
        let mc: i64 = row.get(1).unwrap_or(0);
        (ic, mc)
    } else {
        (0, 0)
    };

    Ok((cash_in, upi_in, card_in, other_in, invoices_count, modified_count))
}
