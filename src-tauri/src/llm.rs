use crate::cloud::{self, cell_opt, cell_text, rows};
use crate::crypto;
use crate::db::Db;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};
use ulid::Ulid;

// Serializes project creation so two concurrent ensure_workspace_project calls
// (e.g. Settings + chat opening at once) can't each insert a duplicate row.
static PROJECT_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

fn project_lock() -> &'static tokio::sync::Mutex<()> {
    PROJECT_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmKeyView {
    pub provider: String,
    pub has_key: bool,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub extra_env: Option<String>,
    pub updated_at: Option<String>,
}

/// Resolved env for a session, plus which providers actually contributed a key
/// (used for best-effort auth-error reporting).
pub struct SessionEnv {
    pub env: Vec<(String, String)>,
    pub providers: Vec<String>,
}

fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

// scope -> (table, id column). Whitelisted; never interpolate user input.
fn scope_table(scope: &str) -> Result<(&'static str, &'static str), String> {
    match scope {
        "account" => Ok(("account_llm_keys", "user_id")),
        "org" => Ok(("org_llm_keys", "org_id")),
        "project" => Ok(("project_llm_keys", "project_id")),
        other => Err(format!("unknown scope '{}'", other)),
    }
}

fn cached_user_id(db: &Db) -> Option<String> {
    let json = db.get_cloud_identity()?;
    let v: serde_json::Value = serde_json::from_str(&json).ok()?;
    v["user"]["id"].as_str().map(|s| s.to_string())
}

#[tauri::command]
pub async fn ensure_workspace_project(
    app: AppHandle,
    workspace_id: i64,
    cloud_org_id: String,
) -> Result<String, String> {
    {
        let db = app.state::<Db>();
        if let Some(existing) = db.get_workspace_project_id(workspace_id) {
            return Ok(existing);
        }
    }

    let _guard = project_lock().lock().await;

    // Re-check under the lock: another call may have linked it meanwhile.
    {
        let db = app.state::<Db>();
        if let Some(existing) = db.get_workspace_project_id(workspace_id) {
            return Ok(existing);
        }
    }

    let (name, path, user_id) = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id)?;
        (ws.name, ws.path, cached_user_id(&db))
    };

    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();

    // Reuse an existing cloud project for this org + path. This makes the call
    // idempotent across devices and recovers from any earlier duplicate row.
    let found = cloud::turso_execute(
        &client,
        &cfg,
        "SELECT id FROM projects WHERE org_id = ? AND local_path_hint = ? ORDER BY id LIMIT 1",
        vec![Some(cloud_org_id.clone()), Some(path.clone())],
    )
    .await?;

    let project_id = if let Some(row) = rows(&found).first() {
        cell_text(row, 0)
    } else {
        let id = Ulid::new().to_string();
        cloud::turso_execute(
            &client,
            &cfg,
            "INSERT INTO projects (id, org_id, name, local_path_hint) VALUES (?, ?, ?, ?)",
            vec![
                Some(id.clone()),
                Some(cloud_org_id.clone()),
                Some(name),
                Some(path),
            ],
        )
        .await?;
        id
    };

    if let Some(uid) = user_id {
        let _ = cloud::turso_execute(
            &client,
            &cfg,
            "INSERT OR IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, 'owner')",
            vec![Some(project_id.clone()), Some(uid)],
        )
        .await;
    }

    {
        let db = app.state::<Db>();
        db.set_workspace_project_id(workspace_id, &project_id)?;
        let _ = db.set_project_org(&project_id, &cloud_org_id, &now_iso());
    }
    crate::sync_manager::sync_on_update(&app, "project", &project_id).await;
    Ok(project_id)
}

#[tauri::command]
pub async fn list_llm_keys(scope: String, scope_id: String) -> Result<Vec<LlmKeyView>, String> {
    let (table, id_col) = scope_table(&scope)?;
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    let result = cloud::turso_execute(
        &client,
        &cfg,
        &format!(
            "SELECT provider, api_key_encrypted, base_url, model, extra_env, updated_at \
             FROM {} WHERE {} = ? ORDER BY provider",
            table, id_col
        ),
        vec![Some(scope_id)],
    )
    .await?;

    Ok(rows(&result)
        .iter()
        .map(|row| {
            let enc = cell_opt(row, 1);
            LlmKeyView {
                provider: cell_text(row, 0),
                has_key: enc.map(|s| !s.is_empty()).unwrap_or(false),
                base_url: cell_opt(row, 2),
                model: cell_opt(row, 3),
                extra_env: cell_opt(row, 4),
                updated_at: cell_opt(row, 5),
            }
        })
        .collect())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn set_llm_key(
    app: AppHandle,
    scope: String,
    scope_id: String,
    provider: String,
    api_key: String,
    base_url: Option<String>,
    model: Option<String>,
    extra_env: Option<String>,
) -> Result<(), String> {
    let (table, id_col) = scope_table(&scope)?;
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    let ts = now_iso();
    let id = Ulid::new().to_string();
    let base_url = base_url.filter(|s| !s.is_empty());
    let model = model.filter(|s| !s.is_empty());
    let extra_env = extra_env.filter(|s| !s.is_empty());

    if api_key.trim().is_empty() {
        cloud::turso_execute(
            &client,
            &cfg,
            &format!(
                "INSERT INTO {table} (id, {id_col}, provider, api_key_encrypted, base_url, model, extra_env, updated_at) \
                 VALUES (?, ?, ?, NULL, ?, ?, ?, ?) \
                 ON CONFLICT({id_col}, provider) DO UPDATE SET \
                   base_url = excluded.base_url, model = excluded.model, \
                   extra_env = excluded.extra_env, updated_at = excluded.updated_at",
            ),
            vec![
                Some(id),
                Some(scope_id.clone()),
                Some(provider),
                base_url,
                model,
                extra_env,
                Some(ts),
            ],
        )
        .await?;
    } else {
        let encrypted = crypto::encrypt(api_key.trim())?;
        cloud::turso_execute(
            &client,
            &cfg,
            &format!(
                "INSERT INTO {table} (id, {id_col}, provider, api_key_encrypted, base_url, model, extra_env, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?) \
                 ON CONFLICT({id_col}, provider) DO UPDATE SET \
                   api_key_encrypted = excluded.api_key_encrypted, base_url = excluded.base_url, \
                   model = excluded.model, extra_env = excluded.extra_env, updated_at = excluded.updated_at",
            ),
            vec![
                Some(id),
                Some(scope_id.clone()),
                Some(provider),
                Some(encrypted),
                base_url,
                model,
                extra_env,
                Some(ts),
            ],
        )
        .await?;
    }
    // Write succeeded: invalidate + re-sync this scope's cache immediately.
    crate::sync_manager::sync_on_update(&app, &scope, &scope_id).await;
    Ok(())
}

#[tauri::command]
pub async fn delete_llm_key(
    app: AppHandle,
    scope: String,
    scope_id: String,
    provider: String,
) -> Result<(), String> {
    let (table, id_col) = scope_table(&scope)?;
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    cloud::turso_execute(
        &client,
        &cfg,
        &format!("DELETE FROM {} WHERE {} = ? AND provider = ?", table, id_col),
        vec![Some(scope_id.clone()), Some(provider)],
    )
    .await?;
    crate::sync_manager::sync_on_update(&app, &scope, &scope_id).await;
    Ok(())
}

fn provider_env(provider: &str, key: &str, base_url: Option<&str>) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut push = |k: &str, v: &str| out.push((k.to_string(), v.to_string()));
    match provider {
        "anthropic" => {
            push("ANTHROPIC_API_KEY", key);
            if let Some(b) = base_url {
                push("ANTHROPIC_BASE_URL", b);
            }
        }
        "openai" => {
            push("OPENAI_API_KEY", key);
            if let Some(b) = base_url {
                push("OPENAI_BASE_URL", b);
            }
        }
        "gemini" => {
            push("GEMINI_API_KEY", key);
            push("GOOGLE_API_KEY", key);
            if let Some(b) = base_url {
                push("GEMINI_BASE_URL", b);
            }
        }
        "openrouter" => {
            push("OPENROUTER_API_KEY", key);
            if let Some(b) = base_url {
                push("OPENROUTER_BASE_URL", b);
            }
        }
        "local" => {
            if !key.is_empty() {
                push("OPENAI_API_KEY", key);
            }
            if let Some(b) = base_url {
                push("OPENAI_BASE_URL", b);
            }
        }
        other => {
            push(&format!("{}_API_KEY", other.to_uppercase()), key);
        }
    }
    out
}

fn parse_extra_env(raw: &str) -> Vec<(String, String)> {
    raw.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let line = line.strip_prefix("export ").unwrap_or(line);
            let (k, v) = line.split_once('=')?;
            let v = v.trim().trim_matches('"').trim_matches('\'');
            Some((k.trim().to_string(), v.to_string()))
        })
        .collect()
}

// Build env from one cached scope level, decrypting credentials locally.
fn apply_cached(
    db: &Db,
    scope: &str,
    scope_id: &str,
    env: &mut Vec<(String, String)>,
    providers: &mut Vec<String>,
) {
    for k in db.get_cached_llm_keys(scope, scope_id) {
        let key = match &k.credentials_encrypted {
            Some(enc) if !enc.is_empty() => crypto::decrypt(enc).unwrap_or_default(),
            _ => String::new(),
        };
        if !key.is_empty() {
            env.extend(provider_env(&k.provider, &key, k.base_url.as_deref()));
            if !providers.contains(&k.provider) {
                providers.push(k.provider.clone());
            }
        } else if k.provider == "local" {
            env.extend(provider_env("local", "", k.base_url.as_deref()));
        }
        if let Some(extra) = &k.extra_env {
            env.extend(parse_extra_env(extra));
        }
    }
}

/// Credentials resolved for a single provider, used by the native chat UI.
pub struct ProviderCredentials {
    pub api_key: Option<String>,
    pub base_url: Option<String>,
}

// Look up one provider's key/base_url from the cache with project > org >
// account precedence (highest first). Returns the first level that has a usable
// entry. Local needs no key, so a base_url alone is enough there.
fn lookup_provider(db: &Db, scope: &str, scope_id: &str, provider: &str) -> Option<ProviderCredentials> {
    for k in db.get_cached_llm_keys(scope, scope_id) {
        if k.provider != provider {
            continue;
        }
        let api_key = match &k.credentials_encrypted {
            Some(enc) if !enc.is_empty() => crypto::decrypt(enc).ok().filter(|s| !s.is_empty()),
            _ => None,
        };
        if api_key.is_some() || k.base_url.is_some() {
            return Some(ProviderCredentials {
                api_key,
                base_url: k.base_url,
            });
        }
    }
    None
}

pub fn resolve_provider_credentials(
    app: &AppHandle,
    workspace_id: i64,
    provider: &str,
) -> Option<ProviderCredentials> {
    let db = app.state::<Db>();
    let project_id = db.get_workspace_project_id(workspace_id)?;

    if let Some(c) = lookup_provider(&db, "project", &project_id, provider) {
        return Some(c);
    }
    if let Some(org_id) = db.get_project_org(&project_id) {
        if let Some(c) = lookup_provider(&db, "org", &org_id, provider) {
            return Some(c);
        }
    }
    if let Some(user_id) = cached_user_id(&db) {
        if let Some(c) = lookup_provider(&db, "account", &user_id, provider) {
            return Some(c);
        }
    }
    None
}

/// Resolve injected env across account -> org -> project (project highest
/// precedence; applied last so it overrides). Reads only the local SQLite
/// cache, never the network, so session start never blocks on Turso.
pub fn session_env(app: &AppHandle, workspace_id: i64) -> SessionEnv {
    let mut env = Vec::new();
    let mut providers = Vec::new();
    let db = app.state::<Db>();

    let Some(project_id) = db.get_workspace_project_id(workspace_id) else {
        return SessionEnv { env, providers };
    };

    let user_id = cached_user_id(&db);
    let org_id = db.get_project_org(&project_id);

    if let Some(uid) = user_id {
        apply_cached(&db, "account", &uid, &mut env, &mut providers);
    }
    if let Some(oid) = org_id {
        apply_cached(&db, "org", &oid, &mut env, &mut providers);
    }
    apply_cached(&db, "project", &project_id, &mut env, &mut providers);

    SessionEnv { env, providers }
}
