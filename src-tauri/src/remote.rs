use crate::db::Db;
use crate::scheduler;
use rand::Rng;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub const DEFAULT_HTTP_PORT: u16 = 4665;

pub fn ensure_api_token(db: &Db) -> String {
    if let Some(token) = db.get_setting("api_token") {
        return token;
    }
    let token: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(40)
        .map(char::from)
        .collect();
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
    let Some((token, chat_id)) = config else { return };
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
            Ok(ws) => match scheduler::exec_in_workspace(app, ws.id, command, "Telegram trigger", None).await {
                Ok(body) => body.chars().take(3800).collect(),
                Err(e) => format!("Error: {}", e),
            },
            Err(e) => e,
        };
    }
    "Commands:\n/workspaces — list workspaces\n/run <workspace> <command> — run a command".into()
}

pub fn spawn_telegram(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut offset: i64 = 0;
        let client = reqwest::Client::new();
        loop {
            let token = {
                let db = app.state::<Db>();
                db.get_setting("telegram_token").filter(|t| !t.is_empty())
            };
            let Some(token) = token else {
                tokio::time::sleep(Duration::from_secs(15)).await;
                continue;
            };

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

            for update in body["result"].as_array().cloned().unwrap_or_default() {
                if let Some(id) = update["update_id"].as_i64() {
                    offset = offset.max(id + 1);
                }
                let msg = &update["message"];
                let Some(text) = msg["text"].as_str() else { continue };
                let Some(chat_id) = msg["chat"]["id"].as_i64() else { continue };

                let allowed = {
                    let db = app.state::<Db>();
                    let saved = db.get_setting("telegram_chat_id").unwrap_or_default();
                    if saved.is_empty() {
                        // First contact pairs the bot with this chat
                        let _ = db.set_setting("telegram_chat_id", &chat_id.to_string());
                        true
                    } else {
                        saved == chat_id.to_string()
                    }
                };
                if !allowed {
                    continue;
                }

                let reply = handle_telegram_text(&app, text).await;
                let _ = client
                    .post(format!("https://api.telegram.org/bot{}/sendMessage", token))
                    .json(&json!({ "chat_id": chat_id, "text": reply }))
                    .send()
                    .await;
            }
        }
    });
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
                eprintln!("superconsole http server failed to bind port {}: {}", port, e);
                return;
            }
        };
        for mut request in server.incoming_requests() {
            let authed = request
                .headers()
                .iter()
                .any(|h| {
                    h.field.as_str().as_str().eq_ignore_ascii_case("x-superconsole-token")
                        && h.value.as_str() == token
                });

            let url = request.url().to_string();
            let method = request.method().as_str().to_string();

            let (status, body) = if url == "/health" {
                (200, json!({ "ok": true }).to_string())
            } else if !authed {
                (401, json!({ "error": "invalid or missing x-superconsole-token" }).to_string())
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
                            (400, json!({ "error": "expected { workspace, command }" }).to_string())
                        } else {
                            let ws = {
                                let db = app.state::<Db>();
                                db.find_workspace_by_name(ws_name)
                            };
                            match ws {
                                Ok(ws) => {
                                    let result = tauri::async_runtime::block_on(
                                        scheduler::exec_in_workspace(
                                            &app, ws.id, command, "HTTP trigger", None,
                                        ),
                                    );
                                    match result {
                                        Ok(output) => (200, json!({ "ok": true, "output": output }).to_string()),
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
