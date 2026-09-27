// src-tauri/src/commands/links.rs
use crate::db::links::{CreateLinkData, LinkRow, UpdateLinkData};
use crate::AppState;
use std::sync::Arc;
use tauri::State;

// ── Links ────────────────────────────────────────────────────────────────────

/// Get all links for the active profile
#[tauri::command]
pub async fn get_links(state: State<'_, Arc<AppState>>) -> Result<Vec<LinkRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    db.get_links(&profile_id).await.map_err(|e| e.to_string())
}

/// Create a new link
#[tauri::command]
pub async fn create_link(
    data: CreateLinkData,
    state: State<'_, Arc<AppState>>,
) -> Result<LinkRow, String> {
    state.require_license().await?;
    let db = state.require_user_db().await?;
    db.create_link(&data).await.map_err(|e| e.to_string())
}

/// Update an existing link
#[tauri::command]
pub async fn update_link(
    id: String,
    data: UpdateLinkData,
    state: State<'_, Arc<AppState>>,
) -> Result<LinkRow, String> {
    state.require_license().await?;
    let db = state.require_user_db().await?;
    db.update_link(&id, &data)
        .await
        .map_err(|e| e.to_string())?;
    db.get_link(&id).await.map_err(|e| e.to_string())
}

/// Delete a link
#[tauri::command]
pub async fn delete_link(id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.require_license().await?;
    let db = state.require_user_db().await?;
    db.delete_link(&id).await.map_err(|e| e.to_string())
}

/// Reorder links within a category (bulk update order_index)
#[tauri::command]
pub async fn reorder_links(
    updates: Vec<(String, i64)>, // tuple: (link_id, new_order_index)
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let db = state.require_user_db().await?;
    for (id, order_index) in updates {
        db.update_link(
            &id,
            &UpdateLinkData {
                order_index: Some(order_index),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
