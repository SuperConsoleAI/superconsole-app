// Local sync cache for cloud (Turso) data.
//
// Turso is never queried at session start or PTY injection. It is read only on:
//   - app startup (initial sync)
//   - an explicit LLM key / connector update
//   - org switch
//   - a silent 30-minute background tick
//
// The cache is scoped strictly to the signed-in user: only their account keys,
// the orgs they belong to, the projects inside those orgs, and the keys +
// connectors for those orgs/projects. Sign-out wipes it entirely.

use crate::cloud::{self, cell_opt, cell_text, rows, TursoConfig};
use crate::db::{CachedConnector, CachedLlmKey, Db};
use chrono::Utc;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const BACKGROUND_INTERVAL: Duration = Duration::from_secs(30 * 60);

fn now() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

fn llm_table(scope: &str) -> Option<(&'static str, &'static str)> {
    match scope {
        "account" => Some(("account_llm_keys", "user_id")),
        "org" => Some(("org_llm_keys", "org_id")),
        "project" => Some(("project_llm_keys", "project_id")),
        _ => None,
    }
}

// Current user id + the orgs they belong to, from the locally stored identity.
fn identity(app: &AppHandle) -> Option<(String, Vec<String>)> {
    let db = app.state::<Db>();
    let json = db.get_cloud_identity()?;
    let v: serde_json::Value = serde_json::from_str(&json).ok()?;
    let user_id = v["user"]["id"].as_str()?.to_string();
    let orgs = v["orgs"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|o| o["id"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    Some((user_id, orgs))
}

async fn sync_llm(
    app: &AppHandle,
    client: &reqwest::Client,
    cfg: &TursoConfig,
    scope: &str,
    scope_id: &str,
    synced_at: &str,
) {
    let Some((table, id_col)) = llm_table(scope) else {
        return;
    };
    let result = match cloud::turso_execute(
        client,
        cfg,
        &format!(
            "SELECT provider, api_key_encrypted, base_url, extra_env FROM {} WHERE {} = ?",
            table, id_col
        ),
        vec![Some(scope_id.to_string())],
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("superconsole sync llm ({}): {}", scope, e);
            return;
        }
    };

    let keys: Vec<CachedLlmKey> = rows(&result)
        .iter()
        .map(|row| CachedLlmKey {
            provider: cell_text(row, 0),
            credentials_encrypted: cell_opt(row, 1),
            base_url: cell_opt(row, 2),
            extra_env: cell_opt(row, 3),
        })
        .collect();

    let db = app.state::<Db>();
    let _ = db.replace_cached_llm_keys(scope, scope_id, &keys, synced_at);
}

async fn sync_connectors(
    app: &AppHandle,
    client: &reqwest::Client,
    cfg: &TursoConfig,
    scope: &str,
    scope_id: &str,
    synced_at: &str,
) {
    let sql = match scope {
        "account" => {
            if crate::connectors::ensure_account_connectors_table(client, cfg)
                .await
                .is_err()
            {
                return;
            }
            "SELECT service, status, credentials_encrypted FROM account_connectors WHERE user_id = ?"
        }
        "org" => "SELECT service, status, credentials_encrypted FROM org_connectors WHERE org_id = ?",
        "project" => {
            "SELECT service, status, credentials_encrypted FROM connectors WHERE project_id = ?"
        }
        _ => return,
    };
    let result = match cloud::turso_execute(client, cfg, sql, vec![Some(scope_id.to_string())]).await
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("superconsole sync connectors ({}): {}", scope, e);
            return;
        }
    };

    let connectors: Vec<CachedConnector> = rows(&result)
        .iter()
        .map(|row| CachedConnector {
            service: cell_text(row, 0),
            status: cell_opt(row, 1),
            credentials_encrypted: cell_opt(row, 2),
        })
        .collect();

    let db = app.state::<Db>();
    let _ = db.replace_cached_connectors(scope, scope_id, &connectors, synced_at);
}

// Fetch the projects inside an org the user belongs to, then sync each
// project's keys + connectors and record the project -> org mapping.
async fn sync_org_projects(
    app: &AppHandle,
    client: &reqwest::Client,
    cfg: &TursoConfig,
    org_id: &str,
    synced_at: &str,
) {
    let result = match cloud::turso_execute(
        client,
        cfg,
        "SELECT id FROM projects WHERE org_id = ?",
        vec![Some(org_id.to_string())],
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("superconsole sync projects: {}", e);
            return;
        }
    };

    let project_ids: Vec<String> = rows(&result).iter().map(|row| cell_text(row, 0)).collect();
    for project_id in project_ids {
        {
            let db = app.state::<Db>();
            let _ = db.set_project_org(&project_id, org_id, synced_at);
        }
        sync_llm(app, client, cfg, "project", &project_id, synced_at).await;
        sync_connectors(app, client, cfg, "project", &project_id, synced_at).await;
    }
}

/// Full initial sync, scoped to the signed-in user. Clears stale data (e.g. a
/// previous user's) before repopulating. Silent no-op if not signed in.
pub async fn sync_on_startup(app: &AppHandle) {
    let Some((user_id, org_ids)) = identity(app) else {
        // Not signed in: ensure nothing cloud-related lingers locally.
        let db = app.state::<Db>();
        let _ = db.clear_cloud_cache();
        return;
    };

    let Ok(cfg) = cloud::turso_config() else {
        return;
    };
    let client = reqwest::Client::new();
    let synced_at = now();

    {
        let db = app.state::<Db>();
        let _ = db.clear_cloud_cache();
    }

    sync_llm(app, &client, &cfg, "account", &user_id, &synced_at).await;
    sync_connectors(app, &client, &cfg, "account", &user_id, &synced_at).await;
    for org_id in &org_ids {
        sync_llm(app, &client, &cfg, "org", org_id, &synced_at).await;
        sync_connectors(app, &client, &cfg, "org", org_id, &synced_at).await;
        sync_org_projects(app, &client, &cfg, org_id, &synced_at).await;
    }
}

/// Re-sync a single scope after a write or an org switch. entity_type is one of
/// "account", "org", "project"; id is the matching cloud id.
pub async fn sync_on_update(app: &AppHandle, entity_type: &str, id: &str) {
    let Ok(cfg) = cloud::turso_config() else {
        return;
    };
    let client = reqwest::Client::new();
    let synced_at = now();

    match entity_type {
        "account" => {
            sync_llm(app, &client, &cfg, "account", id, &synced_at).await;
            sync_connectors(app, &client, &cfg, "account", id, &synced_at).await;
        }
        "org" => {
            sync_llm(app, &client, &cfg, "org", id, &synced_at).await;
            sync_connectors(app, &client, &cfg, "org", id, &synced_at).await;
            sync_org_projects(app, &client, &cfg, id, &synced_at).await;
        }
        "project" => {
            sync_llm(app, &client, &cfg, "project", id, &synced_at).await;
            sync_connectors(app, &client, &cfg, "project", id, &synced_at).await;
        }
        _ => {}
    }
}

/// Silent refresh every 30 minutes, same tick pattern as scheduler.rs.
pub async fn background_sync_loop(app: AppHandle) {
    loop {
        tokio::time::sleep(BACKGROUND_INTERVAL).await;
        sync_on_startup(&app).await;
    }
}

/// Kick off the initial sync and the background loop.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        sync_on_startup(&app).await;
        background_sync_loop(app).await;
    });
}
