// src-tauri/src/commands/shop/brands.rs
//
// Shop brand commands with full dedicated brand page design support
//
// Commands:
//   shop_list_brands   — list active brands for active profile
//   shop_get_brand     — get single brand by id or slug
//   shop_create_brand  — insert new brand with optional sections/faq/seo
//   shop_update_brand  — update brand details, layout sections, faq, theme, seo
//   shop_delete_brand  — soft-deactivate brand (is_active = 0)

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopBrand {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub slug: String,
    pub country_origin: Option<String>,
    pub website_url: Option<String>,
    pub media_id: Option<String>,
    pub logo_url: Option<String>,
    pub cover_image_url: Option<String>,
    pub description: Option<String>,
    pub sections: Option<String>,
    pub faq: Option<String>,
    pub additional_details: Option<String>,
    pub ai_summary: Option<String>,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub seo_og_image: Option<String>,
    pub theme: Option<String>,
    pub custom_css: Option<String>,
    pub is_active: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateBrandData {
    pub name: String,
    pub slug: Option<String>,
    pub country_origin: Option<String>,
    pub website_url: Option<String>,
    pub media_id: Option<String>,
    pub logo_url: Option<String>,
    pub cover_image_url: Option<String>,
    pub description: Option<String>,
    pub sections: Option<String>,
    pub faq: Option<String>,
    pub additional_details: Option<String>,
    pub ai_summary: Option<String>,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub seo_og_image: Option<String>,
    pub theme: Option<String>,
    pub custom_css: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBrandData {
    pub name: Option<String>,
    pub slug: Option<String>,
    pub country_origin: Option<String>,
    pub website_url: Option<String>,
    pub media_id: Option<String>,
    pub logo_url: Option<String>,
    pub cover_image_url: Option<String>,
    pub description: Option<String>,
    pub sections: Option<String>,
    pub faq: Option<String>,
    pub additional_details: Option<String>,
    pub ai_summary: Option<String>,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub seo_og_image: Option<String>,
    pub theme: Option<String>,
    pub custom_css: Option<String>,
    pub is_active: Option<bool>,
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

const SELECT_COLS: &str = "id, profile_id, name, slug, country_origin, website_url, media_id, logo_url, cover_image_url, \
     description, sections, faq, additional_details, ai_summary, seo_title, seo_description, seo_og_image, theme, custom_css, is_active, created_at, updated_at";

fn row_to_brand(row: crate::db::turso::TursoRow) -> ShopBrand {
    ShopBrand {
        id: row.get(0).unwrap_or_default(),
        profile_id: row.get(1).unwrap_or_default(),
        name: row.get(2).unwrap_or_default(),
        slug: row.get(3).unwrap_or_default(),
        country_origin: row.get(4).ok(),
        website_url: row.get(5).ok(),
        media_id: row.get(6).ok(),
        logo_url: row.get(7).ok(),
        cover_image_url: row.get(8).ok(),
        description: row.get(9).ok(),
        sections: row.get(10).ok(),
        faq: row.get(11).ok(),
        additional_details: row.get(12).ok(),
        ai_summary: row.get(13).ok(),
        seo_title: row.get(14).ok(),
        seo_description: row.get(15).ok(),
        seo_og_image: row.get(16).ok(),
        theme: row.get(17).ok(),
        custom_css: row.get(18).ok(),
        is_active: row.get(19).unwrap_or(1),
        created_at: row.get(20).unwrap_or(0),
        updated_at: row.get(21).unwrap_or(0),
    }
}

/// List all active brands for the active profile.
#[tauri::command]
pub async fn shop_list_brands(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopBrand>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            &format!(
                "SELECT {SELECT_COLS} FROM shop_brands \
                 WHERE profile_id = ? AND is_active = 1 \
                 ORDER BY name ASC"
            ),
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut brands = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        brands.push(row_to_brand(row));
    }
    Ok(brands)
}

/// Get a single brand by id or slug.
#[tauri::command]
pub async fn shop_get_brand(
    brand_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopBrand, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            &format!(
                "SELECT {SELECT_COLS} FROM shop_brands \
                 WHERE profile_id = ?1 AND (id = ?2 OR slug = ?2)"
            ),
            crate::turso_params![profile_id, brand_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(row_to_brand(row))
    } else {
        Err("Brand not found".into())
    }
}

/// Create a new brand.
#[tauri::command]
pub async fn shop_create_brand(
    data: CreateBrandData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopBrand, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    let id = format!("brand-{}", ts);
    let slug = data
        .slug
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| make_slug(&data.name));
    let sections = data.sections.unwrap_or_else(|| "[]".to_string());
    let faq = data.faq.unwrap_or_else(|| "[]".to_string());
    let additional_details = data.additional_details.unwrap_or_else(|| "{}".to_string());

    conn.execute(
        "INSERT INTO shop_brands \
         (id, profile_id, name, slug, country_origin, website_url, media_id, logo_url, cover_image_url, \
          description, sections, faq, additional_details, ai_summary, seo_title, seo_description, seo_og_image, theme, custom_css, is_active) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,1)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            data.name,
            slug,
            data.country_origin,
            data.website_url,
            data.media_id,
            data.logo_url,
            data.cover_image_url,
            data.description,
            sections,
            faq,
            additional_details,
            data.ai_summary,
            data.seo_title,
            data.seo_description,
            data.seo_og_image,
            data.theme,
            data.custom_css
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    shop_get_brand(id, state).await
}

/// Update brand.
#[tauri::command]
pub async fn shop_update_brand(
    brand_id: String,
    data: UpdateBrandData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopBrand, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    macro_rules! update_col {
        ($col:expr, $val:expr) => {
            conn.execute(
                &format!(
                    "UPDATE shop_brands SET {} = ?1, updated_at = strftime('%s','now') \
                     WHERE id = ?2 AND profile_id = ?3",
                    $col
                ),
                crate::turso_params![$val, brand_id.clone(), profile_id.clone()],
            )
            .await
            .map_err(|e| e.to_string())?;
        };
    }

    if let Some(ref name) = data.name {
        let slug = data.slug.clone().unwrap_or_else(|| make_slug(name));
        conn.execute(
            "UPDATE shop_brands SET name = ?1, slug = ?2, updated_at = strftime('%s','now') \
             WHERE id = ?3 AND profile_id = ?4",
            crate::turso_params![name.clone(), slug, brand_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;
    }
    if let Some(ref v) = data.country_origin { update_col!("country_origin", v.clone()); }
    if let Some(ref v) = data.website_url { update_col!("website_url", v.clone()); }
    if let Some(ref v) = data.media_id { update_col!("media_id", v.clone()); }
    if let Some(ref v) = data.logo_url { update_col!("logo_url", v.clone()); }
    if let Some(ref v) = data.cover_image_url { update_col!("cover_image_url", v.clone()); }
    if let Some(ref v) = data.description { update_col!("description", v.clone()); }
    if let Some(ref v) = data.sections { update_col!("sections", v.clone()); }
    if let Some(ref v) = data.faq { update_col!("faq", v.clone()); }
    if let Some(ref v) = data.additional_details { update_col!("additional_details", v.clone()); }
    if let Some(ref v) = data.ai_summary { update_col!("ai_summary", v.clone()); }
    if let Some(ref v) = data.seo_title { update_col!("seo_title", v.clone()); }
    if let Some(ref v) = data.seo_description { update_col!("seo_description", v.clone()); }
    if let Some(ref v) = data.seo_og_image { update_col!("seo_og_image", v.clone()); }
    if let Some(ref v) = data.theme { update_col!("theme", v.clone()); }
    if let Some(ref v) = data.custom_css { update_col!("custom_css", v.clone()); }
    if let Some(v) = data.is_active { update_col!("is_active", if v { 1_i64 } else { 0 }); }

    shop_get_brand(brand_id, state).await
}

/// Soft-delete brand (sets is_active = 0).
#[tauri::command]
pub async fn shop_delete_brand(
    brand_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_brands SET is_active = 0 WHERE id = ? AND profile_id = ?",
        crate::turso_params![brand_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}
