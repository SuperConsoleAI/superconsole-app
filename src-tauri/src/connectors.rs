// Phase 17 — Project-level + Org-level connectors (desktop).
//
// Credentials are stored as an encrypted JSON blob (field -> value) in the
// existing `credentials_encrypted` column of the Turso `connectors` /
// `org_connectors` tables. Same AES-256-GCM/HKDF key as LLM keys, so values set
// on either the desktop or the web portal decrypt on both.
//
// At PTY session start each field is injected as an env var per the registry
// mapping, with project connectors overriding org connectors. Runtime injection
// reads only the local connectors_cache, never Turso.
//
// SECURITY / PRODUCTION TODO (same as auth.rs / cloud.rs): talks to Turso with
// the repo-root .env token; move behind the Cloudflare Worker before shipping.

use crate::cloud::{self, cell_opt, cell_text, rows};
use crate::crypto;
use crate::db::Db;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use tauri::{AppHandle, Manager};
use ulid::Ulid;

struct Field {
    key: &'static str,
    env: &'static str,
    secret: bool,
}

struct Def {
    service: &'static str,
    fields: &'static [Field],
}

const REGISTRY: &[Def] = &[
    Def {
        service: "gmail",
        fields: &[
            Field { key: "api_key", env: "GMAIL_API_KEY", secret: true },
            Field { key: "email", env: "GMAIL_EMAIL", secret: false },
        ],
    },
    Def {
        service: "google_drive",
        fields: &[Field { key: "api_key", env: "GOOGLE_DRIVE_API_KEY", secret: true }],
    },
    Def {
        service: "shopify",
        fields: &[
            Field { key: "api_key", env: "SHOPIFY_API_KEY", secret: true },
            Field { key: "shop_domain", env: "SHOPIFY_SHOP_DOMAIN", secret: false },
        ],
    },
    Def {
        service: "beehiiv",
        fields: &[
            Field { key: "api_key", env: "BEEHIIV_API_KEY", secret: true },
            Field { key: "publication_id", env: "BEEHIIV_PUBLICATION_ID", secret: false },
        ],
    },
    Def {
        service: "convertkit",
        fields: &[Field { key: "api_key", env: "CONVERTKIT_API_KEY", secret: true }],
    },
    Def {
        service: "stripe",
        fields: &[Field { key: "api_key", env: "STRIPE_API_KEY", secret: true }],
    },
    Def {
        service: "buffer",
        fields: &[Field { key: "access_token", env: "BUFFER_ACCESS_TOKEN", secret: true }],
    },
    Def {
        service: "ga4",
        fields: &[
            Field { key: "api_secret", env: "GA4_API_SECRET", secret: true },
            Field { key: "measurement_id", env: "GA4_MEASUREMENT_ID", secret: false },
        ],
    },
    Def {
        service: "turso",
        fields: &[
            Field { key: "auth_token", env: "TURSO_AUTH_TOKEN", secret: true },
            Field { key: "url", env: "TURSO_DATABASE_URL", secret: false },
        ],
    },
    Def {
        service: "supabase",
        fields: &[
            Field { key: "service_role_key", env: "SUPABASE_SERVICE_ROLE_KEY", secret: true },
            Field { key: "url", env: "SUPABASE_URL", secret: false },
        ],
    },
    Def {
        service: "notion",
        fields: &[Field { key: "api_key", env: "NOTION_API_KEY", secret: true }],
    },
    Def {
        service: "airtable",
        fields: &[Field { key: "api_key", env: "AIRTABLE_API_KEY", secret: true }],
    },
    Def {
        service: "telegram",
        fields: &[Field { key: "bot_token", env: "TELEGRAM_BOT_TOKEN", secret: true }],
    },
    Def {
        service: "slack",
        fields: &[Field { key: "bot_token", env: "SLACK_BOT_TOKEN", secret: true }],
    },
    Def {
        service: "github",
        fields: &[Field { key: "token", env: "GITHUB_TOKEN", secret: true }],
    },
    Def {
        service: "linear",
        fields: &[Field { key: "api_key", env: "LINEAR_API_KEY", secret: true }],
    },
];

fn connector_def(service: &str) -> Option<&'static Def> {
    REGISTRY.iter().find(|d| d.service == service)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorFieldValue {
    pub key: String,
    pub secret: bool,
    /// Plaintext value for non-secret fields; None for secrets.
    pub value: Option<String>,
    pub has_value: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorView {
    pub service: String,
    pub status: Option<String>,
    pub fields: Vec<ConnectorFieldValue>,
}

fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

fn cached_user_id(db: &Db) -> Option<String> {
    let json = db.get_cloud_identity()?;
    let v: Value = serde_json::from_str(&json).ok()?;
    v["user"]["id"].as_str().map(|s| s.to_string())
}

// scope -> (table, id column, has_scope_column). Whitelisted; never interpolate.
fn scope_table(scope: &str) -> Result<(&'static str, &'static str, bool), String> {
    match scope {
        "account" => Ok(("account_connectors", "user_id", false)),
        "project" => Ok(("connectors", "project_id", true)),
        "org" => Ok(("org_connectors", "org_id", false)),
        other => Err(format!("unknown scope '{}'", other)),
    }
}

/// Idempotent bootstrap for account-scoped connectors so the feature works
/// regardless of cloud migration order. Mirrors superconsole-web Drizzle schema.
pub async fn ensure_account_connectors_table(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
) -> Result<(), String> {
    cloud::turso_execute(
        client,
        cfg,
        "CREATE TABLE IF NOT EXISTS account_connectors (\
            id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, service TEXT NOT NULL, \
            credentials_encrypted TEXT, status TEXT NOT NULL DEFAULT 'disconnected', \
            connected_by TEXT, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
        vec![],
    )
    .await?;
    cloud::turso_execute(
        client,
        cfg,
        "CREATE UNIQUE INDEX IF NOT EXISTS account_connectors_user_service_unq \
         ON account_connectors (user_id, service)",
        vec![],
    )
    .await?;
    Ok(())
}

fn parse_blob(encrypted: Option<&str>) -> Map<String, Value> {
    let Some(enc) = encrypted.filter(|s| !s.is_empty()) else {
        return Map::new();
    };
    let Ok(plain) = crypto::decrypt(enc) else {
        return Map::new();
    };
    serde_json::from_str::<Value>(&plain)
        .ok()
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

fn field_string(blob: &Map<String, Value>, key: &str) -> Option<String> {
    blob.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

fn view_from_blob(def: &Def, status: Option<String>, blob: &Map<String, Value>) -> ConnectorView {
    let fields = def
        .fields
        .iter()
        .map(|f| {
            let val = field_string(blob, f.key);
            ConnectorFieldValue {
                key: f.key.to_string(),
                secret: f.secret,
                has_value: val.is_some(),
                value: if f.secret { None } else { val },
            }
        })
        .collect();
    ConnectorView {
        service: def.service.to_string(),
        status,
        fields,
    }
}

#[tauri::command]
pub async fn list_connectors(scope: String, scope_id: String) -> Result<Vec<ConnectorView>, String> {
    let (table, id_col, _) = scope_table(&scope)?;
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    if scope == "account" {
        ensure_account_connectors_table(&client, &cfg).await?;
    }
    let result = cloud::turso_execute(
        &client,
        &cfg,
        &format!(
            "SELECT service, status, credentials_encrypted FROM {} WHERE {} = ? ORDER BY service",
            table, id_col
        ),
        vec![Some(scope_id)],
    )
    .await?;

    Ok(rows(&result)
        .iter()
        .filter_map(|row| {
            let service = cell_text(row, 0);
            let def = connector_def(&service)?;
            let blob = parse_blob(cell_opt(row, 2).as_deref());
            Some(view_from_blob(def, cell_opt(row, 1), &blob))
        })
        .collect())
}

#[tauri::command]
pub async fn set_connector(
    app: AppHandle,
    scope: String,
    scope_id: String,
    service: String,
    fields: HashMap<String, String>,
) -> Result<(), String> {
    let (table, id_col, has_scope) = scope_table(&scope)?;
    let def = connector_def(&service).ok_or_else(|| format!("unknown service '{}'", service))?;

    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    if scope == "account" {
        ensure_account_connectors_table(&client, &cfg).await?;
    }

    // Merge with any existing blob so blank secret fields keep their value.
    let existing = cloud::turso_execute(
        &client,
        &cfg,
        &format!(
            "SELECT credentials_encrypted FROM {} WHERE {} = ? AND service = ?",
            table, id_col
        ),
        vec![Some(scope_id.clone()), Some(service.clone())],
    )
    .await?;
    let prev = parse_blob(
        rows(&existing)
            .first()
            .and_then(|r| cell_opt(r, 0))
            .as_deref(),
    );

    let mut blob = Map::new();
    for f in def.fields {
        let incoming = fields.get(f.key).map(|s| s.trim().to_string());
        if f.secret {
            match incoming {
                Some(v) if !v.is_empty() => {
                    blob.insert(f.key.to_string(), Value::String(v));
                }
                _ => {
                    if let Some(old) = field_string(&prev, f.key) {
                        blob.insert(f.key.to_string(), Value::String(old));
                    }
                }
            }
        } else if let Some(v) = incoming {
            if !v.is_empty() {
                blob.insert(f.key.to_string(), Value::String(v));
            }
        }
    }

    if blob.is_empty() {
        return Err("Enter at least one credential".to_string());
    }

    let plaintext = serde_json::to_string(&Value::Object(blob)).map_err(|e| e.to_string())?;
    let encrypted = crypto::encrypt(&plaintext)?;
    let user_id = cached_user_id(&app.state::<Db>());
    let ts = now_iso();
    let id = Ulid::new().to_string();

    let sql = if has_scope {
        format!(
            "INSERT INTO {table} (id, {id_col}, service, credentials_encrypted, scope, status, connected_by, updated_at) \
             VALUES (?, ?, ?, ?, 'project', 'connected', ?, ?) \
             ON CONFLICT({id_col}, service) DO UPDATE SET \
               credentials_encrypted = excluded.credentials_encrypted, status = 'connected', \
               connected_by = excluded.connected_by, updated_at = excluded.updated_at"
        )
    } else {
        format!(
            "INSERT INTO {table} (id, {id_col}, service, credentials_encrypted, status, connected_by, updated_at) \
             VALUES (?, ?, ?, ?, 'connected', ?, ?) \
             ON CONFLICT({id_col}, service) DO UPDATE SET \
               credentials_encrypted = excluded.credentials_encrypted, status = 'connected', \
               connected_by = excluded.connected_by, updated_at = excluded.updated_at"
        )
    };

    cloud::turso_execute(
        &client,
        &cfg,
        &sql,
        vec![
            Some(id),
            Some(scope_id.clone()),
            Some(service),
            Some(encrypted),
            user_id,
            Some(ts),
        ],
    )
    .await?;

    crate::sync_manager::sync_on_update(&app, &scope, &scope_id).await;
    Ok(())
}

#[tauri::command]
pub async fn delete_connector(
    app: AppHandle,
    scope: String,
    scope_id: String,
    service: String,
) -> Result<(), String> {
    let (table, id_col, _) = scope_table(&scope)?;
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    if scope == "account" {
        ensure_account_connectors_table(&client, &cfg).await?;
    }
    cloud::turso_execute(
        &client,
        &cfg,
        &format!("DELETE FROM {} WHERE {} = ? AND service = ?", table, id_col),
        vec![Some(scope_id.clone()), Some(service)],
    )
    .await?;
    crate::sync_manager::sync_on_update(&app, &scope, &scope_id).await;
    Ok(())
}

// --- Runtime: env injection + system-prompt context (cache only) ---

fn set_env(env: &mut Vec<(String, String)>, key: &str, value: String) {
    env.retain(|(k, _)| k != key);
    env.push((key.to_string(), value));
}

fn apply_scope(db: &Db, scope: &str, scope_id: &str, env: &mut Vec<(String, String)>) {
    for c in db.get_cached_connectors(scope, scope_id) {
        let Some(def) = connector_def(&c.service) else {
            continue;
        };
        let blob = parse_blob(c.credentials_encrypted.as_deref());
        for f in def.fields {
            if let Some(v) = field_string(&blob, f.key) {
                set_env(env, f.env, v);
            }
        }
    }
}

/// Connector env for a session, project overriding org. Falls back to the local
/// Telegram setting when no connector provides a bot token. Cache-only; never
/// blocks on the network.
pub fn session_env(app: &AppHandle, workspace_id: i64) -> Vec<(String, String)> {
    let db = app.state::<Db>();
    let mut env: Vec<(String, String)> = Vec::new();

    if let Some(user_id) = cached_user_id(&db) {
        apply_scope(&db, "account", &user_id, &mut env);
    }
    if let Some(project_id) = db.get_workspace_project_id(workspace_id) {
        if let Some(org_id) = db.get_project_org(&project_id) {
            apply_scope(&db, "org", &org_id, &mut env);
        }
        apply_scope(&db, "project", &project_id, &mut env);
    }

    if !env.iter().any(|(k, _)| k == "TELEGRAM_BOT_TOKEN") {
        if let Some(tok) = db.get_setting("telegram_token") {
            if !tok.is_empty() {
                env.push(("TELEGRAM_BOT_TOKEN".to_string(), tok));
            }
        }
    }
    env
}

/// Human-readable labels of connected services (project + org), for the chat
/// system prompt. Cache-only.
pub fn connected_services(app: &AppHandle, workspace_id: i64) -> Vec<String> {
    let db = app.state::<Db>();
    let mut services: Vec<String> = Vec::new();
    let mut push = |service: &str| {
        if connector_def(service).is_some() && !services.iter().any(|s| s == service) {
            services.push(service.to_string());
        }
    };

    if let Some(user_id) = cached_user_id(&db) {
        for c in db.get_cached_connectors("account", &user_id) {
            push(&c.service);
        }
    }
    if let Some(project_id) = db.get_workspace_project_id(workspace_id) {
        for c in db.get_cached_connectors("project", &project_id) {
            push(&c.service);
        }
        if let Some(org_id) = db.get_project_org(&project_id) {
            for c in db.get_cached_connectors("org", &org_id) {
                push(&c.service);
            }
        }
    }
    services.iter().map(|s| label_for(s)).collect()
}

/// Raw service ids connected for the given scopes (project ∪ org ∪ account),
/// de-duplicated. Cache-only. Used by the MCP tool layer to build the catalog.
pub fn connected_service_ids(
    db: &Db,
    user_id: Option<&str>,
    org_id: Option<&str>,
    project_id: Option<&str>,
) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    let mut push = |service: &str| {
        if connector_def(service).is_some() && !ids.iter().any(|s| s == service) {
            ids.push(service.to_string());
        }
    };
    if let Some(uid) = user_id {
        for c in db.get_cached_connectors("account", uid) {
            push(&c.service);
        }
    }
    if let Some(oid) = org_id {
        for c in db.get_cached_connectors("org", oid) {
            push(&c.service);
        }
    }
    if let Some(pid) = project_id {
        for c in db.get_cached_connectors("project", pid) {
            push(&c.service);
        }
    }
    ids
}

/// Decrypted field map for a single service, applying project → org → account
/// precedence (project overrides). Cache-only; never touches Turso. Returns
/// None if the service is not connected for any of the given scopes.
pub fn resolve_connector_fields(
    db: &Db,
    service: &str,
    user_id: Option<&str>,
    org_id: Option<&str>,
    project_id: Option<&str>,
) -> Option<HashMap<String, String>> {
    let def = connector_def(service)?;
    let mut found = false;
    let mut out: HashMap<String, String> = HashMap::new();
    let merge = |scope: &str, scope_id: &str, out: &mut HashMap<String, String>, found: &mut bool| {
        for c in db.get_cached_connectors(scope, scope_id) {
            if c.service != service {
                continue;
            }
            *found = true;
            let blob = parse_blob(c.credentials_encrypted.as_deref());
            for f in def.fields {
                if let Some(v) = field_string(&blob, f.key) {
                    out.insert(f.key.to_string(), v);
                }
            }
        }
    };
    if let Some(uid) = user_id {
        merge("account", uid, &mut out, &mut found);
    }
    if let Some(oid) = org_id {
        merge("org", oid, &mut out, &mut found);
    }
    if let Some(pid) = project_id {
        merge("project", pid, &mut out, &mut found);
    }
    if found {
        Some(out)
    } else {
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceConnector {
    pub service: String,
    pub label: String,
    pub scope: String,
}

/// Connected connectors for a workspace, grouped by scope, for the jobs
/// "restrict connectors" panel. Cache-only.
pub fn workspace_connectors(app: &AppHandle, workspace_id: i64) -> Vec<WorkspaceConnector> {
    let db = app.state::<Db>();
    let mut out: Vec<WorkspaceConnector> = Vec::new();
    let push = |service: &str, scope: &str, out: &mut Vec<WorkspaceConnector>| {
        if connector_def(service).is_some()
            && !out.iter().any(|c| c.service == service && c.scope == scope)
        {
            out.push(WorkspaceConnector {
                service: service.to_string(),
                label: label_for(service),
                scope: scope.to_string(),
            });
        }
    };
    if let Some(user_id) = cached_user_id(&db) {
        for c in db.get_cached_connectors("account", &user_id) {
            push(&c.service, "account", &mut out);
        }
    }
    if let Some(project_id) = db.get_workspace_project_id(workspace_id) {
        if let Some(org_id) = db.get_project_org(&project_id) {
            for c in db.get_cached_connectors("org", &org_id) {
                push(&c.service, "org", &mut out);
            }
        }
        for c in db.get_cached_connectors("project", &project_id) {
            push(&c.service, "project", &mut out);
        }
    }
    out
}

fn label_for(service: &str) -> String {
    let mut out = String::new();
    for (i, part) in service.split('_').enumerate() {
        if i > 0 {
            out.push(' ');
        }
        let mut chars = part.chars();
        if let Some(first) = chars.next() {
            out.extend(first.to_uppercase());
            out.push_str(chars.as_str());
        }
    }
    out
}
