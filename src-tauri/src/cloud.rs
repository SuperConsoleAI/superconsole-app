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
