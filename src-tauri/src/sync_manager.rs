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

// Silent background tick once every 24 hours. Usage also aggregates on-demand when visiting the Usage page.
const BACKGROUND_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

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

    let db = app.state::<Db>();
    let go_local = crate::connectors::is_user_go_local(&db);
    let existing_keys = if go_local {
        db.get_cached_llm_keys(scope, scope_id)
    } else {
        vec![]
    };

    let keys: Vec<CachedLlmKey> = rows(&result)
        .iter()
        .map(|row| {
            let provider = cell_text(row, 0);
            let mut cred = cell_opt(row, 1);
            if go_local && (cred.is_none() || cred.as_deref() == Some("")) {
                if let Some(existing) = existing_keys.iter().find(|k| k.provider == provider) {
                    cred = existing.credentials_encrypted.clone();
                }
            }
            CachedLlmKey {
                provider,
                credentials_encrypted: cred,
                base_url: cell_opt(row, 2),
                extra_env: cell_opt(row, 3),
            }
        })
        .collect();

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
    if crate::connectors::ensure_connectors_table_for_scope(client, cfg, scope)
        .await
        .is_err()
    {
        return;
    }
    let sql = match scope {
        "account" => "SELECT service, status, credentials_encrypted FROM account_connectors WHERE user_id = ?",
        "org" => "SELECT service, status, credentials_encrypted FROM org_connectors WHERE org_id = ?",
        "project" => "SELECT service, status, credentials_encrypted FROM project_connectors WHERE project_id = ?",
        _ => return,
    };
    let result =
        match cloud::turso_execute(client, cfg, sql, vec![Some(scope_id.to_string())]).await {
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

// Mirror the desktop-managed project settings from the cloud projects row into
// the local workspace columns (cache). Env files / .env stay local-only.
async fn sync_project_settings(
    app: &AppHandle,
    client: &reqwest::Client,
    cfg: &TursoConfig,
    project_id: &str,
) {
    if cloud::ensure_project_settings_columns(client, cfg)
        .await
        .is_err()
    {
        return;
    }
    let result = match cloud::turso_execute(
        client,
        cfg,
        "SELECT default_run_mode, default_cli, default_provider, default_model, \
         script_setup, script_run, script_teardown, script_auto_run, repo_url, description, \
         tagline, details, logo_url, image_url, slider \
         FROM projects WHERE id = ?",
        vec![Some(project_id.to_string())],
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("superconsole sync project settings: {}", e);
            return;
        }
    };
    let Some(row) = rows(&result).into_iter().next() else {
        return;
    };
    let cell_opt = |idx| {
        let s = cell_text(&row, idx);
        if s.trim().is_empty() {
            None
        } else {
            Some(s)
        }
    };
    let tagline = cell_opt(10);
    let details = cell_opt(11);
    let logo_url = cell_opt(12);
    let image_url = cell_opt(13);
    let slider = cell_opt(14);

    let db = app.state::<Db>();
    let _ = db.update_workspace_settings_by_project(
        project_id,
        &cell_text(&row, 0),
        &cell_text(&row, 1),
        &cell_text(&row, 2),
        &cell_text(&row, 3),
        &cell_text(&row, 4),
        &cell_text(&row, 5),
        &cell_text(&row, 6),
        cell_text(&row, 7) == "1",
        &cell_text(&row, 8),
        &cell_text(&row, 9),
        tagline.as_deref(),
        details.as_deref(),
        logo_url.as_deref(),
        image_url.as_deref(),
        slider.as_deref(),
    );
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
        sync_project_settings(app, client, cfg, &project_id).await;
        sync_llm(app, client, cfg, "project", &project_id, synced_at).await;
        sync_connectors(app, client, cfg, "project", &project_id, synced_at).await;
        crate::usage::pull_usage(app, client, cfg, "project_usage", &project_id).await;
    }
}

/// Reconciles any organizations or workspaces created locally while offline with Central Turso DB.
async fn reconcile_offline_entities(
    app: &AppHandle,
    client: &reqwest::Client,
    cfg: &TursoConfig,
    user_id: &str,
) {
    let db = app.state::<Db>();

    // 1. Reconcile offline-created organizations up to Turso
    if let Ok(local_orgs) = db.list_organizations() {
        for org in local_orgs {
            let final_org_id = match org.org_id {
                Some(ref oid) if !oid.is_empty() => oid.clone(),
                _ => {
                    let new_id = ulid::Ulid::new().to_string();
                    let _ = db.set_organization_org_id(org.id, &new_id);
                    new_id
                }
            };

            let _ = cloud::turso_execute(
                client,
                cfg,
                "INSERT OR IGNORE INTO organizations (id, name, plan, owner_id) VALUES (?, ?, 'free', ?)",
                vec![Some(final_org_id.clone()), Some(org.name.clone()), Some(user_id.to_string())],
            )
            .await;

            let _ = cloud::turso_execute(
                client,
                cfg,
                "INSERT OR IGNORE INTO org_members (org_id, user_id, role) VALUES (?, ?, 'owner')",
                vec![Some(final_org_id.clone()), Some(user_id.to_string())],
            )
            .await;
        }
    }

    // 2. Reconcile offline-created workspaces up to Turso projects table
    if let Ok(workspaces) = db.list_workspaces() {
        for ws in workspaces {
            if ws.project_id.is_none() {
                let target_org_id = ws.org_id.clone().or_else(|| {
                    db.get_organization(ws.organization_id).ok().and_then(|o| o.org_id)
                });
                if let Some(org_id) = target_org_id {
                    let _ = crate::llm::ensure_workspace_project(app.clone(), ws.id, org_id).await;
                }
            }
        }
    }
}

/// Full initial sync, scoped to the signed-in user. Silent no-op if not signed in.
pub async fn sync_on_startup(app: &AppHandle) {
    let Some((user_id, org_ids)) = identity(app) else {
        return;
    };

    let Ok(cfg) = cloud::turso_config() else {
        return;
    };
    let client = reqwest::Client::new();
    let synced_at = now();

    // 1. Reconcile any locally created offline entities (orgs + projects)
    reconcile_offline_entities(app, &client, &cfg, &user_id).await;

    // 2. Re-push any usage events that never reached the cloud (e.g. offline at
    // session end) before pulling the shared totals back down.
    let pending = {
        let db = app.state::<Db>();
        db.unsynced_usage_events().unwrap_or_default()
    };
    for ev in &pending {
        crate::usage::push_event_to_cloud(app, ev).await;
    }

    sync_llm(app, &client, &cfg, "account", &user_id, &synced_at).await;
    sync_connectors(app, &client, &cfg, "account", &user_id, &synced_at).await;
    crate::usage::pull_usage(app, &client, &cfg, "account_usage", &user_id).await;
    for org_id in &org_ids {
        sync_llm(app, &client, &cfg, "org", org_id, &synced_at).await;
        sync_connectors(app, &client, &cfg, "org", org_id, &synced_at).await;
        crate::usage::pull_usage(app, &client, &cfg, "org_usage", org_id).await;
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
            crate::usage::pull_usage(app, &client, &cfg, "account_usage", id).await;
        }
        "org" => {
            sync_llm(app, &client, &cfg, "org", id, &synced_at).await;
            sync_connectors(app, &client, &cfg, "org", id, &synced_at).await;
            crate::usage::pull_usage(app, &client, &cfg, "org_usage", id).await;
            sync_org_projects(app, &client, &cfg, id, &synced_at).await;
        }
        "project" => {
            sync_project_settings(app, &client, &cfg, id).await;
            sync_llm(app, &client, &cfg, "project", id, &synced_at).await;
            sync_connectors(app, &client, &cfg, "project", id, &synced_at).await;
            crate::usage::pull_usage(app, &client, &cfg, "project_usage", id).await;
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
