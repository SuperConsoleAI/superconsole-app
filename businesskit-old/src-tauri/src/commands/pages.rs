use crate::db::pages::{CreatePageData, PageRecord, UpdatePageData};
use crate::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_pages_by_profile(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<PageRecord>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    db.get_pages(&profile_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_page_by_id(
    id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<PageRecord, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    db.get_page(&profile_id, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_page_by_slug(
    slug: String,
    state: State<'_, Arc<AppState>>,
) -> Result<PageRecord, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    db.get_page_by_slug(&profile_id, &slug)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_page(
    data: CreatePageData,
    state: State<'_, Arc<AppState>>,
) -> Result<PageRecord, String> {
    state.require_license().await?;
    let db = state.require_user_db().await?;
    db.create_page(&data).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_page(
    id: String,
    data: UpdatePageData,
    state: State<'_, Arc<AppState>>,
) -> Result<PageRecord, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    db.update_page(&profile_id, &id, &data)
        .await
        .map_err(|e| e.to_string())?;
    db.get_page(&profile_id, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_page(id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    db.delete_page(&profile_id, &id)
        .await
        .map_err(|e| e.to_string())
}
