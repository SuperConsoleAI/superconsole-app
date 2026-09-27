use crate::AppState;
use serde::Serialize;
use std::sync::Arc;
use tauri::State;

#[derive(Serialize)]
pub struct PurchaseRow {
    pub id: String,
    pub email: String,
    pub customer_name: Option<String>,
    pub amount_cents: i64,
    pub platform_fee_cents: i64,
    pub currency: String,
    pub payment_processor: String,
    pub payment_status: String,
    pub status: String,
    pub created_at: i64,
    pub access_token: String,
    pub access_count: i64,
    pub last_accessed_at: Option<i64>,
    pub approval_status: Option<String>,
    pub product_id: String,
    pub product_title: Option<String>,
    pub product_type: Option<String>,
    pub product_slug: Option<String>,
}

/// Fetch purchases for the active profile, optionally filtered by product_type (e.g., 'downloads')
#[tauri::command]
pub async fn get_product_purchases(
    product_type: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<PurchaseRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let sql = if product_type.is_some() {
        r#"
            SELECT 
                p.id, p.email, p.customer_name, p.amount_cents, p.platform_fee_cents,
                p.currency, p.payment_processor, p.payment_status, p.status,
                p.created_at, p.access_token, p.access_count, p.last_accessed_at, p.approval_status,
                p.product_id,
                pr.title as product_title,
                pr.category_id as product_type,
                pr.slug as product_slug
            FROM purchases p
            LEFT JOIN content pr ON p.product_id = pr.id
            WHERE p.profile_id = ?1 AND pr.category_id = ?2
            ORDER BY p.created_at DESC
            LIMIT 1000
        "#
    } else {
        r#"
            SELECT 
                p.id, p.email, p.customer_name, p.amount_cents, p.platform_fee_cents,
                p.currency, p.payment_processor, p.payment_status, p.status,
                p.created_at, p.access_token, p.access_count, p.last_accessed_at, p.approval_status,
                p.product_id,
                pr.title as product_title,
                pr.category_id as product_type,
                pr.slug as product_slug
            FROM purchases p
            LEFT JOIN content pr ON p.product_id = pr.id
            WHERE p.profile_id = ?1
            ORDER BY p.created_at DESC
            LIMIT 1000
        "#
    };

    let stmt = conn.prepare(sql).await.map_err(|e| e.to_string())?;

    let mut rows = if let Some(ref pt) = product_type {
        stmt.query(crate::turso_params![profile_id, pt.clone()])
            .await
            .map_err(|e| e.to_string())?
    } else {
        stmt.query(crate::turso_params![profile_id])
            .await
            .map_err(|e| e.to_string())?
    };

    let mut purchases = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        purchases.push(PurchaseRow {
            id: row.get(0).unwrap_or_default(),
            email: row.get(1).unwrap_or_default(),
            customer_name: row.get(2).unwrap_or_default(),
            amount_cents: row.get(3).unwrap_or_default(),
            platform_fee_cents: row.get(4).unwrap_or_default(),
            currency: row.get(5).unwrap_or_default(),
            payment_processor: row.get(6).unwrap_or_default(),
            payment_status: row.get(7).unwrap_or_default(),
            status: row.get(8).unwrap_or_default(),
            created_at: row.get(9).unwrap_or_default(),
            access_token: row.get(10).unwrap_or_default(),
            access_count: row.get(11).unwrap_or_default(),
            last_accessed_at: row.get(12).unwrap_or_default(),
            approval_status: row.get(13).unwrap_or_default(),
            product_id: row.get(14).unwrap_or_default(),
            product_title: row.get(15).unwrap_or_default(),
            product_type: row.get(16).unwrap_or_default(),
            product_slug: row.get(17).unwrap_or_default(),
        });
    }

    Ok(purchases)
}
