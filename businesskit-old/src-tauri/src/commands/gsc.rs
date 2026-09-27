// src-tauri/src/commands/gsc.rs
//
// WHAT:  Google Search Console + GA4 data commands.
//
// HOW:   Reads from gsc_* and ga4_* tables in UserDB.
//        Data is synced by the CF Worker / n8n on a nightly schedule.
//        The desktop app is read-only here — it just displays the data.
//        The OAuth token + sync config is stored in gsc_ga4_sync.
//
// FLOW:
//   get_gsc_sync_config → reads gsc_ga4_sync WHERE profile_id = active
//   save_gsc_sync_config→ writes gsc_ga4_sync (upsert)
//   get_gsc_summary     → reads latest gsc_snapshots row
//   list_gsc_queries    → top search queries with impressions/clicks/position
//   list_gsc_pages      → top pages with impressions/clicks/CTR
//   get_ga4_summary     → reads latest ga4_snapshots row
//   list_ga4_pages      → top pages by session count
//   list_ga4_sources    → top traffic sources
//
// TABLES READ:
//   gsc_ga4_sync    — OAuth tokens + site URL + sync schedule
//   gsc_snapshots   — nightly snapshots (impressions, clicks, CTR, position)
//   gsc_queries     — top search queries per snapshot
//   gsc_pages       — top pages per snapshot
//   ga4_snapshots   — nightly GA4 snapshots (sessions, users, bounce rate)
//   ga4_pages       — top pages by sessions
//   ga4_sources     — top traffic sources
//
// REFERENCE: src/lib/gsc.ts + src/lib/gsc-service.ts

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GscSyncConfig {
    pub id: String,
    pub profile_id: String,
    pub site_url: Option<String>,
    pub ga4_property_id: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub token_expires_at: Option<i64>,
    pub last_synced_at: Option<i64>,
    pub sync_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GscSnapshotRow {
    pub id: String,
    pub profile_id: String,
    pub date: String,
    pub impressions: i64,
    pub clicks: i64,
    pub ctr: f64,
    pub position: f64,
    pub indexed_pages: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GscQueryRow {
    pub query: String,
    pub impressions: i64,
    pub clicks: i64,
    pub ctr: f64,
    pub position: f64,
    pub snapshot_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GscPageRow {
    pub page_url: String,
    pub impressions: i64,
    pub clicks: i64,
    pub ctr: f64,
    pub position: f64,
    pub snapshot_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ga4SnapshotRow {
    pub id: String,
    pub profile_id: String,
    pub date: String,
    pub sessions: i64,
    pub users: i64,
    pub new_users: i64,
    pub page_views: i64,
    pub bounce_rate: f64,
    pub avg_session_duration: f64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ga4PageRow {
    pub page_path: String,
    pub sessions: i64,
    pub page_views: i64,
    pub bounce_rate: f64,
    pub snapshot_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ga4SourceRow {
    pub source: String,
    pub medium: String,
    pub sessions: i64,
    pub users: i64,
    pub snapshot_id: String,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Get the GSC/GA4 sync configuration for the active profile.
#[tauri::command]
pub async fn get_gsc_sync_config(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<GscSyncConfig>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, site_url, ga4_property_id,
                access_token, refresh_token, token_expires_at,
                last_synced_at, sync_enabled
         FROM gsc_ga4_sync WHERE profile_id=?1 LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        Ok(Some(GscSyncConfig {
            id: row.get(0).map_err(|e| e.to_string())?,
            profile_id: row.get(1).map_err(|e| e.to_string())?,
            site_url: row.get(2).map_err(|e| e.to_string())?,
            ga4_property_id: row.get(3).map_err(|e| e.to_string())?,
            access_token: row.get(4).map_err(|e| e.to_string())?,
            refresh_token: row.get(5).map_err(|e| e.to_string())?,
            token_expires_at: row.get(6).map_err(|e| e.to_string())?,
            last_synced_at: row.get(7).map_err(|e| e.to_string())?,
            sync_enabled: row.get::<i64>(8).unwrap_or(0) != 0,
        }))
    } else {
        Ok(None)
    }
}

/// Save/update the GSC+GA4 sync config (access token, site URL, etc).
#[tauri::command]
pub async fn save_gsc_sync_config(
    site_url: Option<String>,
    ga4_property_id: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
    token_expires_at: Option<i64>,
    sync_enabled: Option<bool>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO gsc_ga4_sync
           (id, profile_id, site_url, ga4_property_id,
            access_token, refresh_token, token_expires_at, sync_enabled)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
         ON CONFLICT(profile_id) DO UPDATE SET
           site_url         = COALESCE(?3, site_url),
           ga4_property_id  = COALESCE(?4, ga4_property_id),
           access_token     = COALESCE(?5, access_token),
           refresh_token    = COALESCE(?6, refresh_token),
           token_expires_at = COALESCE(?7, token_expires_at),
           sync_enabled     = COALESCE(?8, sync_enabled)",
        crate::turso_params![
            id,
            profile_id,
            site_url,
            ga4_property_id,
            access_token,
            refresh_token,
            token_expires_at,
            sync_enabled.map(|v| v as i64)
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Get the most recent GSC snapshot (impressions, clicks, CTR, position).
#[tauri::command]
pub async fn get_gsc_summary(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<GscSnapshotRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, date, impressions, clicks, ctr, position,
                indexed_pages, created_at
         FROM gsc_snapshots WHERE profile_id=?1
         ORDER BY date DESC LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        Ok(Some(GscSnapshotRow {
            id: row.get(0).map_err(|e| e.to_string())?,
            profile_id: row.get(1).map_err(|e| e.to_string())?,
            date: row.get(2).map_err(|e| e.to_string())?,
            impressions: row.get::<i64>(3).unwrap_or(0),
            clicks: row.get::<i64>(4).unwrap_or(0),
            ctr: row.get::<f64>(5).unwrap_or(0.0),
            position: row.get::<f64>(6).unwrap_or(0.0),
            indexed_pages: row.get(7).map_err(|e| e.to_string())?,
            created_at: row.get::<i64>(8).unwrap_or(0),
        }))
    } else {
        Ok(None)
    }
}

/// List top GSC search queries for the latest snapshot.
#[tauri::command]
pub async fn list_gsc_queries(
    limit: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<GscQueryRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Get latest snapshot_id first
    let mut snap_rows = conn
        .query(
            "SELECT id FROM gsc_snapshots WHERE profile_id=?1 ORDER BY date DESC LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let snapshot_id = if let Some(row) = snap_rows.next().await.map_err(|e| e.to_string())? {
        row.get::<String>(0).map_err(|e| e.to_string())?
    } else {
        return Ok(vec![]);
    };

    let mut rows = conn
        .query(
            "SELECT query, impressions, clicks, ctr, position, snapshot_id
         FROM gsc_queries WHERE snapshot_id=?1
         ORDER BY impressions DESC LIMIT ?2",
            crate::turso_params![snapshot_id, limit.unwrap_or(50)],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(GscQueryRow {
            query: row.get(0).map_err(|e| e.to_string())?,
            impressions: row.get::<i64>(1).unwrap_or(0),
            clicks: row.get::<i64>(2).unwrap_or(0),
            ctr: row.get::<f64>(3).unwrap_or(0.0),
            position: row.get::<f64>(4).unwrap_or(0.0),
            snapshot_id: row.get(5).map_err(|e| e.to_string())?,
        });
    }
    Ok(items)
}

/// List top GSC pages for the latest snapshot.
#[tauri::command]
pub async fn list_gsc_pages(
    limit: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<GscPageRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut snap_rows = conn
        .query(
            "SELECT id FROM gsc_snapshots WHERE profile_id=?1 ORDER BY date DESC LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let snapshot_id = if let Some(row) = snap_rows.next().await.map_err(|e| e.to_string())? {
        row.get::<String>(0).map_err(|e| e.to_string())?
    } else {
        return Ok(vec![]);
    };

    let mut rows = conn
        .query(
            "SELECT page_url, impressions, clicks, ctr, position, snapshot_id
         FROM gsc_pages WHERE snapshot_id=?1
         ORDER BY impressions DESC LIMIT ?2",
            crate::turso_params![snapshot_id, limit.unwrap_or(50)],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(GscPageRow {
            page_url: row.get(0).map_err(|e| e.to_string())?,
            impressions: row.get::<i64>(1).unwrap_or(0),
            clicks: row.get::<i64>(2).unwrap_or(0),
            ctr: row.get::<f64>(3).unwrap_or(0.0),
            position: row.get::<f64>(4).unwrap_or(0.0),
            snapshot_id: row.get(5).map_err(|e| e.to_string())?,
        });
    }
    Ok(items)
}

/// Get the most recent GA4 snapshot summary.
#[tauri::command]
pub async fn get_ga4_summary(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<Ga4SnapshotRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, date, sessions, users, new_users, page_views,
                bounce_rate, avg_session_duration, created_at
         FROM ga4_snapshots WHERE profile_id=?1 ORDER BY date DESC LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        Ok(Some(Ga4SnapshotRow {
            id: row.get(0).map_err(|e| e.to_string())?,
            profile_id: row.get(1).map_err(|e| e.to_string())?,
            date: row.get(2).map_err(|e| e.to_string())?,
            sessions: row.get::<i64>(3).unwrap_or(0),
            users: row.get::<i64>(4).unwrap_or(0),
            new_users: row.get::<i64>(5).unwrap_or(0),
            page_views: row.get::<i64>(6).unwrap_or(0),
            bounce_rate: row.get::<f64>(7).unwrap_or(0.0),
            avg_session_duration: row.get::<f64>(8).unwrap_or(0.0),
            created_at: row.get::<i64>(9).unwrap_or(0),
        }))
    } else {
        Ok(None)
    }
}

/// List top GA4 traffic sources for the latest snapshot.
#[tauri::command]
pub async fn list_ga4_sources(
    limit: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<Ga4SourceRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut snap_rows = conn
        .query(
            "SELECT id FROM ga4_snapshots WHERE profile_id=?1 ORDER BY date DESC LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let snapshot_id = if let Some(row) = snap_rows.next().await.map_err(|e| e.to_string())? {
        row.get::<String>(0).map_err(|e| e.to_string())?
    } else {
        return Ok(vec![]);
    };

    let mut rows = conn
        .query(
            "SELECT source, medium, sessions, users, snapshot_id
         FROM ga4_sources WHERE snapshot_id=?1
         ORDER BY sessions DESC LIMIT ?2",
            crate::turso_params![snapshot_id, limit.unwrap_or(30)],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(Ga4SourceRow {
            source: row.get(0).map_err(|e| e.to_string())?,
            medium: row.get(1).map_err(|e| e.to_string())?,
            sessions: row.get::<i64>(2).unwrap_or(0),
            users: row.get::<i64>(3).unwrap_or(0),
            snapshot_id: row.get(4).map_err(|e| e.to_string())?,
        });
    }
    Ok(items)
}
