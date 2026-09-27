// src-tauri/src/commands/sliders.rs
//
// Sliders & Slider Items commands for product galleries, hero banners, and carousels.

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SliderItem {
    pub id: String,
    pub profile_id: String,
    pub slider_id: String,
    pub media_id: Option<String>,
    pub media_url: Option<String>,
    pub position: i64,
    pub caption: Option<String>,
    pub link: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Slider {
    pub id: String,
    pub profile_id: String,
    pub title: String,
    pub items: Vec<SliderItem>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateSliderItemInput {
    pub media_id: Option<String>,
    pub media_url: Option<String>,
    pub caption: Option<String>,
    pub link: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSliderInput {
    pub title: String,
    pub items: Vec<CreateSliderItemInput>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSliderInput {
    pub title: Option<String>,
    pub items: Option<Vec<CreateSliderItemInput>>,
}

fn new_id(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    format!("{}-{}", prefix, ts)
}

/// Helper to fetch items for a given slider ID
async fn fetch_slider_items(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
    slider_id: &str,
) -> Result<Vec<SliderItem>, String> {
    let mut rows = conn
        .query(
            "SELECT si.id, si.profile_id, si.slider_id, si.media_id, m.url, si.position, si.caption, si.link, si.created_at \
             FROM slider_items si \
             LEFT JOIN media m ON si.media_id = m.id \
             WHERE si.slider_id = ?1 AND si.profile_id = ?2 \
             ORDER BY si.position ASC, si.created_at ASC",
            crate::turso_params![slider_id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        items.push(SliderItem {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            slider_id: row.get(2).unwrap_or_default(),
            media_id: row.get(3).ok(),
            media_url: row.get(4).ok(),
            position: row.get(5).unwrap_or(0),
            caption: row.get(6).ok(),
            link: row.get(7).ok(),
            created_at: row.get(8).unwrap_or(0),
        });
    }

    Ok(items)
}

/// List all sliders for the active profile with their items.
#[tauri::command]
pub async fn sliders_list(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<Slider>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, title, created_at FROM sliders \
             WHERE profile_id = ?1 ORDER BY created_at DESC",
            crate::turso_params![profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut sliders = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        let id: String = row.get(0).unwrap_or_default();
        let p_id: String = row.get(1).unwrap_or_default();
        let title: String = row.get(2).unwrap_or_default();
        let created_at: i64 = row.get(3).unwrap_or(0);

        let items = fetch_slider_items(&conn, &profile_id, &id).await?;

        sliders.push(Slider {
            id,
            profile_id: p_id,
            title,
            items,
            created_at,
        });
    }

    Ok(sliders)
}

/// Get a single slider by ID.
#[tauri::command]
pub async fn sliders_get(
    slider_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Slider, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, title, created_at FROM sliders WHERE id = ?1 AND profile_id = ?2",
            crate::turso_params![slider_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        let id: String = row.get(0).unwrap_or_default();
        let p_id: String = row.get(1).unwrap_or_default();
        let title: String = row.get(2).unwrap_or_default();
        let created_at: i64 = row.get(3).unwrap_or(0);

        let items = fetch_slider_items(&conn, &profile_id, &id).await?;

        Ok(Slider {
            id,
            profile_id: p_id,
            title,
            items,
            created_at,
        })
    } else {
        Err(format!("Slider '{}' not found", slider_id))
    }
}

/// Create a new slider with items.
#[tauri::command]
pub async fn sliders_create(
    data: CreateSliderInput,
    state: State<'_, Arc<AppState>>,
) -> Result<Slider, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let slider_id = new_id("slider");

    conn.execute(
        "INSERT INTO sliders (id, profile_id, title, created_at) \
         VALUES (?1, ?2, ?3, strftime('%s','now'))",
        crate::turso_params![slider_id.clone(), profile_id.clone(), data.title.trim()],
    )
    .await
    .map_err(|e| e.to_string())?;

    for (pos, item_input) in data.items.into_iter().enumerate() {
        let item_id = new_id("slide_item");
        conn.execute(
            "INSERT INTO slider_items (id, profile_id, slider_id, media_id, position, caption, link, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%s','now'))",
            crate::turso_params![
                item_id,
                profile_id.clone(),
                slider_id.clone(),
                item_input.media_id,
                pos as i64,
                item_input.caption,
                item_input.link
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    sliders_get(slider_id, state).await
}

/// Update an existing slider & sync its items.
#[tauri::command]
pub async fn sliders_update(
    slider_id: String,
    data: UpdateSliderInput,
    state: State<'_, Arc<AppState>>,
) -> Result<Slider, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    if let Some(ref title) = data.title {
        conn.execute(
            "UPDATE sliders SET title = ?1 WHERE id = ?2 AND profile_id = ?3",
            crate::turso_params![title.trim(), slider_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    if let Some(items) = data.items {
        // Delete old items and insert new synced items
        conn.execute(
            "DELETE FROM slider_items WHERE slider_id = ?1 AND profile_id = ?2",
            crate::turso_params![slider_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

        for (pos, item_input) in items.into_iter().enumerate() {
            let item_id = new_id("slide_item");
            conn.execute(
                "INSERT INTO slider_items (id, profile_id, slider_id, media_id, position, caption, link, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%s','now'))",
                crate::turso_params![
                    item_id,
                    profile_id.clone(),
                    slider_id.clone(),
                    item_input.media_id,
                    pos as i64,
                    item_input.caption,
                    item_input.link
                ],
            )
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    sliders_get(slider_id, state).await
}

/// Delete a slider and all associated items.
#[tauri::command]
pub async fn sliders_delete(
    slider_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM slider_items WHERE slider_id = ?1 AND profile_id = ?2",
        crate::turso_params![slider_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM sliders WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![slider_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}
