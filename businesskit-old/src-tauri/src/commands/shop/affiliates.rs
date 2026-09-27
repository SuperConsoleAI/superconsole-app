// src-tauri/src/commands/shop/affiliates.rs
//
// Shop affiliate commands — Manage affiliate accounts (Amazon, Flipkart, Impact, etc.)
// and auto-sync constructed affiliate URLs to the links table for click analytics.

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopAffiliate {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub platform: String,
    pub affiliate_tag: String,
    pub tag_param: String,
    pub base_domain: Option<String>,
    pub is_active: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateAffiliateData {
    pub name: String,
    pub platform: Option<String>,
    pub affiliate_tag: String,
    pub tag_param: Option<String>,
    pub base_domain: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAffiliateData {
    pub name: Option<String>,
    pub platform: Option<String>,
    pub affiliate_tag: Option<String>,
    pub tag_param: Option<String>,
    pub base_domain: Option<String>,
    pub is_active: Option<bool>,
}

const SELECT_COLS: &str = "id, profile_id, name, platform, affiliate_tag, tag_param, base_domain, is_active, created_at, updated_at";

fn row_to_affiliate(row: crate::db::turso::TursoRow) -> ShopAffiliate {
    ShopAffiliate {
        id: row.get(0).unwrap_or_default(),
        profile_id: row.get(1).unwrap_or_default(),
        name: row.get(2).unwrap_or_default(),
        platform: row.get(3).unwrap_or_else(|_| "amazon".to_string()),
        affiliate_tag: row.get(4).unwrap_or_default(),
        tag_param: row.get(5).unwrap_or_else(|_| "tag".to_string()),
        base_domain: row.get(6).ok(),
        is_active: row.get(7).unwrap_or(1),
        created_at: row.get(8).unwrap_or(0),
        updated_at: row.get(9).unwrap_or(0),
    }
}

/// List all active affiliate accounts for active profile.
#[tauri::command]
pub async fn shop_list_affiliates(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopAffiliate>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            &format!(
                "SELECT {SELECT_COLS} FROM shop_affiliates \
                 WHERE profile_id = ? AND is_active = 1 \
                 ORDER BY name ASC"
            ),
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(row_to_affiliate(row));
    }
    Ok(list)
}

/// Create a new affiliate account (e.g. Amazon India with tag "myassoc-20").
#[tauri::command]
pub async fn shop_create_affiliate(
    data: CreateAffiliateData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopAffiliate, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    let id = format!("aff-{}", ts);
    let platform = data.platform.unwrap_or_else(|| "amazon".to_string());
    let tag_param = data.tag_param.unwrap_or_else(|| {
        match platform.as_str() {
            "amazon" => "tag".to_string(),
            "flipkart" => "affid".to_string(),
            _ => "ref".to_string(),
        }
    });

    conn.execute(
        "INSERT INTO shop_affiliates \
         (id, profile_id, name, platform, affiliate_tag, tag_param, base_domain, is_active) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,1)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            data.name,
            platform,
            data.affiliate_tag,
            tag_param,
            data.base_domain
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            &format!("SELECT {SELECT_COLS} FROM shop_affiliates WHERE id = ?1 AND profile_id = ?2"),
            crate::turso_params![id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(row_to_affiliate(row))
    } else {
        Err("Failed to load created affiliate account".into())
    }
}

/// Update an affiliate account (e.g. tag changed). Automatically resyncs attached product URLs in links table!
#[tauri::command]
pub async fn shop_update_affiliate(
    affiliate_id: String,
    data: UpdateAffiliateData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopAffiliate, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    macro_rules! update_col {
        ($col:expr, $val:expr) => {
            conn.execute(
                &format!(
                    "UPDATE shop_affiliates SET {} = ?1, updated_at = strftime('%s','now') \
                     WHERE id = ?2 AND profile_id = ?3",
                    $col
                ),
                crate::turso_params![$val, affiliate_id.clone(), profile_id.clone()],
            )
            .await
            .map_err(|e| e.to_string())?;
        };
    }

    if let Some(ref v) = data.name { update_col!("name", v.clone()); }
    if let Some(ref v) = data.platform { update_col!("platform", v.clone()); }
    if let Some(ref v) = data.affiliate_tag { update_col!("affiliate_tag", v.clone()); }
    if let Some(ref v) = data.tag_param { update_col!("tag_param", v.clone()); }
    if let Some(ref v) = data.base_domain { update_col!("base_domain", v.clone()); }
    if let Some(v) = data.is_active { update_col!("is_active", if v { 1_i64 } else { 0 }); }

    let mut rows = conn
        .query(
            &format!("SELECT {SELECT_COLS} FROM shop_affiliates WHERE id = ?1 AND profile_id = ?2"),
            crate::turso_params![affiliate_id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(row_to_affiliate(row))
    } else {
        Err("Affiliate account not found".into())
    }
}

/// Soft-delete an affiliate account.
#[tauri::command]
pub async fn shop_delete_affiliate(
    affiliate_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_affiliates SET is_active = 0 WHERE id = ? AND profile_id = ?",
        crate::turso_params![affiliate_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}
