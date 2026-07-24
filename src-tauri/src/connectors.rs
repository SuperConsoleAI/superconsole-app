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
        // bot_token: required at org level, optional at project level (Option B own bot)
        // chat_id + thread_id: project routing target
        // allowed_user_ids: comma-separated Telegram user IDs; empty = anyone
        fields: &[
            Field { key: "bot_token", env: "TELEGRAM_BOT_TOKEN", secret: true },
            Field { key: "chat_id", env: "TELEGRAM_CHAT_ID", secret: false },
            Field { key: "thread_id", env: "TELEGRAM_THREAD_ID", secret: false },
            Field { key: "allowed_user_ids", env: "TELEGRAM_ALLOWED_USER_IDS", secret: false },
        ],
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
    Def {
        service: "web_search",
        fields: &[Field { key: "api_key", env: "TAVILY_API_KEY", secret: true }],
    },
    // Composio — 1000+ tools via a single API key + MCP server.
    // Injected as COMPOSIO_API_KEY into every PTY session where connected.
    // Same scope-based HKDF encryption as all other connectors.
    Def {
        service: "composio",
        fields: &[Field { key: "api_key", env: "COMPOSIO_API_KEY", secret: true }],
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

/// Decrypt and parse a connector credentials blob.
/// `scope_id` is the project_id / org_id / user_id that was used when encrypting.
fn parse_blob(encrypted: Option<&str>, scope_id: &str) -> Map<String, Value> {
    let Some(enc) = encrypted.filter(|s| !s.is_empty()) else {
        return Map::new();
    };
    // Try scope-bound key first (new standard); fall back to global for blobs
    // that were written before the scope migration.
    let plain = crypto::decrypt_scoped(enc, scope_id)
        .or_else(|_| crypto::decrypt(enc))
        .unwrap_or_default();
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
        vec![Some(scope_id.clone())],
    )
    .await?;

    Ok(rows(&result)
        .iter()
        .filter_map(|row| {
            let service = cell_text(row, 0);
            let def = connector_def(&service)?;
            let blob = parse_blob(cell_opt(row, 2).as_deref(), &scope_id);
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
) -> Result<String, String> {
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
        &scope_id,
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

    // Service-specific required-field checks (surface friendly errors before hitting the DB).
    if service == "telegram" {
        let has_chat = blob.get("chat_id").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false);
        let has_bot = blob.get("bot_token").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false);
        // At org scope, bot_token is required. At project scope, chat_id is required.
        if scope == "org" && !has_bot {
            return Err("Telegram: Bot Token is required at org level.".to_string());
        }
        if scope == "project" && !has_chat {
            return Err("Telegram: Chat ID is required. Use the Detect → button to auto-fill it.".to_string());
        }
        let _ = has_bot; // may be absent at project scope (Option A)
    }

    let plaintext = serde_json::to_string(&Value::Object(blob)).map_err(|e| e.to_string())?;
    // Scope-bound encryption: key = HKDF(WORKOS_COOKIE_PASSWORD:scope_id)
    let encrypted = crypto::encrypt_scoped(&plaintext, &scope_id)?;
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
    // Helper closure: execute the connector INSERT and write local cache.
    let do_save = |id: String, ts: String, uid: Option<String>| {
        let sql = sql.clone();
        let client = client.clone();
        let cfg = cfg.clone();
        let scope_id = scope_id.clone();
        let service = service.clone();
        let encrypted = encrypted.clone();
        async move {
            cloud::turso_execute(
                &client,
                &cfg,
                &sql,
                vec![
                    Some(id),
                    Some(scope_id.clone()),
                    Some(service.clone()),
                    Some(encrypted.clone()),
                    uid,
                    Some(ts),
                ],
            )
            .await
        }
    };

    let result = do_save(id.clone(), ts.clone(), user_id.clone()).await;

    match result {
        Ok(_) => {}
        Err(ref e) if e.contains("FOREIGN KEY") && scope == "project" => {
            // The project row doesn't exist in Turso yet (or the local
            // project_org_cache is stale). Resolve org_id: first try the
            // local cache, then fall back to querying Turso directly.
            let db = app.state::<Db>();

            let org_id = if let Some(cached) = db.get_project_org(&scope_id) {
                cached
            } else {
                // Query Turso — project may already exist there (e.g. created
                // from another machine or before the Settings→Project tab was opened).
                let found = cloud::turso_execute(
                    &client,
                    &cfg,
                    "SELECT org_id FROM projects WHERE id = ?",
                    vec![Some(scope_id.clone())],
                )
                .await
                .unwrap_or_default();

                let org_id_from_turso = cloud::rows(&found)
                    .first()
                    .and_then(|r| cloud::cell_opt(r, 0));

                match org_id_from_turso {
                    Some(oid) => {
                        // Cache it locally so future saves don't need to re-query.
                        let _ = db.set_project_org(&scope_id, &oid, &ts);
                        oid
                    }
                    None => {
                        return Err(
                            "Connector save failed: project not found in cloud. \
                             Open Settings → Project, select this workspace to sync it, \
                             then try again."
                                .to_string(),
                        );
                    }
                }
            };

            // Find the workspace_id for this project_id.
            let workspace_id: i64 = {
                let conn_guard = db.0.lock().unwrap();
                conn_guard
                    .query_row(
                        "SELECT id FROM workspaces WHERE project_id = ?1",
                        [&scope_id],
                        |r| r.get(0),
                    )
                    .map_err(|_| {
                        "Connector save failed: workspace not found for this project.".to_string()
                    })?
            };

            // Ensure project row exists in Turso (idempotent if it already does).
            crate::llm::ensure_workspace_project(app.clone(), workspace_id, org_id)
                .await
                .map_err(|e| format!("Auto-provision project failed: {}", e))?;

            // Retry the INSERT now that the project row is confirmed in Turso.
            let new_id = Ulid::new().to_string();
            do_save(new_id, ts.clone(), user_id.clone())
                .await
                .map_err(|e| format!("Retry after auto-provision failed: {}", e))?;
        }
        Err(e) => return Err(e),
    }

    // Always write to local cache too (local + cloud by default).
    let _ = app
        .state::<Db>()
        .upsert_connector_cache(&scope, &scope_id, &service, &encrypted);

    crate::sync_manager::sync_on_update(&app, &scope, &scope_id).await;

    // Start a new long-poll loop immediately when a Telegram connector is
    // added or updated — no need to wait for the 30s manager tick.
    if service == "telegram" {
        crate::remote::refresh_telegram_bots(&app);
    }
    Ok("ok".to_string())
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
        vec![Some(scope_id.clone()), Some(service.clone())],
    )
    .await?;
    crate::sync_manager::sync_on_update(&app, &scope, &scope_id).await;

    // Refresh bot list so deleted project bots self-exit on their next
    // registration check (the loop detects it's no longer registered).
    if service == "telegram" {
        crate::remote::refresh_telegram_bots(&app);
    }
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
        let blob = parse_blob(c.credentials_encrypted.as_deref(), scope_id);
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

/// Per-project Telegram bots.
/// Returns (bot_token, workspace_id, chat_id, thread_id, allowed_user_ids).
///
/// allowed_user_ids is a Vec of Telegram user ID strings (may be empty = allow all).
/// bot_token resolution: project own → org → global setting.
/// Cache-only; never hits Turso.
pub fn project_telegram_bots(db: &Db) -> Vec<(String, i64, String, String, Vec<String>)> {
    let mut out: Vec<(String, i64, String, String, Vec<String>)> = Vec::new();
    for ws in db.list_workspaces().unwrap_or_default() {
        let Some(project_id) = ws.project_id.clone() else {
            continue;
        };
        let org_id = db.get_workspace_project_id(ws.id)
            .and_then(|pid| db.get_project_org(&pid));

        let mut proj_bot_token = String::new();
        let mut chat_id = String::new();
        let mut thread_id = String::new();
        let mut allowed_ids_raw = String::new();

        for c in db.get_cached_connectors("project", &project_id) {
            if c.service != "telegram" { continue; }
            let blob = parse_blob(c.credentials_encrypted.as_deref(), &project_id);
            proj_bot_token = field_string(&blob, "bot_token").unwrap_or_default();
            chat_id = field_string(&blob, "chat_id").unwrap_or_default();
            thread_id = field_string(&blob, "thread_id").unwrap_or_default();
            allowed_ids_raw = field_string(&blob, "allowed_user_ids").unwrap_or_default();
        }

        if chat_id.is_empty() { continue; }

        let token = if !proj_bot_token.is_empty() {
            proj_bot_token
        } else {
            match get_telegram_bot_token(db, org_id.as_deref()) {
                Some(t) => t,
                None => continue,
            }
        };

        let allowed_ids: Vec<String> = allowed_ids_raw
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        if !out.iter().any(|(t, _, c, th, _)| t == &token && c == &chat_id && th == &thread_id) {
            out.push((token, ws.id, chat_id, thread_id, allowed_ids));
        }
    }
    out
}

/// Returns the bot token for a given org: org-level Telegram connector first,
/// then falls back to the global `telegram_token` setting.
/// Pass `org_id = None` to skip the org lookup (returns global setting only).
pub fn get_telegram_bot_token(db: &Db, org_id: Option<&str>) -> Option<String> {
    if let Some(oid) = org_id {
        for c in db.get_cached_connectors("org", oid) {
            if c.service != "telegram" {
                continue;
            }
            let blob = parse_blob(c.credentials_encrypted.as_deref(), oid);
            if let Some(tok) = field_string(&blob, "bot_token") {
                if !tok.is_empty() {
                    return Some(tok);
                }
            }
        }
    }
    db.get_setting("telegram_token").filter(|t| !t.is_empty())
}

// --- Connector-bundled MCP servers (auto-wired into .mcp.json) ---

#[derive(Debug, Clone)]
pub struct ConnectorMcp {
    pub key: String,
    pub command: String,
    pub args: Vec<String>,
    /// (env var the server expects, ${SOURCE} referencing the connector's env).
    pub env: Vec<(String, String)>,
}

/// All MCP server keys we manage, so stale entries can be reconciled away when
/// a connector is disconnected.
pub const CONNECTOR_MCP_KEYS: &[&str] = &["github", "slack", "notion", "supabase", "stripe"];

/// The MCP server a connector ships, if any. Tokens come from the connector's
/// injected env vars, referenced via ${VAR} so no secret sits in the JSON.
fn connector_mcp_def(service: &str) -> Option<ConnectorMcp> {
    let m = |k: &str, c: &str, a: &[&str], e: &[(&str, &str)]| ConnectorMcp {
        key: k.into(),
        command: c.into(),
        args: a.iter().map(|s| s.to_string()).collect(),
        env: e.iter().map(|(x, y)| (x.to_string(), y.to_string())).collect(),
    };
    match service {
        "github" => Some(m(
            "github",
            "npx",
            &["-y", "@modelcontextprotocol/server-github"],
            &[("GITHUB_PERSONAL_ACCESS_TOKEN", "${GITHUB_TOKEN}")],
        )),
        "slack" => Some(m(
            "slack",
            "npx",
            &["-y", "@modelcontextprotocol/server-slack"],
            &[("SLACK_BOT_TOKEN", "${SLACK_BOT_TOKEN}")],
        )),
        "notion" => Some(m(
            "notion",
            "npx",
            &["-y", "@notionhq/notion-mcp-server"],
            &[("NOTION_API_KEY", "${NOTION_API_KEY}")],
        )),
        "supabase" => Some(m(
            "supabase",
            "npx",
            &["-y", "@supabase/mcp-server-supabase@latest"],
            &[("SUPABASE_ACCESS_TOKEN", "${SUPABASE_SERVICE_ROLE_KEY}")],
        )),
        "stripe" => Some(m(
            "stripe",
            "npx",
            &["-y", "@stripe/mcp", "--tools=all"],
            &[("STRIPE_API_KEY", "${STRIPE_API_KEY}")],
        )),
        _ => None,
    }
}

/// Active connector MCP servers for a workspace (project ∪ org ∪ account).
/// Cache-only.
pub fn workspace_connector_mcps(app: &AppHandle, workspace_id: i64) -> Vec<ConnectorMcp> {
    let db = app.state::<Db>();
    let user = cached_user_id(&db);
    let project = db.get_workspace_project_id(workspace_id);
    let org = project.as_deref().and_then(|p| db.get_project_org(p));
    connected_service_ids(&db, user.as_deref(), org.as_deref(), project.as_deref())
        .into_iter()
        .filter_map(|s| connector_mcp_def(&s))
        .collect()
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
            let blob = parse_blob(c.credentials_encrypted.as_deref(), scope_id);
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

// ─── Connector test-before-save ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorTestResult {
    pub success: bool,
    pub message: String,
    pub details: Option<String>,
}

fn ok_result(message: &str) -> ConnectorTestResult {
    ConnectorTestResult { success: true, message: message.to_string(), details: None }
}

fn ok_result_with(message: &str, details: &str) -> ConnectorTestResult {
    ConnectorTestResult {
        success: true,
        message: message.to_string(),
        details: Some(details.to_string()),
    }
}

fn err_result(message: &str) -> ConnectorTestResult {
    ConnectorTestResult { success: false, message: message.to_string(), details: None }
}

async fn test_supabase(url: &str, key: &str) -> ConnectorTestResult {
    if url.is_empty() || key.is_empty() {
        return err_result("URL and service role key are required");
    }
    let resp = reqwest::Client::new()
        .get(format!("{}/rest/v1/", url.trim_end_matches('/')))
        .header("apikey", key)
        .header("Authorization", format!("Bearer {}", key))
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() || r.status().as_u16() == 404 => {
            ok_result("Connected to Supabase")
        }
        Ok(r) if r.status().as_u16() == 401 => err_result("Invalid API key"),
        Ok(r) => err_result(&format!("Unexpected status: {}", r.status())),
        Err(e) => err_result(&format!("Connection failed: {}", e)),
    }
}

async fn test_github(token: &str) -> ConnectorTestResult {
    if token.is_empty() {
        return err_result("Token is required");
    }
    let resp = reqwest::Client::new()
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "SuperConsole")
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => {
            let body: serde_json::Value = r.json().await.unwrap_or_default();
            let login = body["login"].as_str().unwrap_or("unknown");
            ok_result_with(
                &format!("Connected as @{}", login),
                &format!("GitHub user: {}", login),
            )
        }
        Ok(r) if r.status().as_u16() == 401 => err_result("Invalid token"),
        Ok(r) => err_result(&format!("GitHub error: {}", r.status())),
        Err(e) => err_result(&format!("Connection failed: {}", e)),
    }
}

async fn test_shopify(shop_domain: &str, api_key: &str) -> ConnectorTestResult {
    if shop_domain.is_empty() || api_key.is_empty() {
        return err_result("Shop domain and API key are required");
    }
    let domain = shop_domain.trim_end_matches('/');
    let domain = if domain.contains('.') {
        domain.to_string()
    } else {
        format!("{}.myshopify.com", domain)
    };
    let resp = reqwest::Client::new()
        .get(format!("https://{}/admin/api/2024-01/shop.json", domain))
        .header("X-Shopify-Access-Token", api_key)
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => {
            let body: serde_json::Value = r.json().await.unwrap_or_default();
            let name = body["shop"]["name"].as_str().unwrap_or("Unknown store");
            ok_result_with("Connected to Shopify", &format!("Store: {}", name))
        }
        Ok(r) if r.status().as_u16() == 401 => err_result("Invalid API key"),
        Ok(r) if r.status().as_u16() == 404 => err_result("Shop domain not found"),
        Ok(r) => err_result(&format!("Shopify error: {}", r.status())),
        Err(e) => err_result(&format!("Connection failed: {}", e)),
    }
}

async fn test_slack(token: &str) -> ConnectorTestResult {
    if token.is_empty() {
        return err_result("Bot token is required");
    }
    let resp = reqwest::Client::new()
        .post("https://slack.com/api/auth.test")
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => {
            let body: serde_json::Value = r.json().await.unwrap_or_default();
            if body["ok"].as_bool().unwrap_or(false) {
                let user = body["user"].as_str().unwrap_or("bot");
                let team = body["team"].as_str().unwrap_or("workspace");
                ok_result_with("Connected to Slack", &format!("{} in {}", user, team))
            } else {
                let error = body["error"].as_str().unwrap_or("unknown error");
                err_result(&format!("Slack error: {}", error))
            }
        }
        Err(e) => err_result(&format!("Connection failed: {}", e)),
        _ => err_result("Unexpected response"),
    }
}

async fn test_notion(api_key: &str) -> ConnectorTestResult {
    if api_key.is_empty() {
        return err_result("API key is required");
    }
    let resp = reqwest::Client::new()
        .get("https://api.notion.com/v1/users/me")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Notion-Version", "2022-06-28")
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => {
            let body: serde_json::Value = r.json().await.unwrap_or_default();
            let name = body["name"].as_str().unwrap_or("Unknown");
            ok_result_with("Connected to Notion", &format!("User: {}", name))
        }
        Ok(r) if r.status().as_u16() == 401 => err_result("Invalid API key"),
        Ok(r) => err_result(&format!("Notion error: {}", r.status())),
        Err(e) => err_result(&format!("Connection failed: {}", e)),
    }
}

async fn test_linear(api_key: &str) -> ConnectorTestResult {
    if api_key.is_empty() {
        return err_result("API key is required");
    }
    let query = r#"{"query": "{ viewer { id name email } }"}"#;
    let resp = reqwest::Client::new()
        .post("https://api.linear.app/graphql")
        .header("Authorization", api_key)
        .header("Content-Type", "application/json")
        .body(query)
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => {
            let body: serde_json::Value = r.json().await.unwrap_or_default();
            let name = body["data"]["viewer"]["name"].as_str().unwrap_or("Unknown");
            ok_result_with("Connected to Linear", &format!("User: {}", name))
        }
        Ok(r) if r.status().as_u16() == 401 => err_result("Invalid API key"),
        Ok(r) => err_result(&format!("Linear error: {}", r.status())),
        Err(e) => err_result(&format!("Connection failed: {}", e)),
    }
}

async fn test_stripe(api_key: &str) -> ConnectorTestResult {
    if api_key.is_empty() {
        return err_result("API key is required");
    }
    let resp = reqwest::Client::new()
        .get("https://api.stripe.com/v1/balance")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => {
            let mode = if api_key.starts_with("sk_live_") { "live" } else { "test" };
            ok_result_with("Connected to Stripe", &format!("Mode: {}", mode))
        }
        Ok(r) if r.status().as_u16() == 401 => err_result("Invalid API key"),
        Ok(r) => err_result(&format!("Stripe error: {}", r.status())),
        Err(e) => err_result(&format!("Connection failed: {}", e)),
    }
}

async fn test_beehiiv(api_key: &str) -> ConnectorTestResult {
    if api_key.is_empty() {
        return err_result("API key is required");
    }
    let resp = reqwest::Client::new()
        .get("https://api.beehiiv.com/v2/publications")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => ok_result("Connected to Beehiiv"),
        Ok(r) if r.status().as_u16() == 401 => err_result("Invalid API key"),
        Ok(r) => err_result(&format!("Beehiiv error: {}", r.status())),
        Err(e) => err_result(&format!("Connection failed: {}", e)),
    }
}

async fn test_telegram(bot_token: &str) -> ConnectorTestResult {
    if bot_token.is_empty() {
        return err_result("Bot token is required");
    }
    let url = format!("https://api.telegram.org/bot{}/getMe", bot_token);
    let resp = reqwest::Client::new().get(&url).send().await;
    match resp {
        Ok(r) if r.status().is_success() => {
            let body: serde_json::Value = r.json().await.unwrap_or_default();
            if body["ok"].as_bool().unwrap_or(false) {
                let username = body["result"]["username"].as_str().unwrap_or("bot");
                ok_result_with("Connected to Telegram", &format!("Bot: @{}", username))
            } else {
                err_result("Invalid bot token")
            }
        }
        Err(e) => err_result(&format!("Connection failed: {}", e)),
        _ => err_result("Invalid bot token"),
    }
}

async fn test_tavily(api_key: &str) -> ConnectorTestResult {
    if api_key.is_empty() {
        return err_result("API key is required");
    }
    let resp = reqwest::Client::new()
        .post("https://api.tavily.com/search")
        .json(&serde_json::json!({
            "api_key": api_key,
            "query": "test",
            "max_results": 1
        }))
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => ok_result("Connected to Tavily"),
        Ok(r) if r.status().as_u16() == 401 => err_result("Invalid API key"),
        Ok(r) => err_result(&format!("Tavily error: {}", r.status())),
        Err(e) => err_result(&format!("Connection failed: {}", e)),
    }
}

async fn test_turso(database_url: &str, auth_token: &str) -> ConnectorTestResult {
    if database_url.is_empty() || auth_token.is_empty() {
        return err_result("Database URL and auth token are required");
    }
    // Turso URLs are stored as libsql:// (native protocol) but the HTTP
    // pipeline endpoint requires https://. Normalise before building the URL.
    let http_url = database_url
        .trim_end_matches('/')
        .replacen("libsql://", "https://", 1);
    let resp = reqwest::Client::new()
        .post(format!("{}/v2/pipeline", http_url))
        .header("Authorization", format!("Bearer {}", auth_token))
        .json(&serde_json::json!({
            "requests": [{"type": "execute", "stmt": {"sql": "SELECT 1"}}]
        }))
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => ok_result("Connected to Turso"),
        Ok(r) if r.status().as_u16() == 401 => err_result("Invalid auth token"),
        Ok(r) => err_result(&format!("Turso error: {}", r.status())),
        Err(e) => err_result(&format!("Connection failed: {}", e)),
    }
}

async fn test_airtable(api_key: &str) -> ConnectorTestResult {
    if api_key.is_empty() {
        return err_result("API key is required");
    }
    let resp = reqwest::Client::new()
        .get("https://api.airtable.com/v0/meta/whoami")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => ok_result("Connected to Airtable"),
        Ok(r) if r.status().as_u16() == 401 => err_result("Invalid API key"),
        Ok(r) => err_result(&format!("Airtable error: {}", r.status())),
        Err(e) => err_result(&format!("Connection failed: {}", e)),
    }
}

async fn test_convertkit(api_key: &str) -> ConnectorTestResult {
    if api_key.is_empty() {
        return err_result("API key is required");
    }
    let resp = reqwest::Client::new()
        .get(format!("https://api.convertkit.com/v3/account?api_key={}", api_key))
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => ok_result("Connected to ConvertKit"),
        Ok(r) if r.status().as_u16() == 401 => err_result("Invalid API key"),
        Ok(r) => err_result(&format!("ConvertKit error: {}", r.status())),
        Err(e) => err_result(&format!("Connection failed: {}", e)),
    }
}

async fn test_composio(api_key: &str) -> ConnectorTestResult {
    if api_key.is_empty() {
        return err_result("API key is required");
    }
    let resp = reqwest::Client::new()
        .get("https://backend.composio.dev/api/v1/client/auth/client_info")
        .header("x-api-key", api_key)
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => {
            let body: serde_json::Value = r.json().await.unwrap_or_default();
            let email = body["client"]["userEmail"].as_str().unwrap_or("unknown");
            ok_result_with("Connected to Composio", &format!("Account: {}", email))
        }
        Ok(r) if r.status().as_u16() == 401 => err_result("Invalid API key"),
        Ok(r) => err_result(&format!("Composio error: {}", r.status())),
        Err(e) => err_result(&format!("Connection failed: {}", e)),
    }
}

async fn test_gmail(api_key: &str) -> ConnectorTestResult {
    if api_key.is_empty() {
        return err_result("API key is required");
    }
    let resp = reqwest::Client::new()
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => {
            let body: serde_json::Value = r.json().await.unwrap_or_default();
            let email = body["email"].as_str().unwrap_or("unknown");
            ok_result_with("Connected to Gmail", &format!("Account: {}", email))
        }
        Ok(r) if r.status().as_u16() == 401 => err_result("Invalid or expired token"),
        Ok(r) => err_result(&format!("Gmail error: {}", r.status())),
        Err(e) => err_result(&format!("Connection failed: {}", e)),
    }
}

pub async fn test_connector(service: &str, credentials_json: &str) -> ConnectorTestResult {
    let creds: serde_json::Value = match serde_json::from_str(credentials_json) {
        Ok(v) => v,
        Err(e) => {
            return err_result(&format!("Invalid credentials format: {}", e));
        }
    };
    let field = |key: &str| creds[key].as_str().unwrap_or("").to_string();

    let inner = async {
        match service {
            "supabase" => test_supabase(&field("url"), &field("service_role_key")).await,
            "github" => test_github(&field("token")).await,
            "shopify" => test_shopify(&field("shop_domain"), &field("api_key")).await,
            "slack" => test_slack(&field("bot_token")).await,
            "notion" => test_notion(&field("api_key")).await,
            "linear" => test_linear(&field("api_key")).await,
            "stripe" => test_stripe(&field("api_key")).await,
            "beehiiv" => test_beehiiv(&field("api_key")).await,
            "gmail" => test_gmail(&field("api_key")).await,
            "telegram" => test_telegram(&field("bot_token")).await,
            "tavily" | "web_search" => test_tavily(&field("api_key")).await,
            "turso" => test_turso(&field("url"), &field("auth_token")).await,
            "airtable" => test_airtable(&field("api_key")).await,
            "convertkit" => test_convertkit(&field("api_key")).await,
            "composio" => test_composio(&field("api_key")).await,
            _ => ConnectorTestResult {
                success: true,
                message: "No test available for this connector — credentials saved as-is"
                    .to_string(),
                details: None,
            },
        }
    };

    match tokio::time::timeout(std::time::Duration::from_secs(10), inner).await {
        Ok(result) => result,
        Err(_) => err_result("Connection timed out"),
    }
}

#[tauri::command]
pub async fn test_connector_cmd(
    service: String,
    credentials_json: String,
) -> Result<ConnectorTestResult, String> {
    Ok(test_connector(&service, &credentials_json).await)
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
