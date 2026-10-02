use crate::db::Db;
use crate::scheduler;
use rand::Rng;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// App-managed state tracking which bot tokens currently have a running
/// long-poll loop, so `refresh_telegram_bots` can add new loops without
/// restarting existing ones or dropping in-flight messages.
#[derive(Default)]
pub struct TelegramState(pub Arc<Mutex<HashSet<String>>>);

pub const DEFAULT_HTTP_PORT: u16 = 4665;

pub fn ensure_api_token(db: &Db) -> String {
    // 1. Try reading from dedicated api_tokens table
    if let Ok(conn) = db.0.lock() {
        if let Ok(token) = conn.query_row(
            "SELECT token FROM api_tokens WHERE name = 'http_trigger' OR name = 'default' ORDER BY id ASC LIMIT 1",
            [],
            |r| r.get::<_, String>(0),
        ) {
            if !token.trim().is_empty() {
                let _ = conn.execute(
                    "INSERT INTO settings (key, value) VALUES ('api_token', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1",
                    [&token],
                );
                return token;
            }
        }
    }

    // 2. Try legacy settings table
    if let Some(token) = db.get_setting("api_token") {
        if !token.trim().is_empty() {
            if let Ok(conn) = db.0.lock() {
                let _ = conn.execute(
                    "INSERT INTO api_tokens (name, token, description) VALUES ('http_trigger', ?1, 'Local HTTP trigger auth token') ON CONFLICT(name) DO UPDATE SET token = ?1",
                    [&token],
                );
            }
            return token;
        }
    }

    // 3. Generate new secure token and save to both api_tokens and settings
    let rand_part: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(38)
        .map(char::from)
        .collect();
    let token = format!("ct{}", rand_part);

    if let Ok(conn) = db.0.lock() {
        let _ = conn.execute(
            "INSERT INTO api_tokens (name, token, description) VALUES ('http_trigger', ?1, 'Local HTTP trigger auth token') ON CONFLICT(name) DO UPDATE SET token = ?1",
            [&token],
        );
    }
    let _ = db.set_setting("api_token", &token);
    token
}

fn telegram_config(db: &Db) -> Option<(String, String)> {
    let token = db.get_setting("telegram_token").filter(|t| !t.is_empty())?;
    let chat = db.get_setting("telegram_chat_id").unwrap_or_default();
    Some((token, chat))
}

pub async fn notify_telegram(app: &AppHandle, text: &str) {
    let config = {
        let db = app.state::<Db>();
        telegram_config(&db)
    };
    let Some((token, chat_id)) = config else {
        return;
    };
    if chat_id.is_empty() {
        return;
    }
    let truncated: String = text.chars().take(3800).collect();
    let client = reqwest::Client::new();
    let _ = client
        .post(format!("https://api.telegram.org/bot{}/sendMessage", token))
        .json(&json!({ "chat_id": chat_id, "text": truncated }))
        .send()
        .await;
}

async fn handle_telegram_text(app: &AppHandle, text: &str) -> String {
    let text = text.trim();
    if text == "/workspaces" || text == "/start" {
        let db = app.state::<Db>();
        let list = db
            .list_workspaces()
            .unwrap_or_default()
            .iter()
            .map(|w| format!("- {} ({})", w.name, w.cli))
            .collect::<Vec<_>>()
            .join("\n");
        return format!(
            "SuperConsole connected.\n\nWorkspaces:\n{}\n\nRun a command:\n/run <workspace> <command>",
            if list.is_empty() { "(none)".into() } else { list }
        );
    }
    if let Some(rest) = text.strip_prefix("/run ") {
        let mut parts = rest.splitn(2, ' ');
        let ws_name = parts.next().unwrap_or("").trim();
        let command = parts.next().unwrap_or("").trim();
        if ws_name.is_empty() || command.is_empty() {
            return "Usage: /run <workspace> <command>".into();
        }
        let ws = {
            let db = app.state::<Db>();
            db.find_workspace_by_name(ws_name)
        };
        return match ws {
            Ok(ws) => {
                match scheduler::exec_in_workspace(app, ws.id, command, "Telegram trigger", None)
                    .await
                {
                    Ok(body) => body.chars().take(3800).collect(),
                    Err(e) => format!("Error: {}", e),
                }
            }
            Err(e) => e,
        };
    }
    "Commands:\n/workspaces — list workspaces\n/run <workspace> <command> — run a command".into()
}

pub fn spawn_telegram(app: AppHandle) {
    // Manager: discover the global bot plus every per-project bot and run one
    // long-poll task per token. Project bots route straight to their workspace;
    // the global bot keeps the /workspaces + /run command interface.
    tauri::async_runtime::spawn(async move {
        loop {
            spawn_new_telegram_bots(&app);
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    });
}

/// Check for tokens not yet running a loop and spawn one for each new token.
/// Called by the 30s manager loop and by `refresh_telegram_bots` on demand.
/// Never restarts existing loops — safe to call at any time.
pub fn refresh_telegram_bots(app: &AppHandle) {
    spawn_new_telegram_bots(app);
}

fn spawn_new_telegram_bots(app: &AppHandle) {
    // Collect ALL unique tokens from every source:
    //   1. Global telegram_token setting (legacy / backward compat)
    //   2. Org-level connector bot_tokens (Option A \u2014 shared org bot)
    //   3. Project-level connector bot_tokens (Option B \u2014 own bot per project)
    // One long-poll loop per unique token. Routing inside the loop is by
    // matching (chat_id, thread_id) against project_telegram_bots().
    let mut bots: Vec<(String, Option<i64>)> = Vec::new();
    {
        let db = app.state::<Db>();

        // 1. Global setting.
        if let Some(tok) = db.get_setting("telegram_token").filter(|t| !t.is_empty()) {
            bots.push((tok, None));
        }

        // 2. Org-level connectors.
        for ws in db.list_workspaces().unwrap_or_default() {
            if let Some(pid) = db.get_workspace_project_id(ws.id) {
                if let Some(oid) = db.get_project_org(&pid) {
                    if let Some(tok) = crate::connectors::get_telegram_bot_token(&db, Some(&oid)) {
                        if !bots.iter().any(|(t, _)| t == &tok) {
                            bots.push((tok, None)); // No specific workspace \u2014 routes by chat_id
                        }
                    }
                }
            }
        }

        // 3. Per-project entries \u2014 also adds project-owned bot tokens (Option B).
        for (tok, ws_id, _chat_id, _thread_id, _allowed) in
            crate::connectors::project_telegram_bots(&db)
        {
            if !bots.iter().any(|(t, _)| t == &tok) {
                bots.push((tok, Some(ws_id)));
            }
        }
    }
    let active = app.state::<TelegramState>().0.clone();
    for (token, ws) in bots {
        let is_new = {
            let mut guard = active.lock().unwrap();
            guard.insert(token.clone())
        };
        if is_new {
            spawn_telegram_bot(app.clone(), active.clone(), token, ws);
        }
    }
}

// ---------------------------------------------------------------------------
// Telegram typed structs
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize, Default)]
struct TelegramUpdate {
    update_id: i64,
    message: Option<TgMessage>,
    callback_query: Option<CallbackQuery>,
}

#[derive(serde::Deserialize, Clone)]
struct TgMessage {
    message_id: i64,
    from: Option<TgUser>,
    chat: TgChat,
    message_thread_id: Option<i64>,
    text: Option<String>,
}

#[derive(serde::Deserialize, Clone)]
struct TgUser {
    id: i64,
    #[allow(dead_code)]
    username: Option<String>,
}

#[derive(serde::Deserialize, Clone)]
struct TgChat {
    id: i64,
    #[serde(rename = "type")]
    chat_type: String,
}

#[derive(serde::Deserialize)]
struct CallbackQuery {
    id: String,
    #[allow(dead_code)]
    from: TgUser,
    message: Option<TgMessage>,
    data: Option<String>,
}

// ---------------------------------------------------------------------------
// Long-poll loop
// ---------------------------------------------------------------------------

/// Long-poll a single Telegram bot. Exits once its token is no longer
/// registered, so the manager can re-spawn on change.
fn spawn_telegram_bot(
    app: AppHandle,
    active: Arc<Mutex<HashSet<String>>>,
    token: String,
    workspace: Option<i64>,
) {
    tauri::async_runtime::spawn(async move {
        let mut offset: i64 = 0;
        let client = reqwest::Client::new();
        loop {
            let still_registered = {
                let db = app.state::<Db>();
                match workspace {
                    None => db.get_setting("telegram_token").as_deref() == Some(token.as_str()),
                    Some(_) => crate::connectors::project_telegram_bots(&db)
                        .iter()
                        .any(|(t, _, _, _, _)| t == &token),
                }
            };
            if !still_registered {
                active.lock().unwrap().remove(&token);
                return;
            }

            let resp = client
                .get(format!("https://api.telegram.org/bot{}/getUpdates", token))
                .query(&[("timeout", "25"), ("offset", &offset.to_string())])
                .timeout(Duration::from_secs(35))
                .send()
                .await;

            let Ok(resp) = resp else {
                tokio::time::sleep(Duration::from_secs(10)).await;
                continue;
            };
            let Ok(body) = resp.json::<Value>().await else {
                tokio::time::sleep(Duration::from_secs(10)).await;
                continue;
            };

            let updates: Vec<TelegramUpdate> = body["result"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|v| serde_json::from_value(v).ok())
                .collect();

            for update in updates {
                offset = offset.max(update.update_id + 1);

                // --- Callback query (inline button tap) ---
                if let Some(cb) = update.callback_query {
                    handle_callback_query(&client, &token, cb, &app).await;
                    continue;
                }

                // --- Regular message ---
                let Some(msg) = update.message else { continue };
                let Some(ref text) = msg.text.clone() else {
                    continue;
                };
                let chat_id_str = msg.chat.id.to_string();
                let thread_id_str = msg
                    .message_thread_id
                    .map(|id| id.to_string())
                    .unwrap_or_default();
                let sender_id = msg.from.as_ref().map(|u| u.id.to_string());
                let chat_type = msg.chat.chat_type.as_str();

                if workspace.is_none() {
                    // Global legacy bot — gate on stored chat_id.
                    let allowed = {
                        let db = app.state::<Db>();
                        let saved = db.get_setting("telegram_chat_id").unwrap_or_default();
                        if saved.is_empty() {
                            let _ = db.set_setting("telegram_chat_id", &chat_id_str);
                            true
                        } else {
                            saved == chat_id_str
                        }
                    };
                    if !allowed {
                        continue;
                    }
                    let reply = handle_telegram_text(&app, text).await;
                    let _ = client
                        .post(format!("https://api.telegram.org/bot{}/sendMessage", token))
                        .json(&json!({ "chat_id": chat_id_str, "text": reply }))
                        .send()
                        .await;
                    continue;
                }

                // Project bot — full routing + message handler.
                let route = {
                    let db = app.state::<Db>();
                    resolve_route(&db, &token, &chat_id_str, &thread_id_str, chat_type)
                };

                let (ws_id, reply_token, reply_chat, reply_thread, allowed_ids) = match route {
                    Some(r) => r,
                    None => {
                        // No project match for this chat — only reply in DMs.
                        if chat_type == "private" {
                            send_tg_message(&client, &token, &chat_id_str, "", 
                                "No project configured for this chat. Set up a project connector in SuperConsole.").await;
                        }
                        continue;
                    }
                };

                // Allowed-user check.
                if !allowed_ids.is_empty() {
                    let sid = sender_id.clone().unwrap_or_default();
                    if !allowed_ids.contains(&sid) {
                        send_tg_message(
                            &client,
                            &reply_token,
                            &reply_chat,
                            &reply_thread,
                            "⛔ Not authorized.",
                        )
                        .await;
                        continue;
                    }
                }

                handle_telegram_message(
                    &client,
                    &app,
                    ws_id,
                    text,
                    &reply_token,
                    &reply_chat,
                    &reply_thread,
                )
                .await;
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/// Returns (workspace_id, bot_token, chat_id, thread_id, allowed_user_ids).
fn resolve_route(
    db: &Db,
    token: &str,
    chat_id: &str,
    thread_id: &str,
    chat_type: &str,
) -> Option<(i64, String, String, String, Vec<String>)> {
    if chat_type == "private" {
        return resolve_dm_route(db, token);
    }
    find_project_route(db, token, chat_id, thread_id)
}

/// DM route — find the org that owns this bot token; use its first workspace.
fn resolve_dm_route(db: &Db, token: &str) -> Option<(i64, String, String, String, Vec<String>)> {
    // Check project bots for a token match — use the first workspace found.
    let bots = crate::connectors::project_telegram_bots(db);
    if let Some((_, ws_id, chat_id, thread_id, allowed_ids)) =
        bots.iter().find(|(t, _, _, _, _)| t == token)
    {
        return Some((
            *ws_id,
            token.to_string(),
            chat_id.clone(),
            thread_id.clone(),
            allowed_ids.clone(),
        ));
    }
    // Global setting fallback — route to any workspace.
    for ws in db.list_workspaces().unwrap_or_default() {
        return Some((
            ws.id,
            token.to_string(),
            String::new(),
            String::new(),
            Vec::new(),
        ));
    }
    None
}

/// Group message routing — exact (chat_id+thread_id) then chat-only fallback.
fn find_project_route(
    db: &Db,
    token: &str,
    chat_id: &str,
    thread_id: &str,
) -> Option<(i64, String, String, String, Vec<String>)> {
    let bots = crate::connectors::project_telegram_bots(db);
    // Exact match.
    for (tok, ws_id, c, t, allowed) in &bots {
        if tok == token && c == chat_id && t == thread_id {
            return Some((*ws_id, tok.clone(), c.clone(), t.clone(), allowed.clone()));
        }
    }
    // Chat-only match.
    if !thread_id.is_empty() {
        for (tok, ws_id, c, t, allowed) in &bots {
            if tok == token && c == chat_id && t.is_empty() {
                return Some((*ws_id, tok.clone(), c.clone(), t.clone(), allowed.clone()));
            }
        }
    }
    None
}

/// Get the outbound Telegram route for a workspace (for job completion notifications).
pub fn get_telegram_route_for_workspace(
    db: &Db,
    workspace_id: i64,
) -> Option<(String, String, String)> {
    let bots = crate::connectors::project_telegram_bots(db);
    if let Some((tok, _, chat_id, thread_id, _)) =
        bots.iter().find(|(_, ws, _, _, _)| *ws == workspace_id)
    {
        return Some((tok.clone(), chat_id.clone(), thread_id.clone()));
    }
    // Global fallback.
    let token = db.get_setting("telegram_token").filter(|t| !t.is_empty())?;
    let chat_id = db.get_setting("telegram_chat_id").unwrap_or_default();
    if chat_id.is_empty() {
        return None;
    }
    Some((token, chat_id, String::new()))
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

async fn handle_telegram_message(
    client: &reqwest::Client,
    app: &AppHandle,
    workspace_id: i64,
    text: &str,
    token: &str,
    chat_id: &str,
    thread_id: &str,
) {
    let trimmed = text.trim();

    // Built-in commands
    match trimmed {
        "/inbox" => {
            handle_inbox_command(client, app, workspace_id, token, chat_id, thread_id).await;
            return;
        }
        "/status" => {
            handle_status_command(client, app, workspace_id, token, chat_id, thread_id).await;
            return;
        }
        "/agents" => {
            handle_agents_command(client, app, workspace_id, token, chat_id, thread_id).await;
            return;
        }
        "/help" | "/start" => {
            send_tg_message(
                client,
                token,
                chat_id,
                thread_id,
                "Commands:\n\
                /inbox           — pending approvals\n\
                /status          — running jobs\n\
                /agents          — list agents\n\
                /agent <name>    — run agent now\n\
                /task <cmd>      — create manual job\n\
                /task <freq> <cmd> — daily/weekly/hourly job\n\
                /schedule <cmd> <cron> — raw cron job\n\
                /help            — this message\n\
                \n\
                Free text → chat with your project agent.\n\
                Resource tokens: /skill:name /context:name /wiki:name /memory:name",
            )
            .await;
            return;
        }
        _ => {}
    }

    if trimmed.starts_with("/agent ") {
        let agent_name = trimmed.trim_start_matches("/agent ").trim();
        handle_run_agent(
            client,
            app,
            workspace_id,
            agent_name,
            token,
            chat_id,
            thread_id,
        )
        .await;
        return;
    }

    if trimmed.starts_with("/task ") {
        let args = trimmed.trim_start_matches("/task ").trim();
        handle_create_task(client, app, workspace_id, args, token, chat_id, thread_id).await;
        return;
    }

    if trimmed.starts_with("/schedule ") {
        let args = trimmed.trim_start_matches("/schedule ").trim();
        handle_create_schedule(client, app, workspace_id, args, token, chat_id, thread_id).await;
        return;
    }

    // Any other slash command → exec_in_workspace
    if trimmed.starts_with('/') {
        match scheduler::exec_in_workspace(app, workspace_id, trimmed, "Telegram trigger", None)
            .await
        {
            Ok(body) => {
                let out = tg_truncate(&body);
                let reply = if out.trim().is_empty() {
                    format!("✅ {}", trimmed)
                } else {
                    format!("✅ {}\n\n{}", trimmed, out)
                };
                send_tg_message(client, token, chat_id, thread_id, &reply).await;
            }
            Err(e) => {
                send_tg_message(
                    client,
                    token,
                    chat_id,
                    thread_id,
                    &format!("❌ {} failed\n{}", trimmed, e),
                )
                .await;
            }
        }
        return;
    }

    // Free text → native chat one-shot
    let reply = exec_chat_message(app, workspace_id, trimmed).await;
    send_tg_message(client, token, chat_id, thread_id, &reply).await;
}

// ---------------------------------------------------------------------------
// Built-in command handlers
// ---------------------------------------------------------------------------

async fn handle_inbox_command(
    client: &reqwest::Client,
    app: &AppHandle,
    workspace_id: i64,
    token: &str,
    chat_id: &str,
    thread_id: &str,
) {
    let items = {
        let db = app.state::<Db>();
        db.list_inbox()
            .unwrap_or_default()
            .into_iter()
            .filter(|i| i.workspace_id == workspace_id && i.status == "unread")
            .take(3)
            .collect::<Vec<_>>()
    };

    if items.is_empty() {
        send_tg_message(
            client,
            token,
            chat_id,
            thread_id,
            "📭 No pending inbox items.",
        )
        .await;
        return;
    }

    for item in items {
        let text = format!(
            "📬 *{}*\n{}\n\n_{}_{}",
            item.title,
            tg_truncate(&item.output),
            item.created_at,
            ""
        );
        send_with_approval_keyboard(client, token, chat_id, thread_id, &text, item.id).await;
    }
}

async fn handle_status_command(
    client: &reqwest::Client,
    app: &AppHandle,
    workspace_id: i64,
    token: &str,
    chat_id: &str,
    thread_id: &str,
) {
    let text = {
        let db = app.state::<Db>();
        let jobs = db.list_jobs(workspace_id).unwrap_or_default();
        let enabled: Vec<_> = jobs.iter().filter(|j| j.enabled).collect();
        if enabled.is_empty() {
            "📋 No active jobs.".to_string()
        } else {
            let lines = enabled
                .iter()
                .map(|j| {
                    format!(
                        "• {} — next: {}",
                        j.name,
                        j.next_run.as_deref().unwrap_or("manual")
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            format!("📋 Jobs:\n{}", lines)
        }
    };
    send_tg_message(client, token, chat_id, thread_id, &text).await;
}

async fn handle_agents_command(
    client: &reqwest::Client,
    app: &AppHandle,
    workspace_id: i64,
    token: &str,
    chat_id: &str,
    thread_id: &str,
) {
    let ws_path = {
        let db = app.state::<Db>();
        db.get_workspace(workspace_id)
            .map(|w| w.path)
            .unwrap_or_default()
    };
    let agents = crate::agents::list_agents(&ws_path);
    if agents.is_empty() {
        send_tg_message(
            client,
            token,
            chat_id,
            thread_id,
            "No agents configured.\nCreate one in SuperConsole → Agents.",
        )
        .await;
        return;
    }
    let list = agents
        .iter()
        .map(|a| format!("• {} — {}", a.name, a.description))
        .collect::<Vec<_>>()
        .join("\n");
    send_tg_message(
        client,
        token,
        chat_id,
        thread_id,
        &format!("🤖 Agents:\n{}\n\nRun with: /agent <name>", list),
    )
    .await;
}

async fn handle_run_agent(
    client: &reqwest::Client,
    app: &AppHandle,
    workspace_id: i64,
    agent_name: &str,
    token: &str,
    chat_id: &str,
    thread_id: &str,
) {
    let ws_path = {
        let db = app.state::<Db>();
        match db.get_workspace(workspace_id) {
            Ok(w) => w.path,
            Err(e) => {
                send_tg_message(client, token, chat_id, thread_id, &format!("❌ {}", e)).await;
                return;
            }
        }
    };
    let agent = match crate::agents::read_agent(&ws_path, agent_name) {
        Ok(a) => a,
        Err(_) => {
            send_tg_message(
                client,
                token,
                chat_id,
                thread_id,
                &format!(
                    "❌ Agent '{}' not found.\nSend /agents to see available agents.",
                    agent_name
                ),
            )
            .await;
            return;
        }
    };
    send_tg_message(
        client,
        token,
        chat_id,
        thread_id,
        &format!(
            "▶️ Running {}…\nResult will appear here when done.",
            agent.name
        ),
    )
    .await;

    let app2 = app.clone();
    let tok = token.to_string();
    let cid = chat_id.to_string();
    let tid = thread_id.to_string();
    let aname = agent.name.clone();
    tokio::spawn(async move {
        let client2 = reqwest::Client::new();
        let result = crate::scheduler::exec_agent(&app2, workspace_id, &agent).await;
        match result {
            Ok(body) => {
                send_tg_message(
                    &client2,
                    &tok,
                    &cid,
                    &tid,
                    &format!("✅ {} complete\n\n{}", aname, tg_truncate(&body)),
                )
                .await
            }
            Err(e) => {
                send_tg_message(
                    &client2,
                    &tok,
                    &cid,
                    &tid,
                    &format!("❌ {} failed\n{}", aname, e),
                )
                .await
            }
        }
    });
}

async fn handle_create_task(
    client: &reqwest::Client,
    app: &AppHandle,
    workspace_id: i64,
    args: &str,
    token: &str,
    chat_id: &str,
    thread_id: &str,
) {
    // "/task /ceo" → manual | "/task daily /ceo" → scheduled
    let parts: Vec<&str> = args.splitn(2, ' ').collect();
    let (schedule_keyword, command) = if parts.len() == 2 && !parts[0].starts_with('/') {
        (parts[0], parts[1])
    } else {
        ("", args)
    };
    let cron = frequency_to_cron(schedule_keyword);
    let job_name = format!("telegram-{}", command.trim_start_matches('/'));
    {
        let db = app.state::<Db>();
        let next = if cron.is_empty() {
            None
        } else {
            crate::scheduler::next_run(&cron).ok()
        };
        let _ = db.add_job(
            workspace_id,
            &job_name,
            command,
            &cron,
            next.as_deref(),
            "cli",
            "{}",
            "cron",
            "{}",
            "[]",
            None,
            1,
        );
    }
    let schedule_str = if cron.is_empty() {
        "manual".to_string()
    } else {
        format!("{} ({})", schedule_keyword, cron)
    };
    send_tg_message(
        client,
        token,
        chat_id,
        thread_id,
        &format!(
            "✅ Task created\n• Command: {}\n• Schedule: {}\n\nManage in SuperConsole → Tasks",
            command, schedule_str
        ),
    )
    .await;
}

async fn handle_create_schedule(
    client: &reqwest::Client,
    app: &AppHandle,
    workspace_id: i64,
    args: &str,
    token: &str,
    chat_id: &str,
    thread_id: &str,
) {
    let parts: Vec<&str> = args.splitn(2, ' ').collect();
    if parts.len() < 2 {
        send_tg_message(
            client,
            token,
            chat_id,
            thread_id,
            "Usage: /schedule <command> <cron>\nExample: /schedule /ceo 0 9 * * 1",
        )
        .await;
        return;
    }
    let command = parts[0];
    let cron = parts[1];
    if cron.split_whitespace().count() != 5 {
        send_tg_message(
            client,
            token,
            chat_id,
            thread_id,
            "❌ Invalid cron. Use 5 fields: minute hour day month weekday\nExample: 0 9 * * 1",
        )
        .await;
        return;
    }
    let job_name = format!("telegram-{}", command.trim_start_matches('/'));
    {
        let db = app.state::<Db>();
        let next = crate::scheduler::next_run(cron).ok();
        let _ = db.add_job(
            workspace_id,
            &job_name,
            command,
            cron,
            next.as_deref(),
            "cli",
            "{}",
            "cron",
            "{}",
            "[]",
            None,
            1,
        );
    }
    send_tg_message(
        client,
        token,
        chat_id,
        thread_id,
        &format!(
            "✅ Scheduled\n• Command: {}\n• Cron: {}\n\nManage in SuperConsole → Tasks",
            command, cron
        ),
    )
    .await;
}

fn frequency_to_cron(freq: &str) -> String {
    match freq.to_lowercase().as_str() {
        "hourly" => "0 * * * *".to_string(),
        "daily" => "0 9 * * *".to_string(),
        "weekly" | "monday" => "0 9 * * 1".to_string(),
        "tuesday" => "0 9 * * 2".to_string(),
        "wednesday" => "0 9 * * 3".to_string(),
        "thursday" => "0 9 * * 4".to_string(),
        "friday" => "0 9 * * 5".to_string(),
        "weekdays" => "0 9 * * 1-5".to_string(),
        _ => String::new(),
    }
}

/// Free-text → native chat one-shot completion with project system prompt.
async fn exec_chat_message(app: &AppHandle, workspace_id: i64, text: &str) -> String {
    // Resolve provider/model from workspace defaults (same as chat.rs).
    let (provider, model) = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id);
        match ws {
            Ok(w) => {
                let p = if w.default_provider.is_empty() {
                    "anthropic".to_string()
                } else {
                    w.default_provider.clone()
                };
                let m = if w.default_model.is_empty() {
                    "claude-sonnet-4-5".to_string()
                } else {
                    w.default_model.clone()
                };
                (p, m)
            }
            Err(_) => ("anthropic".to_string(), "claude-sonnet-4-5".to_string()),
        }
    };
    let system = crate::chat::build_system_prompt(app, workspace_id);
    match crate::llm::one_shot_completion(app, workspace_id, &provider, &model, &system, text).await
    {
        Ok(r) => tg_truncate(&r),
        Err(e) => format!("❌ Error: {}", e),
    }
}

// ---------------------------------------------------------------------------
// Inline approval keyboard
// ---------------------------------------------------------------------------

async fn send_with_approval_keyboard(
    client: &reqwest::Client,
    token: &str,
    chat_id: &str,
    thread_id: &str,
    text: &str,
    inbox_id: i64,
) {
    let truncated = tg_truncate(text);
    let mut params = json!({
        "chat_id": chat_id,
        "text": truncated,
        "parse_mode": "Markdown",
        "reply_markup": {
            "inline_keyboard": [[
                { "text": "✅ Approve", "callback_data": format!("approve:{}", inbox_id) },
                { "text": "❌ Reject",  "callback_data": format!("reject:{}", inbox_id) }
            ]]
        }
    });
    if !thread_id.is_empty() {
        if let Ok(tid) = thread_id.parse::<i64>() {
            params["message_thread_id"] = json!(tid);
        }
    }
    let _ = client
        .post(format!("https://api.telegram.org/bot{}/sendMessage", token))
        .json(&params)
        .send()
        .await;
}

async fn answer_callback_query(
    client: &reqwest::Client,
    token: &str,
    callback_id: &str,
    text: &str,
) {
    let _ = client
        .post(format!(
            "https://api.telegram.org/bot{}/answerCallbackQuery",
            token
        ))
        .json(&json!({ "callback_query_id": callback_id, "text": text }))
        .send()
        .await;
}

async fn edit_message_reply_markup(
    client: &reqwest::Client,
    token: &str,
    chat_id: &str,
    message_id: i64,
    keyboard: Option<Value>,
) {
    let mut params = json!({ "chat_id": chat_id, "message_id": message_id });
    params["reply_markup"] = keyboard.unwrap_or(json!({}));
    let _ = client
        .post(format!(
            "https://api.telegram.org/bot{}/editMessageReplyMarkup",
            token
        ))
        .json(&params)
        .send()
        .await;
}

async fn handle_callback_query(
    client: &reqwest::Client,
    token: &str,
    cb: CallbackQuery,
    app: &AppHandle,
) {
    let data = cb.data.unwrap_or_default();
    let (chat_id, thread_id, msg_id) = match &cb.message {
        Some(m) => (
            m.chat.id.to_string(),
            m.message_thread_id
                .map(|id| id.to_string())
                .unwrap_or_default(),
            m.message_id,
        ),
        None => return,
    };

    if let Some((action, id_str)) = data.split_once(':') {
        if let Ok(inbox_id) = id_str.parse::<i64>() {
            let approved = action == "approve";
            let status = if approved { "approved" } else { "rejected" };
            {
                let db = app.state::<Db>();
                let _ = db.set_inbox_status(inbox_id, status);
            }
            answer_callback_query(
                client,
                token,
                &cb.id,
                if approved {
                    "✅ Approved"
                } else {
                    "❌ Rejected"
                },
            )
            .await;
            edit_message_reply_markup(client, token, &chat_id, msg_id, None).await;
            send_tg_message(
                client,
                token,
                &chat_id,
                &thread_id,
                if approved {
                    "✅ Approved and marked in inbox."
                } else {
                    "❌ Rejected and marked in inbox."
                },
            )
            .await;
        }
    }
    // Always answer to dismiss loading spinner, even on parse failure.
    let _ = answer_callback_query(client, token, &cb.id, "").await;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn tg_truncate(s: &str) -> String {
    let max = 3800;
    if s.chars().count() <= max {
        s.to_string()
    } else {
        format!("{}…", s.chars().take(max).collect::<String>())
    }
}

async fn send_tg_message(
    client: &reqwest::Client,
    token: &str,
    chat_id: &str,
    thread_id: &str,
    text: &str,
) {
    let truncated = tg_truncate(text);
    let mut params = json!({ "chat_id": chat_id, "text": truncated });
    if !thread_id.is_empty() {
        if let Ok(tid) = thread_id.parse::<i64>() {
            params["message_thread_id"] = json!(tid);
        }
    }
    let _ = client
        .post(format!("https://api.telegram.org/bot{}/sendMessage", token))
        .json(&params)
        .send()
        .await;
}

/// Public alias — used by scheduler.rs to notify a project's Telegram topic
/// when a job completes. Thin wrapper over send_tg_message.
pub async fn notify_telegram_topic(
    client: &reqwest::Client,
    token: &str,
    chat_id: &str,
    thread_id: &str,
    text: &str,
) {
    send_tg_message(client, token, chat_id, thread_id, text).await;
}

/// Detected Telegram chat info returned by the auto-detect command.
#[derive(serde::Serialize)]
pub struct TelegramChatDetected {
    pub chat_id: String,
    pub thread_id: Option<String>,
    pub chat_title: Option<String>,
}

/// Poll getUpdates for up to 30s using the org-level bot token and return
/// the first NEW message's chat_id + thread_id. Used by the [Detect →] button
/// in the project Telegram connector form.
pub async fn detect_telegram_chat(app: AppHandle) -> Result<TelegramChatDetected, String> {
    let token = {
        let db = app.state::<Db>();
        crate::connectors::get_telegram_bot_token(&db, None).ok_or_else(|| {
            "No Telegram bot token found. Set one in Org → Connectors → Telegram first.".to_string()
        })?
    };
    let client = reqwest::Client::new();
    // Snapshot the current offset so we only see messages arriving AFTER this call.
    let mut offset: i64 = 0;
    if let Ok(resp) = client
        .get(format!("https://api.telegram.org/bot{}/getUpdates", token))
        .query(&[("timeout", "0"), ("offset", "-1")])
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        if let Ok(body) = resp.json::<Value>().await {
            if let Some(arr) = body["result"].as_array() {
                if let Some(last) = arr.last() {
                    if let Some(id) = last["update_id"].as_i64() {
                        offset = id + 1;
                    }
                }
            }
        }
    }
    let deadline = tokio::time::Instant::now() + Duration::from_secs(32);
    loop {
        if tokio::time::Instant::now() >= deadline {
            return Err("No message received in 30s. Make sure you sent a message to the bot in your group.".to_string());
        }
        let resp = client
            .get(format!("https://api.telegram.org/bot{}/getUpdates", token))
            .query(&[("timeout", "25"), ("offset", &offset.to_string())])
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let body = resp.json::<Value>().await.map_err(|e| e.to_string())?;
        for update in body["result"].as_array().cloned().unwrap_or_default() {
            if let Some(id) = update["update_id"].as_i64() {
                offset = offset.max(id + 1);
            }
            let msg = &update["message"];
            let Some(chat_id) = msg["chat"]["id"].as_i64() else {
                continue;
            };
            let thread_id = msg["message_thread_id"].as_i64().map(|id| id.to_string());
            let chat_title = msg["chat"]["title"].as_str().map(|s| s.to_string());
            return Ok(TelegramChatDetected {
                chat_id: chat_id.to_string(),
                thread_id,
                chat_title,
            });
        }
    }
}

pub fn spawn_http(app: AppHandle) {
    let (enabled, port, token) = {
        let db = app.state::<Db>();
        let enabled = db.get_setting("http_enabled").as_deref() == Some("1");
        let port = db
            .get_setting("http_port")
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(DEFAULT_HTTP_PORT);
        (enabled, port, ensure_api_token(&db))
    };
    if !enabled {
        return;
    }

    std::thread::spawn(move || {
        let server = match tiny_http::Server::http(("127.0.0.1", port)) {
            Ok(s) => s,
            Err(e) => {
                eprintln!(
                    "superconsole http server failed to bind port {}: {}",
                    port, e
                );
                return;
            }
        };
        for mut request in server.incoming_requests() {
            let authed = request.headers().iter().any(|h| {
                h.field
                    .as_str()
                    .as_str()
                    .eq_ignore_ascii_case("x-superconsole-token")
                    && h.value.as_str() == token
            });

            let url = request.url().to_string();
            let method = request.method().as_str().to_string();

            let (status, body) = if url == "/health" {
                (200, json!({ "ok": true }).to_string())
            } else if !authed {
                (
                    401,
                    json!({ "error": "invalid or missing x-superconsole-token" }).to_string(),
                )
            } else if method == "GET" && url == "/workspaces" {
                let db = app.state::<Db>();
                match db.list_workspaces() {
                    Ok(ws) => (200, serde_json::to_string(&ws).unwrap_or_default()),
                    Err(e) => (500, json!({ "error": e }).to_string()),
                }
            } else if method == "POST" && url == "/trigger" {
                let mut buf = String::new();
                let _ = request.as_reader().read_to_string(&mut buf);
                match serde_json::from_str::<Value>(&buf) {
                    Ok(payload) => {
                        let ws_name = payload["workspace"].as_str().unwrap_or("");
                        let command = payload["command"].as_str().unwrap_or("");
                        if ws_name.is_empty() || command.is_empty() {
                            (
                                400,
                                json!({ "error": "expected { workspace, command }" }).to_string(),
                            )
                        } else {
                            let ws = {
                                let db = app.state::<Db>();
                                db.find_workspace_by_name(ws_name)
                            };
                            match ws {
                                Ok(ws) => {
                                    let result = tauri::async_runtime::block_on(
                                        scheduler::exec_in_workspace(
                                            &app,
                                            ws.id,
                                            command,
                                            "HTTP trigger",
                                            None,
                                        ),
                                    );
                                    match result {
                                        Ok(output) => (
                                            200,
                                            json!({ "ok": true, "output": output }).to_string(),
                                        ),
                                        Err(e) => (500, json!({ "error": e }).to_string()),
                                    }
                                }
                                Err(e) => (404, json!({ "error": e }).to_string()),
                            }
                        }
                    }
                    Err(_) => (400, json!({ "error": "invalid json" }).to_string()),
                }
            } else {
                (404, json!({ "error": "not found" }).to_string())
            };

            let header =
                tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                    .unwrap();
            let _ = request.respond(
                tiny_http::Response::from_string(body)
                    .with_status_code(status)
                    .with_header(header),
            );
        }
    });
}

// ── Email trigger polling (3C) ────────────────────────────────────────────────
//
// Called from the scheduler's 30s tick loop (scheduler.rs::spawn), alongside the
// due-jobs runner. Completely independent of the Telegram long-poll, which runs in
// its own spawned task (spawn_telegram / spawn_telegram_bot).
//
// Flow per email-triggered job:
//   1. Parse trigger_config: {connector, filter, last_checked}
//   2. Resolve Gmail API key from the connected connector (cache-only)
//   3. Query Gmail Messages.list?q=<filter> after:<last_checked ISO>
//   4. For each new message: inject sender + subject as context, exec the job command
//   5. Persist updated last_checked in trigger_config so the same email never fires twice

#[derive(Debug)]
struct EmailMeta {
    sender: String,
    subject: String,
}

/// Resolve the Gmail API key for a workspace from the local connector cache.
/// Uses session_env (account→org→project cascade). Returns None if not connected.
fn gmail_api_key_for_workspace(app: &AppHandle, workspace_id: i64) -> Option<String> {
    let env = crate::connectors::session_env(app, workspace_id);
    let key = env
        .into_iter()
        .find(|(k, _)| k == "GMAIL_API_KEY")
        .map(|(_, v)| v)
        .unwrap_or_default();
    if key.is_empty() {
        None
    } else {
        Some(key)
    }
}

/// Poll Gmail for messages matching `filter` received after `since_rfc3339`.
/// Returns None on auth/network error, Some([]) if nothing new.
async fn check_gmail_for_new_emails(
    api_key: &str,
    filter: &str,
    since_rfc3339: &str,
) -> Option<Vec<EmailMeta>> {
    // Parse last_checked into a unix timestamp for Gmail's after: operator
    let after_ts = chrono::DateTime::parse_from_rfc3339(since_rfc3339)
        .map(|dt| dt.timestamp())
        .unwrap_or(0);

    let query = if filter.is_empty() {
        format!("is:unread after:{}", after_ts)
    } else {
        format!("{} after:{}", filter, after_ts)
    };

    let client = reqwest::Client::new();
    let list_resp = client
        .get("https://www.googleapis.com/gmail/v1/users/me/messages")
        .header("Authorization", format!("Bearer {}", api_key))
        .query(&[("q", &query), ("maxResults", &"10".to_string())])
        .send()
        .await
        .ok()?;

    if !list_resp.status().is_success() {
        eprintln!("Email trigger: Gmail API error {}", list_resp.status());
        return None;
    }

    let body: serde_json::Value = list_resp.json().await.ok()?;
    let messages = body["messages"].as_array()?;

    let mut out = Vec::new();
    for msg in messages.iter().take(5) {
        let msg_id = msg["id"].as_str().unwrap_or_default();
        if msg_id.is_empty() {
            continue;
        }

        // Fetch message headers (sender + subject only — no body)
        let detail_resp = client
            .get(format!(
                "https://www.googleapis.com/gmail/v1/users/me/messages/{}",
                msg_id
            ))
            .header("Authorization", format!("Bearer {}", api_key))
            .query(&[
                ("format", "metadata"),
                ("metadataHeaders", "From"),
                ("metadataHeaders", "Subject"),
            ])
            .send()
            .await
            .ok()?;

        if !detail_resp.status().is_success() {
            continue;
        }
        let detail: serde_json::Value = detail_resp.json().await.ok()?;
        let headers = detail["payload"]["headers"].as_array();
        let mut sender = String::new();
        let mut subject = String::new();
        if let Some(hdrs) = headers {
            for h in hdrs {
                match h["name"].as_str().unwrap_or("") {
                    "From" => sender = h["value"].as_str().unwrap_or("").to_string(),
                    "Subject" => subject = h["value"].as_str().unwrap_or("").to_string(),
                    _ => {}
                }
            }
        }
        out.push(EmailMeta { sender, subject });
    }
    Some(out)
}

/// Check all email-triggered jobs and fire the ones with new matching emails.
/// Called once per 30s tick from `scheduler::spawn`. Cache-only; never blocks Telegram.
pub async fn check_email_triggers(app: &AppHandle) {
    let db = app.state::<crate::db::Db>();
    let email_jobs = db.get_jobs_by_trigger_type("email");
    if email_jobs.is_empty() {
        return;
    }

    for job in email_jobs {
        let config: serde_json::Value =
            serde_json::from_str(&job.trigger_config).unwrap_or_default();

        let filter = config["filter"].as_str().unwrap_or("").to_string();
        let last_checked = config["last_checked"]
            .as_str()
            .unwrap_or("1970-01-01T00:00:00Z")
            .to_string();
        let connector_id = config["connector"].as_str().unwrap_or("gmail").to_string();

        // Only Gmail supported in Phase 1; other connectors → skip gracefully
        if connector_id != "gmail" {
            eprintln!(
                "Email trigger: unsupported connector '{}', skipping job {}",
                connector_id, job.id
            );
            continue;
        }

        let Some(api_key) = gmail_api_key_for_workspace(app, job.workspace_id) else {
            eprintln!(
                "Email trigger: no Gmail connector for workspace {}, skipping",
                job.workspace_id
            );
            continue;
        };

        let new_emails = check_gmail_for_new_emails(&api_key, &filter, &last_checked).await;
        let Some(emails) = new_emails else {
            continue;
        };
        if emails.is_empty() {
            continue;
        }

        // Fire the job for each new email (one execution per email)
        for email in &emails {
            let context = format!(
                "New email trigger\nFrom: {}\nSubject: {}\nConnector: {}",
                email.sender, email.subject, connector_id
            );
            let command = format!("{}\n\n{}", job.command, context);
            if let Err(e) = crate::scheduler::exec_in_workspace(
                app,
                job.workspace_id,
                &command,
                &format!("email: {}", job.name),
                Some(job.id),
            )
            .await
            {
                eprintln!("Email trigger: job {} exec failed: {}", job.id, e);
            }
        }

        // Persist updated last_checked so the same emails never fire again
        let new_config = serde_json::json!({
            "connector": connector_id,
            "filter":    filter,
            "last_checked": chrono::Utc::now().to_rfc3339()
        });
        let _ = db.update_job_trigger_config(job.id, &new_config.to_string());
    }
}
