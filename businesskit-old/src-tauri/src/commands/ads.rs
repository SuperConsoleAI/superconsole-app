// src-tauri/src/commands/ads.rs
//
// WHAT:  Ad account + campaign management commands.
//
// HOW:   Reads/writes ad_accounts and ad_campaigns tables in UserDB.
//        The desktop stores ad account connections (Google Ads, Meta, TikTok etc.)
//        and mirrors campaign metadata locally for quick access. Analytics are
//        synced by the CF Worker / n8n on a schedule.
//
// FLOW:
//   list_ad_accounts  → all connected ad platforms
//   upsert_ad_account → connect a new platform or refresh token
//   list_campaigns    → all campaigns (filter by account or status)
//   create_campaign   → insert new campaign record (status=draft)
//   pause/activate    → toggle campaign status
//   archive_campaign  → soft-delete
//
// TABLES TOUCHED:
//   ad_accounts   — platform connections (Google, Meta, TikTok, LinkedIn)
//   ad_campaigns  — campaign metadata + aggregate analytics
//   ad_analytics  — daily campaign analytics snapshots
//
// REFERENCE: src/lib/ads.ts + src/lib/ads-service.ts

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdAccountRow {
    pub id: String,
    pub profile_id: String,
    pub platform: String, // google | meta | tiktok | linkedin | twitter
    pub account_name: Option<String>,
    pub platform_account_id: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub token_expires_at: Option<i64>,
    pub is_connected: bool,
    pub currency: Option<String>,
    pub timezone: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CampaignRow {
    pub id: String,
    pub profile_id: String,
    pub account_id: String,
    pub platform: String,
    pub platform_campaign_id: Option<String>,
    pub name: String,
    pub status: String, // draft | active | paused | archived
    pub objective: Option<String>,
    pub budget_cents: Option<i64>,
    pub budget_type: Option<String>, // daily | lifetime
    pub start_date: Option<i64>,
    pub end_date: Option<i64>,
    pub spend_cents: i64,
    pub impressions: i64,
    pub clicks: i64,
    pub conversions: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCampaignData {
    pub account_id: String,
    pub platform: String,
    pub name: String,
    pub objective: Option<String>,
    pub budget_cents: Option<i64>,
    pub budget_type: Option<String>,
    pub start_date: Option<i64>,
    pub end_date: Option<i64>,
}

// ── Row extractors ────────────────────────────────────────────────────────────

fn ad_account_from_row(row: &crate::db::turso::TursoRow) -> Result<AdAccountRow, String> {
    Ok(AdAccountRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        platform: row.get(2).map_err(|e| e.to_string())?,
        account_name: row.get(3).map_err(|e| e.to_string())?,
        platform_account_id: row.get(4).map_err(|e| e.to_string())?,
        access_token: row.get(5).map_err(|e| e.to_string())?,
        refresh_token: row.get(6).map_err(|e| e.to_string())?,
        token_expires_at: row.get(7).map_err(|e| e.to_string())?,
        is_connected: row.get::<i64>(8).unwrap_or(0) != 0,
        currency: row.get(9).map_err(|e| e.to_string())?,
        timezone: row.get(10).map_err(|e| e.to_string())?,
        created_at: row.get::<i64>(11).unwrap_or(0),
        updated_at: row.get::<i64>(12).unwrap_or(0),
    })
}

fn campaign_from_row(row: &crate::db::turso::TursoRow) -> Result<CampaignRow, String> {
    Ok(CampaignRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        account_id: row.get(2).map_err(|e| e.to_string())?,
        platform: row.get(3).map_err(|e| e.to_string())?,
        platform_campaign_id: row.get(4).map_err(|e| e.to_string())?,
        name: row.get(5).map_err(|e| e.to_string())?,
        status: row.get(6).map_err(|e| e.to_string())?,
        objective: row.get(7).map_err(|e| e.to_string())?,
        budget_cents: row.get(8).map_err(|e| e.to_string())?,
        budget_type: row.get(9).map_err(|e| e.to_string())?,
        start_date: row.get(10).map_err(|e| e.to_string())?,
        end_date: row.get(11).map_err(|e| e.to_string())?,
        spend_cents: row.get::<i64>(12).unwrap_or(0),
        impressions: row.get::<i64>(13).unwrap_or(0),
        clicks: row.get::<i64>(14).unwrap_or(0),
        conversions: row.get::<i64>(15).unwrap_or(0),
        created_at: row.get::<i64>(16).unwrap_or(0),
        updated_at: row.get::<i64>(17).unwrap_or(0),
    })
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// List all ad accounts connected for the active profile.
#[tauri::command]
pub async fn list_ad_accounts(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<AdAccountRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, platform, account_name, platform_account_id,
                access_token, refresh_token, token_expires_at, is_connected,
                currency, timezone, created_at, updated_at
         FROM ad_accounts WHERE profile_id = ?1 ORDER BY platform ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(ad_account_from_row(&row)?);
    }
    Ok(items)
}

/// Upsert an ad account connection (connect or refresh token).
#[tauri::command]
pub async fn upsert_ad_account(
    platform: String,
    platform_account_id: String,
    account_name: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
    token_expires_at: Option<i64>,
    currency: Option<String>,
    timezone: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<AdAccountRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO ad_accounts
           (id, profile_id, platform, account_name, platform_account_id,
            access_token, refresh_token, token_expires_at, is_connected,
            currency, timezone, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,?9,?10, unixepoch(), unixepoch())
         ON CONFLICT(profile_id, platform) DO UPDATE SET
           account_name       = COALESCE(?4,  account_name),
           platform_account_id= COALESCE(?5,  platform_account_id),
           access_token       = COALESCE(?6,  access_token),
           refresh_token      = COALESCE(?7,  refresh_token),
           token_expires_at   = COALESCE(?8,  token_expires_at),
           is_connected       = 1,
           currency           = COALESCE(?9,  currency),
           timezone           = COALESCE(?10, timezone),
           updated_at         = unixepoch()",
        crate::turso_params![
            id,
            profile_id.clone(),
            platform.clone(),
            account_name,
            platform_account_id,
            access_token,
            refresh_token,
            token_expires_at,
            currency,
            timezone
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, platform, account_name, platform_account_id,
                access_token, refresh_token, token_expires_at, is_connected,
                currency, timezone, created_at, updated_at
         FROM ad_accounts WHERE profile_id = ?1 AND platform = ?2 LIMIT 1",
            crate::turso_params![profile_id, platform],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        ad_account_from_row(&row)
    } else {
        Err("Ad account upsert failed".to_string())
    }
}

/// Disconnect an ad account (clear tokens, set is_connected=0).
#[tauri::command]
pub async fn disconnect_ad_account(
    account_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE ad_accounts SET is_connected=0, access_token=NULL,
         refresh_token=NULL, updated_at=unixepoch()
         WHERE id=?1 AND profile_id=?2",
        crate::turso_params![account_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// List campaigns, optionally filtered by account_id or status.
#[tauri::command]
pub async fn list_campaigns(
    account_id: Option<String>,
    status: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CampaignRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, account_id, platform, platform_campaign_id,
                name, status, objective, budget_cents, budget_type,
                start_date, end_date, spend_cents, impressions, clicks,
                conversions, created_at, updated_at
         FROM ad_campaigns
         WHERE profile_id=?1
           AND (?2 IS NULL OR account_id=?2)
           AND (?3 IS NULL OR status=?3)
         ORDER BY created_at DESC",
            crate::turso_params![profile_id, account_id, status],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(campaign_from_row(&row)?);
    }
    Ok(items)
}

/// Create a new campaign record (status=draft).
#[tauri::command]
pub async fn create_campaign(
    data: CreateCampaignData,
    state: State<'_, Arc<AppState>>,
) -> Result<CampaignRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO ad_campaigns
           (id, profile_id, account_id, platform, name, status, objective,
            budget_cents, budget_type, start_date, end_date,
            spend_cents, impressions, clicks, conversions,
            created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,'draft',?6,?7,?8,?9,?10,0,0,0,0,
                 unixepoch(), unixepoch())",
        crate::turso_params![
            id.clone(),
            profile_id,
            data.account_id,
            data.platform,
            data.name,
            data.objective,
            data.budget_cents,
            data.budget_type,
            data.start_date,
            data.end_date
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, account_id, platform, platform_campaign_id,
                name, status, objective, budget_cents, budget_type,
                start_date, end_date, spend_cents, impressions, clicks,
                conversions, created_at, updated_at
         FROM ad_campaigns WHERE id=?1",
            crate::turso_params![id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        campaign_from_row(&row)
    } else {
        Err("Campaign insert failed".to_string())
    }
}

/// Pause an active campaign.
#[tauri::command]
pub async fn pause_campaign(
    campaign_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE ad_campaigns SET status='paused', updated_at=unixepoch()
         WHERE id=?1 AND profile_id=?2",
        crate::turso_params![campaign_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Activate a paused or draft campaign.
#[tauri::command]
pub async fn activate_campaign(
    campaign_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE ad_campaigns SET status='active', updated_at=unixepoch()
         WHERE id=?1 AND profile_id=?2",
        crate::turso_params![campaign_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Archive a campaign (soft-delete).
#[tauri::command]
pub async fn archive_campaign(
    campaign_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE ad_campaigns SET status='archived', updated_at=unixepoch()
         WHERE id=?1 AND profile_id=?2",
        crate::turso_params![campaign_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}
