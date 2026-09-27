// src-tauri/src/commands/agents/brand.rs
// Brand Foundation context management.
// Persisted in UserDB table: brand_foundation (1 row per profile).

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrandFoundation {
    pub profile_id: String,
    pub about_me: Option<String>,
    pub brand_voice: Option<String>,
    pub working_style: Option<String>,
    pub business_goals: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveBrandFoundationData {
    pub about_me: Option<String>,
    pub brand_voice: Option<String>,
    pub working_style: Option<String>,
    pub business_goals: Option<String>,
}

#[tauri::command]
pub async fn get_brand_foundation(
    state: State<'_, Arc<AppState>>,
) -> Result<BrandFoundation, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT profile_id, about_me, brand_voice, working_style, business_goals, created_at, updated_at \
             FROM brand_foundation WHERE profile_id = ?1 LIMIT 1",
            crate::turso_params![profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        Ok(BrandFoundation {
            profile_id: row.get(0).map_err(|e| e.to_string())?,
            about_me: row.get(1).unwrap_or(None),
            brand_voice: row.get(2).unwrap_or(None),
            working_style: row.get(3).unwrap_or(None),
            business_goals: row.get(4).unwrap_or(None),
            created_at: row.get(5).unwrap_or(0),
            updated_at: row.get(6).unwrap_or(0),
        })
    } else {
        Ok(BrandFoundation {
            profile_id,
            about_me: None,
            brand_voice: None,
            working_style: None,
            business_goals: None,
            created_at: 0,
            updated_at: 0,
        })
    }
}

#[tauri::command]
pub async fn save_brand_foundation(
    data: SaveBrandFoundationData,
    state: State<'_, Arc<AppState>>,
) -> Result<BrandFoundation, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO brand_foundation (profile_id, about_me, brand_voice, working_style, business_goals, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%s','now'), strftime('%s','now')) \
         ON CONFLICT(profile_id) DO UPDATE SET \
           about_me = excluded.about_me, \
           brand_voice = excluded.brand_voice, \
           working_style = excluded.working_style, \
           business_goals = excluded.business_goals, \
           updated_at = strftime('%s','now')",
        crate::turso_params![
            profile_id.clone(),
            data.about_me.clone().unwrap_or_default(),
            data.brand_voice.clone().unwrap_or_default(),
            data.working_style.clone().unwrap_or_default(),
            data.business_goals.clone().unwrap_or_default()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    get_brand_foundation(state).await
}
