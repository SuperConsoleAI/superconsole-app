// src-tauri/src/commands/shop/reviews.rs
//
// Phase 8 — Multi-product, restaurant bill & stay reviews system.
// Connects reviews to crm_contacts, shop_documents, shop_reservations, and shop_items.

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewRow {
    pub id: String,
    pub profile_id: String,
    pub contact_id: Option<String>,
    pub contact_name: Option<String>,
    pub document_id: Option<String>,
    pub reservation_id: Option<String>,
    pub item_id: Option<String>,
    pub item_name: Option<String>,
    pub variant_id: Option<String>,
    pub direction: String,
    pub rating: Option<i64>,
    pub title: Option<String>,
    pub review_text: Option<String>,
    pub is_verified_purchase: i64,
    pub is_published: i64,
    pub response_text: Option<String>,
    pub responded_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateReviewData {
    pub contact_id: Option<String>,
    pub document_id: Option<String>,
    pub reservation_id: Option<String>,
    pub item_id: Option<String>,
    pub variant_id: Option<String>,
    pub direction: Option<String>, // "guest_to_host" (default) | "host_to_guest"
    pub rating: Option<i64>,
    pub title: Option<String>,
    pub review_text: Option<String>,
    pub is_published: Option<i64>,
}

#[derive(Debug, Deserialize, Default)]
pub struct ListReviewsFilter {
    pub item_id: Option<String>,
    pub document_id: Option<String>,
    pub reservation_id: Option<String>,
    pub contact_id: Option<String>,
    pub direction: Option<String>,
    pub is_published: Option<i64>,
    pub min_rating: Option<i64>,
    pub limit: Option<i64>,
}

#[tauri::command]
pub async fn shop_create_review(
    data: CreateReviewData,
    state: State<'_, Arc<AppState>>,
) -> Result<ReviewRow, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let review_id = format!("rev-{}", Uuid::new_v4());
    let direction = data.direction.unwrap_or_else(|| "guest_to_host".to_string());
    let is_published = data.is_published.unwrap_or_else(|| {
        if direction == "host_to_guest" {
            0
        } else {
            1
        }
    });

    // Determine verified purchase status if item_id and contact_id are present
    let mut is_verified = 0_i64;
    if let (Some(ref item_id), Some(ref contact_id)) = (&data.item_id, &data.contact_id) {
        let mut check_rows = conn
            .query(
                "SELECT 1 FROM shop_document_lines dl \
                 JOIN shop_documents d ON d.id = dl.document_id AND d.profile_id = dl.profile_id \
                 LEFT JOIN shop_customers c ON c.id = d.customer_id AND c.profile_id = d.profile_id \
                 WHERE dl.profile_id = ? \
                   AND dl.item_id = ? \
                   AND (c.contact_id = ? OR c.id = ? OR d.customer_id = ?) \
                   AND d.status IN ('confirmed', 'paid', 'completed') \
                 LIMIT 1",
                crate::turso_params![
                    profile_id.clone(),
                    item_id.clone(),
                    contact_id.clone(),
                    contact_id.clone(),
                    contact_id.clone(),
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        if let Ok(Some(_)) = check_rows.next().await {
            is_verified = 1;
        }
    } else if data.document_id.is_some() || data.reservation_id.is_some() {
        is_verified = 1;
    }

    conn.execute(
        "INSERT INTO reviews \
           (id, profile_id, contact_id, document_id, reservation_id, item_id, variant_id, \
            direction, rating, title, review_text, is_verified_purchase, is_published, \
            created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())",
        crate::turso_params![
            review_id.clone(),
            profile_id.clone(),
            data.contact_id.clone(),
            data.document_id.clone(),
            data.reservation_id.clone(),
            data.item_id.clone(),
            data.variant_id.clone(),
            direction.clone(),
            data.rating,
            data.title.clone(),
            data.review_text.clone(),
            is_verified,
            is_published,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Return the newly created review with joined names
    let mut rows = conn
        .query(
            "SELECT r.id, r.profile_id, r.contact_id, \
                    COALESCE(ct.first_name || ' ' || COALESCE(ct.last_name, ''), sc.name) AS contact_name, \
                    r.document_id, r.reservation_id, r.item_id, \
                    si.name AS item_name, \
                    r.variant_id, r.direction, r.rating, r.title, r.review_text, \
                    r.is_verified_purchase, r.is_published, r.response_text, r.responded_at, \
                    r.created_at, r.updated_at \
             FROM reviews r \
             LEFT JOIN crm_contacts ct ON ct.id = r.contact_id AND ct.profile_id = r.profile_id \
             LEFT JOIN shop_customers sc ON sc.contact_id = r.contact_id AND sc.profile_id = r.profile_id \
             LEFT JOIN shop_items si ON si.id = r.item_id AND si.profile_id = r.profile_id \
             WHERE r.id = ? AND r.profile_id = ?",
            crate::turso_params![review_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(ReviewRow {
            id: row.get(0).map_err(|e| e.to_string())?,
            profile_id: row.get(1).map_err(|e| e.to_string())?,
            contact_id: row.get(2).ok(),
            contact_name: row.get(3).ok(),
            document_id: row.get(4).ok(),
            reservation_id: row.get(5).ok(),
            item_id: row.get(6).ok(),
            item_name: row.get(7).ok(),
            variant_id: row.get(8).ok(),
            direction: row.get(9).map_err(|e| e.to_string())?,
            rating: row.get(10).ok(),
            title: row.get(11).ok(),
            review_text: row.get(12).ok(),
            is_verified_purchase: row.get::<i64>(13).unwrap_or(0),
            is_published: row.get::<i64>(14).unwrap_or(1),
            response_text: row.get(15).ok(),
            responded_at: row.get(16).ok(),
            created_at: row.get(17).map_err(|e| e.to_string())?,
            updated_at: row.get(18).map_err(|e| e.to_string())?,
        })
    } else {
        Err("Failed to load created review".into())
    }
}

#[tauri::command]
pub async fn shop_list_reviews(
    filter: Option<ListReviewsFilter>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ReviewRow>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let f = filter.unwrap_or_default();
    let mut sql = "SELECT r.id, r.profile_id, r.contact_id, \
                          COALESCE(ct.first_name || ' ' || COALESCE(ct.last_name, ''), sc.name) AS contact_name, \
                          r.document_id, r.reservation_id, r.item_id, \
                          si.name AS item_name, \
                          r.variant_id, r.direction, r.rating, r.title, r.review_text, \
                          r.is_verified_purchase, r.is_published, r.response_text, r.responded_at, \
                          r.created_at, r.updated_at \
                   FROM reviews r \
                   LEFT JOIN crm_contacts ct ON ct.id = r.contact_id AND ct.profile_id = r.profile_id \
                   LEFT JOIN shop_customers sc ON sc.contact_id = r.contact_id AND sc.profile_id = r.profile_id \
                   LEFT JOIN shop_items si ON si.id = r.item_id AND si.profile_id = r.profile_id \
                   WHERE r.profile_id = ?".to_string();

    let mut params = vec![crate::db::turso::TursoParam::from(profile_id)];

    if let Some(ref item_id) = f.item_id {
        if !item_id.trim().is_empty() {
            sql.push_str(" AND r.item_id = ?");
            params.push(crate::db::turso::TursoParam::from(item_id.clone()));
        }
    }
    if let Some(ref doc_id) = f.document_id {
        if !doc_id.trim().is_empty() {
            sql.push_str(" AND r.document_id = ?");
            params.push(crate::db::turso::TursoParam::from(doc_id.clone()));
        }
    }
    if let Some(ref res_id) = f.reservation_id {
        if !res_id.trim().is_empty() {
            sql.push_str(" AND r.reservation_id = ?");
            params.push(crate::db::turso::TursoParam::from(res_id.clone()));
        }
    }
    if let Some(ref contact_id) = f.contact_id {
        if !contact_id.trim().is_empty() {
            sql.push_str(" AND r.contact_id = ?");
            params.push(crate::db::turso::TursoParam::from(contact_id.clone()));
        }
    }
    if let Some(ref dir) = f.direction {
        if !dir.trim().is_empty() {
            sql.push_str(" AND r.direction = ?");
            params.push(crate::db::turso::TursoParam::from(dir.clone()));
        }
    }
    if let Some(pub_status) = f.is_published {
        sql.push_str(" AND r.is_published = ?");
        params.push(crate::db::turso::TursoParam::from(pub_status));
    }
    if let Some(min_r) = f.min_rating {
        sql.push_str(" AND r.rating >= ?");
        params.push(crate::db::turso::TursoParam::from(min_r));
    }

    let limit = f.limit.unwrap_or(100).min(500);
    sql.push_str(&format!(" ORDER BY r.created_at DESC LIMIT {}", limit));

    let mut rows = conn.query(&sql, params).await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();

    while let Ok(Some(row)) = rows.next().await {
        out.push(ReviewRow {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            contact_id: row.get(2).ok(),
            contact_name: row.get(3).ok(),
            document_id: row.get(4).ok(),
            reservation_id: row.get(5).ok(),
            item_id: row.get(6).ok(),
            item_name: row.get(7).ok(),
            variant_id: row.get(8).ok(),
            direction: row.get(9).unwrap_or_else(|_| "guest_to_host".to_string()),
            rating: row.get(10).ok(),
            title: row.get(11).ok(),
            review_text: row.get(12).ok(),
            is_verified_purchase: row.get::<i64>(13).unwrap_or(0),
            is_published: row.get::<i64>(14).unwrap_or(1),
            response_text: row.get(15).ok(),
            responded_at: row.get(16).ok(),
            created_at: row.get(17).unwrap_or(0),
            updated_at: row.get(18).unwrap_or(0),
        });
    }

    Ok(out)
}

#[tauri::command]
pub async fn shop_update_review_published(
    review_id: String,
    is_published: i64,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE reviews SET is_published = ?, updated_at = unixepoch() WHERE id = ? AND profile_id = ?",
        crate::turso_params![is_published, review_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn shop_reply_to_review(
    review_id: String,
    response_text: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE reviews SET response_text = ?, responded_at = unixepoch(), updated_at = unixepoch() \
         WHERE id = ? AND profile_id = ?",
        crate::turso_params![response_text.trim(), review_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn shop_delete_review(
    review_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM reviews WHERE id = ? AND profile_id = ?",
        crate::turso_params![review_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}
