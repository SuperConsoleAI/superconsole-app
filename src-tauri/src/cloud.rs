// Shared cloud helpers: env loading + Turso HTTP (/v2/pipeline) access.
//
// SECURITY / PRODUCTION TODO (same as auth.rs): TURSO_AUTH_TOKEN and
// WORKOS_COOKIE_PASSWORD are read from the repo-root .env at runtime. These are
// server-side secrets and must not ship in a distributed binary. Move Turso
// writes + key derivation behind the Cloudflare Worker before distribution.

use serde_json::{json, Value};
use std::sync::Once;

static ENV_INIT: Once = Once::new();

pub fn ensure_env() {
    ENV_INIT.call_once(|| {
        for path in [".env", "../.env", "../../.env"] {
            if dotenvy::from_path(path).is_ok() {
                break;
            }
        }
    });
}

pub fn cookie_password() -> Result<String, String> {
    ensure_env();
    std::env::var("WORKOS_COOKIE_PASSWORD")
        .map_err(|_| "WORKOS_COOKIE_PASSWORD is not set".to_string())
}

#[derive(Clone)]
pub struct TursoConfig {
    pub url: String,
    pub token: String,
}

pub fn turso_config() -> Result<TursoConfig, String> {
    ensure_env();
    let raw = std::env::var("TURSO_DATABASE_URL")
        .map_err(|_| "TURSO_DATABASE_URL is not set".to_string())?;
    let token =
        std::env::var("TURSO_AUTH_TOKEN").map_err(|_| "TURSO_AUTH_TOKEN is not set".to_string())?;
    let url = raw
        .replacen("libsql://", "https://", 1)
        .replacen("wss://", "https://", 1);
    Ok(TursoConfig { url, token })
}

pub async fn turso_execute(
    client: &reqwest::Client,
    cfg: &TursoConfig,
    sql: &str,
    args: Vec<Option<String>>,
) -> Result<Value, String> {
    let stmt_args: Vec<Value> = args
        .into_iter()
        .map(|a| match a {
            Some(v) => json!({ "type": "text", "value": v }),
            None => json!({ "type": "null" }),
        })
        .collect();

    let resp = client
        .post(format!("{}/v2/pipeline", cfg.url))
        .bearer_auth(&cfg.token)
        .json(&json!({
            "requests": [
                { "type": "execute", "stmt": { "sql": sql, "args": stmt_args } },
                { "type": "close" }
            ]
        }))
        .send()
        .await
        .map_err(|e| format!("Turso request failed: {}", e))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Turso response parse failed: {}", e))?;

    if let Some(err) = body["results"][0]["error"].as_object() {
        let msg = err
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("unknown Turso error");
        return Err(format!("Turso error: {}", msg));
    }
    Ok(body["results"][0]["response"]["result"].clone())
}

pub fn rows(result: &Value) -> Vec<Value> {
    result["rows"].as_array().cloned().unwrap_or_default()
}

pub fn cell_text(row: &Value, idx: usize) -> String {
    row.get(idx)
        .and_then(|c| c["value"].as_str())
        .unwrap_or("")
        .to_string()
}

pub fn cell_opt(row: &Value, idx: usize) -> Option<String> {
    let cell = row.get(idx)?;
    if cell["type"].as_str() == Some("null") {
        return None;
    }
    cell["value"].as_str().map(|s| s.to_string())
}

/// Idempotently add the desktop-managed project settings columns to the cloud
/// `projects` table. The web migration also adds them; this is a fallback so
/// the desktop never fails against an un-migrated DB. Duplicate-column errors
/// are expected and ignored.
pub async fn ensure_project_settings_columns(
    client: &reqwest::Client,
    cfg: &TursoConfig,
) -> Result<(), String> {
    for stmt in [
        "ALTER TABLE projects ADD COLUMN default_run_mode TEXT NOT NULL DEFAULT 'cli'",
        "ALTER TABLE projects ADD COLUMN default_cli TEXT NOT NULL DEFAULT 'claude'",
        "ALTER TABLE projects ADD COLUMN default_provider TEXT NOT NULL DEFAULT 'anthropic'",
        "ALTER TABLE projects ADD COLUMN default_model TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE projects ADD COLUMN script_setup TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE projects ADD COLUMN script_run TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE projects ADD COLUMN script_teardown TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE projects ADD COLUMN script_auto_run INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE projects ADD COLUMN repo_url TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT ''",
    ] {
        let _ = turso_execute(client, cfg, stmt, vec![]).await;
    }
    Ok(())
}
