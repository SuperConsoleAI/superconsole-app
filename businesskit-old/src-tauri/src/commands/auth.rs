// src-tauri/src/commands/auth.rs
//
// WorkOS AuthKit desktop authentication — loopback HTTP server (RFC 8252).
// Session is now stored in an encrypted file to prevent OS Keychain freezes.

use crate::AppState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

// ── Constants ─────────────────────────────────────────────────────────────────

const CALLBACK_PORT: u16 = 4666;
const REDIRECT_URI: &str = "http://localhost:4666/callback";

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthUser {
    pub id: String,
    pub workos_id: String,
    pub email: String,
    pub name: Option<String>,
    #[serde(default)]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthInfo {
    pub user: AuthUser,
    pub has_org: bool,
    pub org_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct StoredSession {
    user: AuthUser,
    access_token: String,
    refresh_token: Option<String>,
    has_org: bool,
    org_id: Option<String>,
}

// ── Internal helpers ──────────────────────────────────────────────────────────

fn session_file_paths() -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        paths.push(std::path::PathBuf::from(&home).join("files").join("workos_session.dat"));
        paths.push(std::path::PathBuf::from(&home).join("workos_session.dat"));
    }
    paths.push(std::path::PathBuf::from("/data/data/io.businesskit.desktop/files/workos_session.dat"));
    paths.push(std::path::PathBuf::from("/data/data/io.businesskit.desktop.debug/files/workos_session.dat"));
    if let Some(d) = dirs::data_dir() {
        paths.push(d.join("businesskit").join("workos_session.dat"));
    }
    paths
}

fn write_session_fallback(json: &str) {
    let secret = crate::commands::settings::get_secret();
    if secret.trim().is_empty() {
        log::error!("Cannot write session fallback: ENCRYPTION_SECRET not set at build time");
        return;
    }
    let encrypted = match crate::vault::encrypt(json, &secret, "session") {
        Ok(e) => e,
        Err(e) => {
            log::error!("Failed to encrypt session: {}", e);
            return;
        }
    };
    
    for path in session_file_paths() {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(_) = std::fs::write(&path, &encrypted) {
            log::info!("Saved encrypted session to fallback file: {:?}", path);
        }
    }
}

fn read_session_fallback() -> Option<String> {
    let secret = crate::commands::settings::get_secret();
    if secret.trim().is_empty() {
        log::error!("Cannot read session fallback: ENCRYPTION_SECRET not set at build time");
        return None;
    }
    for path in session_file_paths() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if !content.trim().is_empty() {
                if let Ok(decrypted) = crate::vault::decrypt(content.trim(), &secret, "session") {
                    log::info!("Read and decrypted session from fallback file: {:?}", path);
                    return Some(decrypted);
                }
            }
        }
    }
    None
}

fn clear_session_fallback() {
    for path in session_file_paths() {
        let _ = std::fs::remove_file(path);
    }
}

fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn parse_query(url: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    if let Some(q) = url.split_once('?').map(|(_, q)| q) {
        for pair in q.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                map.insert(k.to_string(), v.replace('+', " "));
            }
        }
    }
    map
}

fn authorize_url(client_id: &str, state_param: &str, screen_hint: Option<&str>) -> String {
    let mut url = format!(
        "https://api.workos.com/user_management/authorize\
         ?response_type=code\
         &provider=authkit\
         &client_id={}\
         &redirect_uri={}\
         &state={}",
        urlencode(client_id),
        urlencode(REDIRECT_URI),
        urlencode(state_param),
    );
    if let Some(hint) = screen_hint {
        if !hint.is_empty() {
            url.push_str("&screen_hint=");
            url.push_str(&urlencode(hint));
        }
    }
    url
}

fn callback_html(message: &str) -> String {
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><title>BusinessKit</title>
<style>body{{font-family:-apple-system,system-ui,sans-serif;background:#0f0f0f;color:#fff;
display:flex;height:100vh;margin:0;align-items:center;justify-content:center}}
.c{{text-align:center}}.icon{{font-size:48px;margin:0 0 16px}}
h2{{margin:0 0 8px;font-size:22px}}p{{color:#888;margin:0;font-size:14px}}</style>
</head><body><div class="c">
<div class="icon">✓</div>
<h2>{}</h2>
<p>You can close this tab and return to BusinessKit.</p>
</div><script>setTimeout(()=>window.close(),1500)</script></body></html>"#,
        message
    )
}

// ── Token exchange + DB upsert ────────────────────────────────────────────────

async fn complete_login(
    app: &AppHandle,
    state: &Arc<AppState>,
    client_id: &str,
    api_key: &str,
    code: &str,
) -> Result<AuthInfo, String> {
    let client = crate::db::turso::create_shared_http_client();

    let resp = client
        .post("https://api.workos.com/user_management/authenticate")
        .json(&json!({
            "client_id": client_id,
            "client_secret": api_key,
            "grant_type": "authorization_code",
            "code": code,
        }))
        .send()
        .await
        .map_err(|e| format!("WorkOS request failed: {} (details: {:?})", e, e))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;
    let body: Value = serde_json::from_str(&text)
        .map_err(|e| format!("WorkOS response parse failed: {}. Raw body: {}", e, text))?;

    if !status.is_success() {
        let msg = body["message"]
            .as_str()
            .or_else(|| body["error_description"].as_str())
            .unwrap_or("authentication failed");
        return Err(format!("WorkOS: {}", msg));
    }

    let wu = &body["user"];
    let workos_id = wu["id"].as_str().unwrap_or_default().to_string();
    let email = wu["email"].as_str().unwrap_or_default().to_string();
    let first = wu["first_name"].as_str().unwrap_or("").trim().to_string();
    let last = wu["last_name"].as_str().unwrap_or("").trim().to_string();
    let full = format!("{} {}", first, last).trim().to_string();
    let name = if full.is_empty() { None } else { Some(full) };
    let avatar = wu["profile_picture_url"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let access_token = body["access_token"].as_str().unwrap_or("").to_string();
    let refresh_token = body["refresh_token"].as_str().map(|s| s.to_string());

    if workos_id.is_empty() {
        return Err("WorkOS returned no user id".to_string());
    }

    log::info!("WorkOS auth OK: user_id={}", workos_id);

    // Fetch existing org or auto-create "Personal"
    let mut org_id = None;
    let mut has_org = false;

    // Upsert user into Central DB to populate first_name, last_name, avatar, and last_login
    let mut internal_user_id = workos_id.clone(); // fallback if DB not ready
    if let Ok(db) = state.cdb().await {
        match db
            .upsert_user(
                &workos_id,
                &email,
                if first.is_empty() { None } else { Some(&first) },
                if last.is_empty() { None } else { Some(&last) },
                avatar.as_deref(),
            )
            .await
        {
            Ok(uid) => {
                log::info!("Upserted users.id: {} for workos_id: {}", uid, workos_id);
                internal_user_id = uid;
            }
            Err(e) => {
                log::warn!("Could not upsert user from workos_id {}: {} — falling back", workos_id, e);
                if let Ok(uid) = db.get_user_id_by_workos_id(&workos_id).await {
                    internal_user_id = uid;
                }
            }
        }

        if let Ok(orgs) = db.get_user_and_invited_organizations(&internal_user_id).await {
            if let Some(org) = orgs.into_iter().next() {
                org_id = Some(org.id.clone());
                has_org = true;
                *state.organization.write().await = Some(org);
            }
        }

        if !has_org {
            let new_id = uuid::Uuid::new_v4().to_string();
            if let Ok(org) = db
                .create_organization(&new_id, "Personal", &internal_user_id)
                .await
            {
                org_id = Some(org.id.clone());
                has_org = true;
                *state.organization.write().await = Some(org);
                log::info!("Auto-created Personal organization for user_id={}", internal_user_id);
            } else {
                log::error!("Failed to auto-create Personal organization for user_id={}", internal_user_id);
            }
        }
    }

    let user = AuthUser {
        id: internal_user_id.clone(),
        workos_id,
        email,
        name,
        avatar_url: avatar,
    };

    let stored = StoredSession {
        user: user.clone(),
        access_token,
        refresh_token,
        has_org,
        org_id: org_id.clone(),
    };

    crate::license::save_user_id(&internal_user_id);

    let json_str = serde_json::to_string(&stored).map_err(|e| e.to_string())?;
    
    // Write encrypted file
    write_session_fallback(&json_str);

    let info = AuthInfo {
        user,
        has_org,
        org_id,
    };

    // Detach any previous active profile or DB connection so state never leaks across logins
    *state.active_profile_id.write().await = None;
    *state.user_db.write().await = None;
    state.ready_profiles.write().await.clear();
    crate::license::clear_profile_id();

    // Store in RAM
    *state.auth_session.write().await = Some(info.clone());

    app.emit("auth-changed", &info).map_err(|e| e.to_string())?;

    Ok(info)
}

// ── Loopback callback server (runs via tokio::task::spawn_blocking) ──────────
fn recv_callback(
    app: AppHandle,
    server: tiny_http::Server,
    expected_state: String,
) -> Option<String> {
    let request = match server.recv_timeout(Duration::from_secs(300)) {
        Ok(Some(r)) => r,
        _ => {
            let _ = app.emit("auth-error", "Sign-in timed out".to_string());
            return None;
        }
    };

    let params = parse_query(request.url());

    let respond = |req: tiny_http::Request, msg: &str| {
        let header =
            tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..])
                .unwrap();
        let _ = req.respond(tiny_http::Response::from_string(callback_html(msg)).with_header(header));
    };

    if let Some(err) = params.get("error") {
        respond(request, "Sign-in failed");
        let _ = app.emit("auth-error", err.clone());
        return None;
    }

    let state_param = params.get("state").cloned().unwrap_or_default();
    let code = params.get("code").cloned().unwrap_or_default();

    if state_param != expected_state {
        respond(request, "Sign-in failed");
        let _ = app.emit("auth-error", "State mismatch — possible CSRF".to_string());
        return None;
    }
    if code.is_empty() {
        respond(request, "Sign-in failed");
        let _ = app.emit("auth-error", "No authorization code returned".to_string());
        return None;
    }

    respond(request, "Signed in to BusinessKit");
    Some(code)
}

// ── Tauri Commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn sign_in(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    screen_hint: Option<String>,
) -> Result<(), String> {
    let client_id = option_env!("WORKOS_CLIENT_ID")
        .filter(|s| !s.is_empty())
        .map(String::from)
        .or_else(|| std::env::var("WORKOS_CLIENT_ID").ok().filter(|s| !s.is_empty()))
        .unwrap_or_else(|| "client_01K68QM3F2JFQAFP8DJ7JJRDTY".to_string());
    let api_key = option_env!("WORKOS_API_KEY")
        .filter(|s| !s.is_empty())
        .map(String::from)
        .or_else(|| std::env::var("WORKOS_API_KEY").ok().filter(|s| !s.is_empty()))
        .unwrap_or_default();

    let mut server = tiny_http::Server::http(format!("127.0.0.1:{}", CALLBACK_PORT)).ok();
    if server.is_none() {
        std::thread::sleep(std::time::Duration::from_millis(250));
        server = tiny_http::Server::http(format!("127.0.0.1:{}", CALLBACK_PORT)).ok();
    }
    let server = server.ok_or_else(|| {
        format!("Failed to bind OAuth callback server on port {} — please ensure no other instance is using this port.", CALLBACK_PORT)
    })?;

    let state_param = uuid::Uuid::new_v4().to_string();
    let url = authorize_url(&client_id, &state_param, screen_hint.as_deref());

    use tauri_plugin_shell::ShellExt;
    #[allow(deprecated)]
    app.shell().open(&url, None).map_err(|e| format!("Failed to open browser: {}", e))?;
    log::info!("Opened WorkOS AuthKit: {}", url);

    let app2 = app.clone();
    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        let app3 = app2.clone();
        let code = tokio::task::spawn_blocking(move || {
            recv_callback(app3, server, state_param)
        }).await;

        let code = match code {
            Ok(Some(c)) => c,
            Ok(None) => return,
            Err(e) => {
                log::error!("spawn_blocking join error: {}", e);
                let _ = app2.emit("auth-error", "Internal error during sign-in".to_string());
                return;
            }
        };

        match complete_login(&app2, &state_inner, &client_id, &api_key, &code).await {
            Ok(_) => log::info!("Login complete"),
            Err(e) => {
                log::error!("Login failed: {}", e);
                let _ = app2.emit("auth-error", e);
            }
        }
    });

    Ok(())
}


/// Helper that reads the file, parses, and updates the state.
pub async fn hydrate_session(state: &AppState) {
    if state.auth_session.read().await.is_none() {
        if let Some(p) = read_session_fallback() {
            if let Ok(s) = serde_json::from_str::<StoredSession>(&p) {
                *state.auth_session.write().await = Some(AuthInfo {
                    user: s.user,
                    has_org: s.has_org,
                    org_id: s.org_id,
                });
            }
        }
    }
}

/// Non-Tauri native function to get auth status using cached state
pub async fn auth_status_native(state: &AppState) -> Result<Option<AuthInfo>, String> {
    hydrate_session(state).await;
    Ok(state.auth_session.read().await.clone())
}

/// Check if a session is stored — returns full AuthInfo or None.
#[tauri::command]
pub async fn auth_status(state: State<'_, Arc<AppState>>) -> Result<Option<AuthInfo>, String> {
    auth_status_native(state.inner()).await
}

/// Sign out — clear session, purge credential files, and reset RAM state.
#[tauri::command]
pub async fn sign_out(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    clear_session_fallback();
    crate::license::clear_user_id();
    crate::license::clear_profile_id();
    crate::license::clear_license_cache();

    // 1. Purge all cached userdb credentials and id files from credential directories
    for dir in crate::commands::organization::get_cred_cache_dirs() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if (name.starts_with("userdb_") && name.ends_with(".dat"))
                        || name == "profile_id.txt"
                        || name == "user_id.txt"
                        || name == "license_cache.json"
                        || name == "org_id.txt"
                    {
                        let _ = std::fs::remove_file(&path);
                    }
                }
            }
        }
    }

    // 2. Clear in-memory session cache & disconnect DB
    state.ready_profiles.write().await.clear();
    *state.user_db.write().await = None;
    *state.active_profile_id.write().await = None;
    *state.auth_session.write().await = None;
    *state.organization.write().await = None;

    let now = chrono::Utc::now().timestamp();
    *state.license.write().await = crate::LicenseStatus {
        status: "inactive".to_string(),
        plan: "free".to_string(),
        expires_at: None,
        checked_at: now,
        grace_until: None,
    };
    
    log::info!("Signed out: all session data, RAM connections, and credential files purged");
    Ok(())
}
