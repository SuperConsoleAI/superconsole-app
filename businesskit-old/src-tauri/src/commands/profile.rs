// src-tauri/src/commands/profile.rs
// Phase 2 — Profile, Links, Products, Analytics Tauri commands.
// All commands gate on license active + active_profile_id in AppState.

use crate::db::user::{
    AnalyticsSummary, CreateProductData, ProductRow, ProfileRow, SettingsRow, UpdateProductData,
    UpdateProfileData, UpsertSettingsData,
};
use crate::AppState;
use std::sync::Arc;
use tauri::State;

// ── Profile ───────────────────────────────────────────────────────────────────

/// Get the full profile record for the active project.
#[tauri::command]
pub async fn get_profile(state: State<'_, Arc<AppState>>) -> Result<ProfileRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    db.get_profile(&profile_id).await.map_err(|e| e.to_string())
}

/// Update mutable profile fields. Only supplied fields are changed (COALESCE).
#[tauri::command]
pub async fn update_profile(
    data: UpdateProfileData,
    state: State<'_, Arc<AppState>>,
) -> Result<ProfileRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    db.update_profile(&profile_id, &data)
        .await
        .map_err(|e| e.to_string())?;
    let updated = db
        .get_profile(&profile_id)
        .await
        .map_err(|e| e.to_string())?;

    // Push the full updated row to CentralDB so it stays in sync
    if let Ok(cdb) = state.cdb().await {
        let _ = cdb.sync_profile_to_central(&updated).await;
    }

    Ok(updated)
}

// ── Page Settings ─────────────────────────────────────────────────────────────

/// Get page/SEO settings for the active profile.
#[tauri::command]
pub async fn get_page_settings(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<SettingsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    db.get_settings(&profile_id)
        .await
        .map_err(|e| e.to_string())
}

/// Upsert page/SEO settings (INSERT OR UPDATE) for the active profile.
#[tauri::command]
pub async fn update_page_settings(
    mut data: UpsertSettingsData,
    state: State<'_, Arc<AppState>>,
) -> Result<SettingsRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    data.profile_id = profile_id;
    let db = state.require_user_db().await?;
    db.upsert_settings(&data).await.map_err(|e| e.to_string())
}

// ── Link Pages ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_link_page(
    category_slug: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<crate::db::user::LinkPageRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    db.get_link_page(&profile_id, &category_slug)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_link_page(
    mut data: crate::db::user::UpsertLinkPageData,
    state: State<'_, Arc<AppState>>,
) -> Result<crate::db::user::LinkPageRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    data.profile_id = profile_id;
    let db = state.require_user_db().await?;
    db.upsert_link_page(&data).await.map_err(|e| e.to_string())
}

// ── Products ──────────────────────────────────────────────────────────────────

/// Get all products for the active profile. Optionally filter by type.
/// Types: "course" | "event" | "service" | "download" | "link" | "membership" | etc.
#[tauri::command]
pub async fn get_products(
    product_type: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ProductRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    db.get_products(&profile_id, product_type.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Get a single product by ID.
#[tauri::command]
pub async fn get_product(
    product_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<ProductRow, String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    db.get_product(&product_id).await.map_err(|e| e.to_string())
}

/// Create a new product under the active profile.
#[tauri::command]
pub async fn create_product(
    mut data: CreateProductData,
    state: State<'_, Arc<AppState>>,
) -> Result<ProductRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    data.profile_id = profile_id;
    let db = state.require_user_db().await?;
    db.create_product(&data).await.map_err(|e| e.to_string())
}

/// Update an existing product. Only supplied fields change.
#[tauri::command]
pub async fn update_product(
    product_id: String,
    data: UpdateProductData,
    state: State<'_, Arc<AppState>>,
) -> Result<ProductRow, String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    db.update_product(&product_id, &data)
        .await
        .map_err(|e| e.to_string())
}

// ── Analytics ─────────────────────────────────────────────────────────────────

/// Get an aggregated analytics summary for the active profile:
/// total views, clicks, sales, earnings, active link/product counts, and 7d/30d series.
#[tauri::command]
pub async fn get_analytics_summary(
    state: State<'_, Arc<AppState>>,
) -> Result<AnalyticsSummary, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    db.get_analytics_summary(&profile_id)
        .await
        .map_err(|e| e.to_string())
}
