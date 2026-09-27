// src-tauri/src/commands/shop/collections.rs
//
// Shop collection commands — Phase 1 (Storefront)
//
// Collections are curated groups of items shown on the public storefront.
// Examples: Best Sellers, New Arrivals, Summer Sale.
// parent_id supports nested collections (Sale → Summer Sale, Winter Sale).
// item_ids is a JSON array of shop_item IDs for manual curation.
//
// Commands:
//   shop_list_collections   — all active collections for the profile
//   shop_create_collection  — insert new collection, returns ShopCollection
//   shop_update_collection  — name / slug / parent / description update
//   shop_delete_collection  — soft-delete (is_active = 0)

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopCollection {
    pub id: String,
    pub profile_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub item_ids: String,
    pub sort_order: i64,
    pub is_default: i64,
    pub is_active: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateCollectionData {
    pub name: String,
    pub slug: Option<String>,
    pub parent_id: Option<String>,
    pub description: Option<String>,
    pub is_default: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCollectionData {
    pub name: String,
    pub slug: Option<String>,
    pub parent_id: Option<String>,
    pub description: Option<String>,
    pub is_default: Option<i64>,
}

fn make_slug(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// List all active collections for the active profile.
#[tauri::command]
pub async fn shop_list_collections(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopCollection>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT id, profile_id, parent_id, title, slug, description, item_ids, sort_order, is_default, is_active \
         FROM collections \
         WHERE profile_id = ? AND is_active = 1 \
         ORDER BY is_default DESC, sort_order ASC, title ASC",
        crate::turso_params![profile_id],
    ).await.map_err(|e| e.to_string())?;

    let mut cols = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        cols.push(ShopCollection {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            parent_id: row.get(2).ok(),
            name: row.get(3).unwrap_or_default(),
            slug: row.get(4).unwrap_or_default(),
            description: row.get(5).ok(),
            item_ids: row.get(6).unwrap_or_else(|_| "[]".to_string()),
            sort_order: row.get(7).unwrap_or(0),
            is_default: row.get(8).unwrap_or(0),
            is_active: row.get(9).unwrap_or(1),
        });
    }
    Ok(cols)
}

/// Create a new collection.
#[tauri::command]
pub async fn shop_create_collection(
    data: CreateCollectionData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopCollection, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    let id = format!("col-{}", ts);
    let slug = data
        .slug
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| make_slug(&data.name));
    let is_default = data.is_default.unwrap_or(0);

    if is_default == 1 {
        let _ = conn
            .execute(
                "UPDATE collections SET is_default = 0 WHERE profile_id = ?",
                crate::turso_params![profile_id.clone()],
            )
            .await;
    }

    conn.execute(
        "INSERT INTO collections \
         (id, profile_id, parent_id, title, slug, description, item_ids, sort_order, is_default, is_active) \
         VALUES (?, ?, ?, ?, ?, ?, '[]', 0, ?, 1)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            data.parent_id.clone(),
            data.name.clone(),
            slug.clone(),
            data.description.clone(),
            is_default,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ShopCollection {
        id,
        profile_id,
        parent_id: data.parent_id,
        name: data.name,
        slug,
        description: data.description,
        item_ids: "[]".to_string(),
        sort_order: 0,
        is_default,
        is_active: 1,
    })
}

/// Update a collection's name, slug, parent, description, or default status.
#[tauri::command]
pub async fn shop_update_collection(
    collection_id: String,
    data: UpdateCollectionData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopCollection, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let slug = data
        .slug
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| make_slug(&data.name));

    if let Some(1) = data.is_default {
        let _ = conn
            .execute(
                "UPDATE collections SET is_default = 0 WHERE profile_id = ?",
                crate::turso_params![profile_id.clone()],
            )
            .await;
    }

    let is_default = if let Some(def) = data.is_default {
        conn.execute(
            "UPDATE collections \
             SET title = ?, slug = ?, parent_id = ?, description = ?, is_default = ? \
             WHERE id = ? AND profile_id = ?",
            crate::turso_params![
                data.name.clone(),
                slug.clone(),
                data.parent_id.clone(),
                data.description.clone(),
                def,
                collection_id.clone(),
                profile_id.clone(),
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
        def
    } else {
        conn.execute(
            "UPDATE collections \
             SET title = ?, slug = ?, parent_id = ?, description = ? \
             WHERE id = ? AND profile_id = ?",
            crate::turso_params![
                data.name.clone(),
                slug.clone(),
                data.parent_id.clone(),
                data.description.clone(),
                collection_id.clone(),
                profile_id.clone(),
            ],
        )
        .await
        .map_err(|e| e.to_string())?;

        let mut def = 0i64;
        if let Ok(mut rows) = conn.query(
            "SELECT is_default FROM collections WHERE id = ? AND profile_id = ?",
            crate::turso_params![collection_id.clone(), profile_id.clone()],
        ).await {
            if let Ok(Some(row)) = rows.next().await {
                def = row.get(0).unwrap_or(0);
            }
        }
        def
    };

    Ok(ShopCollection {
        id: collection_id,
        profile_id,
        parent_id: data.parent_id,
        name: data.name,
        slug,
        description: data.description,
        item_ids: "[]".to_string(),
        sort_order: 0,
        is_default,
        is_active: 1,
    })
}

/// Set a collection as default for the active profile.
#[tauri::command]
pub async fn shop_set_default_collection(
    collection_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE collections SET is_default = 0 WHERE profile_id = ?",
        crate::turso_params![profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE collections SET is_default = 1 WHERE id = ? AND profile_id = ?",
        crate::turso_params![collection_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Soft-delete a collection (is_active = 0).
#[tauri::command]
pub async fn shop_delete_collection(
    collection_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE collections SET is_active = 0 WHERE id = ? AND profile_id = ?",
        crate::turso_params![collection_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}
