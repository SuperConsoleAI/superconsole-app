// src-tauri/src/commands/shop/demo.rs
//
// Demo Bills (Non-GST / Demo Bill Generator Logs)
// Records demo bills generated, downloaded, printed, or shared without affecting real accounting/invoices.

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveDemoBillPayload {
    pub id: Option<String>,
    pub profile_id: Option<String>,
    pub original_invoice_id: Option<String>,
    pub doc_number: String,
    pub doc_date: Option<i64>,
    pub payment_mode: Option<String>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub customer_address: Option<String>,
    pub customer_gstin: Option<String>,
    pub customer_dl_no: Option<String>,
    pub subtotal: Option<f64>,
    pub discount_amt: Option<f64>,
    pub tax_amount: Option<f64>,
    pub grand_total: Option<f64>,
    pub notes: Option<String>,
    pub lines_snapshot: Option<String>,
    pub user_id: Option<String>,
    pub staff_id: Option<String>,
    pub action: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DemoBillRecord {
    pub id: String,
    pub profile_id: String,
    pub original_invoice_id: Option<String>,
    pub doc_number: String,
    pub doc_date: i64,
    pub payment_mode: String,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub customer_address: Option<String>,
    pub customer_gstin: Option<String>,
    pub customer_dl_no: Option<String>,
    pub subtotal: f64,
    pub discount_amt: f64,
    pub tax_amount: f64,
    pub grand_total: f64,
    pub notes: Option<String>,
    pub lines_snapshot: String,
    pub user_id: Option<String>,
    pub staff_id: Option<String>,
    pub action: Option<String>,
    pub created_at: i64,
}

#[tauri::command]
pub async fn shop_save_demo_bill(
    state: State<'_, Arc<AppState>>,
    data: SaveDemoBillPayload,
) -> Result<String, String> {
    let profile_id = match data.profile_id {
        Some(p) if !p.trim().is_empty() => p,
        _ => state.require_profile().await.unwrap_or_else(|_| "default".to_string()),
    };
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let id = data.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().timestamp();
    let doc_date = data.doc_date.unwrap_or(now);
    let active_uid = state.get_current_user_id().await;
    let user_id = data.user_id.or_else(|| if active_uid.is_empty() { None } else { Some(active_uid) });
    let payment_mode = data.payment_mode.unwrap_or_else(|| "cash".to_string());
    let subtotal = data.subtotal.unwrap_or(0.0);
    let discount_amt = data.discount_amt.unwrap_or(0.0);
    let tax_amount = data.tax_amount.unwrap_or(0.0);
    let grand_total = data.grand_total.unwrap_or(0.0);
    let lines_snapshot = data.lines_snapshot.unwrap_or_else(|| "[]".to_string());

    let stmt = conn
        .prepare(
            "INSERT INTO demo_bills \
             (id, profile_id, original_invoice_id, doc_number, doc_date, payment_mode, \
              customer_name, customer_phone, customer_address, customer_gstin, customer_dl_no, \
              subtotal, discount_amt, tax_amount, grand_total, notes, lines_snapshot, \
              user_id, staff_id, action, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        )
        .await
        .map_err(|e| e.to_string())?;

    stmt.execute(crate::turso_params![
        id.clone(),
        profile_id,
        data.original_invoice_id,
        data.doc_number,
        doc_date,
        payment_mode,
        data.customer_name,
        data.customer_phone,
        data.customer_address,
        data.customer_gstin,
        data.customer_dl_no,
        subtotal,
        discount_amt,
        tax_amount,
        grand_total,
        data.notes,
        lines_snapshot,
        user_id,
        data.staff_id,
        data.action,
        now
    ])
    .await
    .map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub async fn shop_list_demo_bills(
    state: State<'_, Arc<AppState>>,
    profile_id: Option<String>,
    original_invoice_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<DemoBillRecord>, String> {
    let pid = match profile_id {
        Some(p) if !p.trim().is_empty() => p,
        _ => state.require_profile().await.unwrap_or_else(|_| "default".to_string()),
    };
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let fetch_limit = limit.unwrap_or(100).min(500) as i64;

    let mut records = Vec::new();
    if let Some(orig_id) = original_invoice_id {
        let stmt = conn
            .prepare(
                "SELECT id, profile_id, original_invoice_id, doc_number, doc_date, payment_mode, \
                 customer_name, customer_phone, customer_address, customer_gstin, customer_dl_no, \
                 subtotal, discount_amt, tax_amount, grand_total, notes, lines_snapshot, \
                 user_id, staff_id, action, created_at \
                 FROM demo_bills \
                 WHERE profile_id = ?1 AND original_invoice_id = ?2 \
                 ORDER BY created_at DESC \
                 LIMIT ?3",
            )
            .await
            .map_err(|e| e.to_string())?;

        let mut rows = stmt
            .query(crate::turso_params![pid, orig_id, fetch_limit])
            .await
            .map_err(|e| e.to_string())?;

        while let Ok(Some(row)) = rows.next().await {
            records.push(DemoBillRecord {
                id: row.get(0).unwrap_or_default(),
                profile_id: row.get(1).unwrap_or_default(),
                original_invoice_id: row.get(2).ok(),
                doc_number: row.get(3).unwrap_or_default(),
                doc_date: row.get(4).unwrap_or(0),
                payment_mode: row.get(5).unwrap_or_else(|_| "cash".to_string()),
                customer_name: row.get(6).ok(),
                customer_phone: row.get(7).ok(),
                customer_address: row.get(8).ok(),
                customer_gstin: row.get(9).ok(),
                customer_dl_no: row.get(10).ok(),
                subtotal: row.get(11).unwrap_or(0.0),
                discount_amt: row.get(12).unwrap_or(0.0),
                tax_amount: row.get(13).unwrap_or(0.0),
                grand_total: row.get(14).unwrap_or(0.0),
                notes: row.get(15).ok(),
                lines_snapshot: row.get(16).unwrap_or_else(|_| "[]".to_string()),
                user_id: row.get(17).ok(),
                staff_id: row.get(18).ok(),
                action: row.get(19).ok(),
                created_at: row.get(20).unwrap_or(0),
            });
        }
    } else {
        let stmt = conn
            .prepare(
                "SELECT id, profile_id, original_invoice_id, doc_number, doc_date, payment_mode, \
                 customer_name, customer_phone, customer_address, customer_gstin, customer_dl_no, \
                 subtotal, discount_amt, tax_amount, grand_total, notes, lines_snapshot, \
                 user_id, staff_id, action, created_at \
                 FROM demo_bills \
                 WHERE profile_id = ?1 \
                 ORDER BY created_at DESC \
                 LIMIT ?2",
            )
            .await
            .map_err(|e| e.to_string())?;

        let mut rows = stmt
            .query(crate::turso_params![pid, fetch_limit])
            .await
            .map_err(|e| e.to_string())?;

        while let Ok(Some(row)) = rows.next().await {
            records.push(DemoBillRecord {
                id: row.get(0).unwrap_or_default(),
                profile_id: row.get(1).unwrap_or_default(),
                original_invoice_id: row.get(2).ok(),
                doc_number: row.get(3).unwrap_or_default(),
                doc_date: row.get(4).unwrap_or(0),
                payment_mode: row.get(5).unwrap_or_else(|_| "cash".to_string()),
                customer_name: row.get(6).ok(),
                customer_phone: row.get(7).ok(),
                customer_address: row.get(8).ok(),
                customer_gstin: row.get(9).ok(),
                customer_dl_no: row.get(10).ok(),
                subtotal: row.get(11).unwrap_or(0.0),
                discount_amt: row.get(12).unwrap_or(0.0),
                tax_amount: row.get(13).unwrap_or(0.0),
                grand_total: row.get(14).unwrap_or(0.0),
                notes: row.get(15).ok(),
                lines_snapshot: row.get(16).unwrap_or_else(|_| "[]".to_string()),
                user_id: row.get(17).ok(),
                staff_id: row.get(18).ok(),
                action: row.get(19).ok(),
                created_at: row.get(20).unwrap_or(0),
            });
        }
    }

    Ok(records)
}
