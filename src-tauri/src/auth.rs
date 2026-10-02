// Phase 7b — WorkOS auth (desktop, identity only).
//
// SECURITY / PRODUCTION TODO:
// This module reads WORKOS_API_KEY and TURSO_AUTH_TOKEN from the repo-root .env
// at runtime. These are SERVER-SIDE SECRETS and must NOT ship inside a
// distributed desktop binary. Before any public/distributed build, move the
// token-exchange and Turso writes behind the Cloudflare Worker (web portal,
// Phase 7c) and have the desktop talk to that worker instead. This direct
// approach is a deliberate dev-phase tradeoff only.

use crate::cloud::{self, cell_opt, cell_text, turso_execute, TursoConfig};
use crate::db::Db;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

// Fixed loopback port so the redirect URI is stable and can be registered in
// the WorkOS dashboard. Register exactly: http://localhost:4666/callback
const CALLBACK_PORT: u16 = 4666;
const REDIRECT_URI: &str = "http://localhost:4666/callback";

#[derive(Clone, Serialize, Deserialize)]
pub struct AuthUser {
    pub id: String,
    pub workos_id: String,
    pub email: String,
    pub name: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub full_name: Option<String>,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub logo_url: Option<String>,
    #[serde(default)]
    pub banner: Option<String>,
    #[serde(default)]
    pub bio: Option<String>,
    #[serde(default = "default_empty_json_arr")]
    pub social: String,
    #[serde(default = "default_empty_json_arr")]
    pub theme: String,
    #[serde(default = "default_one")]
    pub is_active: i64,
    #[serde(default)]
    pub is_public: i64,
    #[serde(default)]
    pub show_team: i64,
    #[serde(default = "default_one")]
    pub show_projects: i64,
    #[serde(default = "default_one")]
    pub show_usage: i64,
    #[serde(default)]
    pub off_platform: i64,
    #[serde(default)]
    pub go_local: i64,
    #[serde(default = "default_empty_json_arr")]
    pub presets: String,
}

fn default_empty_json_arr() -> String {
    "[]".to_string()
}

fn default_one() -> i64 {
    1
}

impl Default for AuthUser {
    fn default() -> Self {
        Self {
            id: String::new(),
            workos_id: String::new(),
            email: String::new(),
            name: None,
            username: None,
            full_name: None,
            avatar_url: None,
            logo_url: None,
            banner: None,
            bio: None,
            social: default_empty_json_arr(),
            theme: default_empty_json_arr(),
            is_active: 1,
            is_public: 0,
            show_team: 0,
            show_projects: 1,
            show_usage: 1,
            off_platform: 0,
            go_local: 0,
            presets: default_empty_json_arr(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct CloudOrg {
    pub id: String,
    pub name: String,
    pub plan: String,
    pub role: String,
    #[serde(default)]
    pub logo_url: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct AuthInfo {
    pub user: AuthUser,
    pub orgs: Vec<CloudOrg>,
}

#[derive(Clone, Serialize, Deserialize)]
struct StoredSession {
    user: AuthUser,
    access_token: String,
    refresh_token: Option<String>,
}

#[derive(Default)]
pub struct AuthState {
    session: Mutex<Option<StoredSession>>,
}

fn is_userdb_configured_for_user(db: &Db, user_id: &str) -> bool {
    if let Some(row) = db.get_userdb_config_row(user_id) {
        if !row.url.trim().is_empty() && !row.token_encrypted.trim().is_empty() {
            return true;
        }
    }
    let url = db.get_setting("userdb_url").unwrap_or_default();
    let token = db.get_setting("userdb_token").unwrap_or_default();
    !url.trim().is_empty() && !token.trim().is_empty()
}

impl AuthState {
    pub fn load_from_db(db: &Db) -> Self {
        let session = if let Some(json) = db.get_cloud_identity() {
            if let Ok(mut info) = serde_json::from_str::<AuthInfo>(&json) {
                if info.user.off_platform == 1 && !is_userdb_configured_for_user(db, &info.user.id) {
                    info.user.off_platform = 0;
                    let _ = db.set_setting("off_platform", "0");
                    if let Ok(payload) = serde_json::to_string(&info) {
                        let _ = db.set_cloud_identity(&payload);
                    }
                }
                Some(StoredSession {
                    user: info.user,
                    access_token: String::new(),
                    refresh_token: None,
                })
            } else {
                None
            }
        } else {
            None
        };
        AuthState {
            session: Mutex::new(session),
        }
    }
}

struct WorkosConfig {
    client_id: String,
    api_key: String,
}

fn workos_config() -> Result<WorkosConfig, String> {
    cloud::ensure_env();
    let client_id =
        std::env::var("WORKOS_CLIENT_ID").map_err(|_| "WORKOS_CLIENT_ID is not set".to_string())?;
    let api_key =
        std::env::var("WORKOS_API_KEY").map_err(|_| "WORKOS_API_KEY is not set".to_string())?;
    Ok(WorkosConfig { client_id, api_key })
}

fn turso_config() -> Result<TursoConfig, String> {
    cloud::turso_config()
}

fn authorize_url(cfg: &WorkosConfig, redirect_uri: &str, state: &str) -> String {
    format!(
        "https://api.workos.com/user_management/authorize?response_type=code&provider=authkit&client_id={}&redirect_uri={}&state={}",
        urlencode(&cfg.client_id),
        urlencode(redirect_uri),
        urlencode(state),
    )
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

async fn upsert_user_and_orgs(
    client: &reqwest::Client,
    cfg: &TursoConfig,
    workos_id: &str,
    email: &str,
    name: &Option<String>,
    avatar: &Option<String>,
) -> Result<AuthInfo, String> {
    // 1. Find or create the user.
    let found = turso_execute(
        client,
        cfg,
        "SELECT id FROM users WHERE workos_id = ?",
        vec![Some(workos_id.to_string())],
    )
    .await?;
    let rows = found["rows"].as_array().cloned().unwrap_or_default();

    let user_id = if let Some(row) = rows.first() {
        let id = cell_text(row, 0);
        if avatar.is_some() {
            let _ = turso_execute(
                client,
                cfg,
                "UPDATE users SET logo_url = ? WHERE id = ?",
                vec![avatar.clone(), Some(id.clone())],
            )
            .await;
        }
        id
    } else {
        let id = ulid::Ulid::new().to_string();
        turso_execute(
            client,
            cfg,
            "INSERT INTO users (id, workos_id, email, name, logo_url) VALUES (?, ?, ?, ?, ?)",
            vec![
                Some(id.clone()),
                Some(workos_id.to_string()),
                Some(email.to_string()),
                name.clone(),
                avatar.clone(),
            ],
        )
        .await?;
        id
    };

    // 1b. Reconcile any pending team invitations addressed to this email.
    accept_pending_invitations(client, cfg, &user_id, email).await;

    // 2. Load org memberships, creating a default org on first login.
    let mut orgs = load_orgs(client, cfg, &user_id).await?;
    if orgs.is_empty() {
        let org_id = ulid::Ulid::new().to_string();
        turso_execute(
            client,
            cfg,
            "INSERT INTO organizations (id, name, plan, owner_id) VALUES (?, ?, 'free', ?)",
            vec![
                Some(org_id.clone()),
                Some("Personal".to_string()),
                Some(user_id.clone()),
            ],
        )
        .await?;
        turso_execute(
            client,
            cfg,
            "INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'owner')",
            vec![Some(org_id.clone()), Some(user_id.clone())],
        )
        .await?;
        orgs = load_orgs(client, cfg, &user_id).await?;
    }

    Ok(AuthInfo {
        user: AuthUser {
            id: user_id,
            workos_id: workos_id.to_string(),
            email: email.to_string(),
            name: name.clone(),
            logo_url: avatar.clone(),
            ..Default::default()
        },
        orgs,
    })
}

// Match pending invitations by email and convert them into memberships.
// Best-effort: failures here must never block sign-in.
async fn accept_pending_invitations(
    client: &reqwest::Client,
    cfg: &TursoConfig,
    user_id: &str,
    email: &str,
) {
    if crate::team::ensure_invitation_tables(client, cfg)
        .await
        .is_err()
    {
        return;
    }
    let email = email.trim().to_lowercase();

    if let Ok(res) = turso_execute(
        client,
        cfg,
        "SELECT id, org_id, role FROM org_invitations WHERE lower(email) = ? AND status = 'pending'",
        vec![Some(email.clone())],
    )
    .await
    {
        for row in cloud::rows(&res) {
            let inv_id = cell_text(&row, 0);
            let org_id = cell_text(&row, 1);
            let role = cell_text(&row, 2);
            let _ = turso_execute(
                client,
                cfg,
                "INSERT OR IGNORE INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)",
                vec![Some(org_id), Some(user_id.to_string()), Some(role)],
            )
            .await;
            let _ = turso_execute(
                client,
                cfg,
                "UPDATE org_invitations SET status = 'accepted' WHERE id = ?",
                vec![Some(inv_id)],
            )
            .await;
        }
    }

    if let Ok(res) = turso_execute(
        client,
        cfg,
        "SELECT id, project_id, role FROM project_invitations WHERE lower(email) = ? AND status = 'pending'",
        vec![Some(email)],
    )
    .await
    {
        for row in cloud::rows(&res) {
            let inv_id = cell_text(&row, 0);
            let project_id = cell_text(&row, 1);
            let role = cell_text(&row, 2);
            let _ = turso_execute(
                client,
                cfg,
                "INSERT OR IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)",
                vec![Some(project_id), Some(user_id.to_string()), Some(role)],
            )
            .await;
            let _ = turso_execute(
                client,
                cfg,
                "UPDATE project_invitations SET status = 'accepted' WHERE id = ?",
                vec![Some(inv_id)],
            )
            .await;
        }
    }
}

async fn load_orgs(
    client: &reqwest::Client,
    cfg: &TursoConfig,
    user_id: &str,
) -> Result<Vec<CloudOrg>, String> {
    let res = turso_execute(
        client,
        cfg,
        "SELECT o.id, o.name, o.plan, m.role, o.logo_url FROM organizations o \
         JOIN org_members m ON m.org_id = o.id WHERE m.user_id = ? ORDER BY o.name",
        vec![Some(user_id.to_string())],
    )
    .await?;
    let rows = res["rows"].as_array().cloned().unwrap_or_default();
    Ok(rows
        .iter()
        .map(|row| CloudOrg {
            id: cell_text(row, 0),
            name: cell_text(row, 1),
            plan: cell_text(row, 2),
            role: cell_text(row, 3),
            logo_url: cell_opt(row, 4),
        })
        .collect())
}

// --- WorkOS token exchange + full login ---

async fn complete_login(
    app: &AppHandle,
    wcfg: &WorkosConfig,
    code: &str,
) -> Result<AuthInfo, String> {
    let client = reqwest::Client::new();

    let resp = client
        .post("https://api.workos.com/user_management/authenticate")
        .json(&json!({
            "client_id": wcfg.client_id,
            "client_secret": wcfg.api_key,
            "grant_type": "authorization_code",
            "code": code,
        }))
        .send()
        .await
        .map_err(|e| format!("WorkOS request failed: {}", e))?;

    let status = resp.status();
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("WorkOS response parse failed: {}", e))?;

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

    let tcfg = turso_config()?;
    let info = upsert_user_and_orgs(&client, &tcfg, &workos_id, &email, &name, &avatar).await?;

    // Cache identity in local SQLite and RAM.
    let stored = StoredSession {
        user: info.user.clone(),
        access_token,
        refresh_token,
    };

    {
        let db = app.state::<Db>();
        let _ = db.set_cloud_identity(&serde_json::to_string(&info).map_err(|e| e.to_string())?);
    }
    {
        let state = app.state::<AuthState>();
        *state.session.lock().unwrap() = Some(stored);
    }

    Ok(info)
}

fn callback_html(message: &str) -> String {
    format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>SuperConsole</title>\
        <style>body{{font-family:-apple-system,system-ui,sans-serif;background:#262624;color:#f0eee7;\
        display:flex;height:100vh;margin:0;align-items:center;justify-content:center}}\
        .c{{text-align:center}}</style></head><body><div class=\"c\"><h2>{}</h2>\
        <p>You can close this window and return to SuperConsole.</p></div></body></html>",
        message
    )
}

fn run_callback(
    app: AppHandle,
    server: tiny_http::Server,
    wcfg: WorkosConfig,
    expected_state: String,
) {
    let request = match server.recv_timeout(Duration::from_secs(300)) {
        Ok(Some(r)) => r,
        _ => {
            let _ = app.emit("auth-error", "Sign-in timed out".to_string());
            return;
        }
    };

    let params = parse_query(request.url());
    let respond = |request: tiny_http::Request, msg: &str| {
        let header =
            tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..])
                .unwrap();
        let _ = request
            .respond(tiny_http::Response::from_string(callback_html(msg)).with_header(header));
    };

    if let Some(err) = params.get("error") {
        respond(request, "Sign-in failed");
        let _ = app.emit("auth-error", err.clone());
        return;
    }

    let state = params.get("state").cloned().unwrap_or_default();
    let code = params.get("code").cloned().unwrap_or_default();

    if state != expected_state {
        respond(request, "Sign-in failed");
        let _ = app.emit("auth-error", "State mismatch".to_string());
        return;
    }
    if code.is_empty() {
        respond(request, "Sign-in failed");
        let _ = app.emit("auth-error", "No authorization code returned".to_string());
        return;
    }

    respond(request, "Signed in");

    match tauri::async_runtime::block_on(complete_login(&app, &wcfg, &code)) {
        Ok(info) => {
            let _ = app.emit("auth-changed", info);
        }
        Err(e) => {
            eprintln!("superconsole auth: {}", e);
            let _ = app.emit("auth-error", e);
        }
    }
}

// --- Tauri commands ---

#[tauri::command]
pub fn sign_in(app: AppHandle) -> Result<String, String> {
    let wcfg = workos_config()?;
    // Loopback listener (RFC 8252) on a fixed port; REDIRECT_URI must be
    // registered in the WorkOS dashboard.
    let server = tiny_http::Server::http(("127.0.0.1", CALLBACK_PORT)).map_err(|e| {
        format!(
            "failed to start callback server on port {}: {}",
            CALLBACK_PORT, e
        )
    })?;
    let state = ulid::Ulid::new().to_string();
    let url = authorize_url(&wcfg, REDIRECT_URI, &state);

    std::thread::spawn(move || run_callback(app, server, wcfg, state));
    Ok(url)
}

#[tauri::command]
pub fn auth_status(db: State<Db>, state: State<AuthState>) -> Result<Option<AuthInfo>, String> {
    if state.session.lock().unwrap().is_none() {
        return Ok(None);
    }
    match db.get_cloud_identity() {
        Some(json) => {
            if let Ok(mut info) = serde_json::from_str::<AuthInfo>(&json) {
                if info.user.off_platform == 1 && !is_userdb_configured_for_user(&db, &info.user.id) {
                    info.user.off_platform = 0;
                    let _ = db.set_setting("off_platform", "0");
                    if let Ok(payload) = serde_json::to_string(&info) {
                        let _ = db.set_cloud_identity(&payload);
                    }
                }
                Ok(Some(info))
            } else {
                Ok(None)
            }
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn sign_out(db: State<Db>, state: State<AuthState>) -> Result<(), String> {
    let _ = db.clear_cloud_identity();
    *state.session.lock().unwrap() = None;
    crate::userdb::clear_memory_userdb_config();
    Ok(())
}

#[tauri::command]
pub async fn update_user_profile(
    app: AppHandle,
    db: State<'_, Db>,
    state: State<'_, AuthState>,
    username: Option<String>,
    full_name: Option<String>,
    avatar_url: Option<String>,
    bio: Option<String>,
    is_public: Option<bool>,
    off_platform: Option<bool>,
    go_local: Option<bool>,
    presets: Option<Vec<String>>,
) -> Result<AuthInfo, String> {
    let mut info: AuthInfo = match db.get_cloud_identity() {
        Some(json) => serde_json::from_str(&json).map_err(|e| e.to_string())?,
        None => return Err("Not signed in".to_string()),
    };

    if let Some(u) = username {
        let trimmed = u.trim().to_string();
        info.user.username = if trimmed.is_empty() { None } else { Some(trimmed) };
    }
    if let Some(fn_val) = full_name {
        let trimmed = fn_val.trim().to_string();
        info.user.full_name = if trimmed.is_empty() { None } else { Some(trimmed.clone()) };
        info.user.name = info.user.full_name.clone();
    }
    if let Some(av) = avatar_url {
        let trimmed = av.trim().to_string();
        info.user.avatar_url = if trimmed.is_empty() { None } else { Some(trimmed.clone()) };
        info.user.logo_url = info.user.avatar_url.clone();
    }
    if let Some(b) = bio {
        let trimmed = b.trim().to_string();
        info.user.bio = if trimmed.is_empty() { None } else { Some(trimmed) };
    }
    if let Some(pub_flag) = is_public {
        info.user.is_public = if pub_flag { 1 } else { 0 };
    }
    if let Some(off_flag) = off_platform {
        if off_flag && !is_userdb_configured_for_user(&db, &info.user.id) {
            return Err("Cannot enable Off-Platform Privacy Mode without a configured UserDB. Please configure your private UserDB in Settings > UserDB first.".to_string());
        }
        let off_val = if off_flag { 1 } else { 0 };
        info.user.off_platform = off_val;
        let _ = db.set_setting("off_platform", if off_flag { "1" } else { "0" });
        let uid = info.user.id.clone();
        if let Some(row) = db.get_userdb_config_row(&uid) {
            let _ = db.upsert_userdb_config_row(&uid, &row.url, &row.token_encrypted, off_val);
        }
    }
    if let Some(gl_flag) = go_local {
        let gl_val = if gl_flag { 1 } else { 0 };
        info.user.go_local = gl_val;
        let _ = db.set_setting("go_local", if gl_flag { "1" } else { "0" });
    }
    if let Some(p) = presets {
        let p_json = serde_json::to_string(&p).unwrap_or_else(|_| "[]".to_string());
        info.user.presets = p_json.clone();
        let _ = db.set_setting("user_presets", &p_json);
    }

    if let Ok(cfg) = turso_config() {
        let conn = crate::cloud::libsql_connect(&cfg).await?;
        let _ = conn.execute("ALTER TABLE users ADD COLUMN go_local INTEGER NOT NULL DEFAULT 0", ()).await;
        let _ = conn.execute("ALTER TABLE users ADD COLUMN presets TEXT NOT NULL DEFAULT '[]'", ()).await;
        conn.execute(
            "UPDATE users SET username = ?1, name = ?2, logo_url = ?3, bio = ?4, is_public = ?5, off_platform = ?6, go_local = ?7, presets = ?8 WHERE id = ?9 OR workos_id = ?10 OR email = ?11",
            libsql::params![
                info.user.username.clone(),
                info.user.name.clone().or_else(|| info.user.full_name.clone()),
                info.user.logo_url.clone().or_else(|| info.user.avatar_url.clone()),
                info.user.bio.clone().unwrap_or_default(),
                info.user.is_public,
                info.user.off_platform,
                info.user.go_local,
                info.user.presets.clone(),
                info.user.id.clone(),
                info.user.workos_id.clone(),
                info.user.email.clone(),
            ],
        )
        .await
        .map_err(|e| format!("CentralDB update failed: {}", e))?;
    }

    let payload = serde_json::to_string(&info).map_err(|e| e.to_string())?;
    db.set_cloud_identity(&payload)?;

    if let Ok(mut lock) = state.session.lock() {
        if let Some(ref mut s) = *lock {
            s.user = info.user.clone();
        }
    }

    let _ = app.emit("auth-changed", info.clone());
    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use rusqlite::Connection;

    #[test]
    fn test_is_userdb_configured_for_user() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::schema::localdb::provision_local_database(&conn).unwrap();
        let db = Db(std::sync::Mutex::new(conn));

        // 1. Initially false
        assert!(!is_userdb_configured_for_user(&db, "test_user"));

        // 2. Configure userdb row
        db.upsert_userdb_config_row("test_user", "https://my-turso.turso.io", "encrypted_token_123", 0).unwrap();

        // 3. Now should be true
        assert!(is_userdb_configured_for_user(&db, "test_user"));
    }

    #[test]
    fn test_auth_state_load_from_db_heals_unconfigured_off_platform() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::schema::localdb::provision_local_database(&conn).unwrap();
        let db = Db(std::sync::Mutex::new(conn));

        // Save cloud_identity with off_platform = 1, but no userdb row exists
        let fake_info = AuthInfo {
            user: AuthUser {
                id: "user_orphan".to_string(),
                workos_id: "workos_1".to_string(),
                email: "test@example.com".to_string(),
                off_platform: 1,
                ..Default::default()
            },
            orgs: vec![],
        };
        db.set_cloud_identity(&serde_json::to_string(&fake_info).unwrap()).unwrap();

        // Load into AuthState
        let state = AuthState::load_from_db(&db);
        let session = state.session.lock().unwrap();
        let loaded = session.as_ref().expect("Session must be loaded");

        // Must self-heal to off_platform = 0 because no userdb row exists
        assert_eq!(loaded.user.off_platform, 0);

        // SQLite cloud_identity must also be healed
        let saved_json = db.get_cloud_identity().unwrap();
        let saved: AuthInfo = serde_json::from_str(&saved_json).unwrap();
        assert_eq!(saved.user.off_platform, 0);
    }
}


