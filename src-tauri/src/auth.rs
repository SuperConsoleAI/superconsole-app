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

const KEYRING_SERVICE: &str = "com.superconsole.desktop";
const KEYRING_ACCOUNT: &str = "workos_session";

// Fixed loopback port so the redirect URI is stable and can be registered in
// the WorkOS dashboard. Register exactly: http://localhost:4666/callback
const CALLBACK_PORT: u16 = 4666;
const REDIRECT_URI: &str = "http://localhost:4666/callback";

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct AuthUser {
    pub id: String,
    pub workos_id: String,
    pub email: String,
    pub name: Option<String>,
    #[serde(default)]
    pub logo_url: Option<String>,
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

impl AuthState {
    pub fn load_from_keyring() -> Self {
        let session = keyring_entry()
            .ok()
            .and_then(|e| e.get_password().ok())
            .and_then(|p| serde_json::from_str::<StoredSession>(&p).ok());
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

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())
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

    // Persist tokens to the OS keychain; cache identity in local SQLite.
    let stored = StoredSession {
        user: info.user.clone(),
        access_token,
        refresh_token,
    };
    keyring_entry()?
        .set_password(&serde_json::to_string(&stored).map_err(|e| e.to_string())?)
        .map_err(|e| format!("keychain write failed: {}", e))?;

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
        let _ = request.respond(
            tiny_http::Response::from_string(callback_html(msg)).with_header(header),
        );
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
        Some(json) => Ok(serde_json::from_str(&json).ok()),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn sign_out(db: State<Db>, state: State<AuthState>) -> Result<(), String> {
    if let Ok(entry) = keyring_entry() {
        let _ = entry.delete_credential();
    }
    let _ = db.clear_cloud_identity();
    // Leave zero cloud data on the machine after sign-out.
    let _ = db.clear_cloud_cache();
    *state.session.lock().unwrap() = None;
    Ok(())
}
