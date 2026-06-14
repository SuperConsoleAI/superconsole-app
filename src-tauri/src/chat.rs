// Native multi-provider chat. The provider HTTP call happens here in Rust so
// decrypted API keys (from the local cache) never reach the webview. Tokens are
// streamed to the UI via Tauri events, mirroring the pty-output pattern.
//
// Three request adapters cover all providers:
//   - Anthropic  (native Messages API, SSE content_block_delta)
//   - OpenAI-compatible (OpenAI, OpenRouter, Local/Ollama; SSE chat.completion)
//   - Gemini     (native streamGenerateContent?alt=sse)

use crate::db::Db;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Deserialize)]
pub struct ChatMsg {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Serialize)]
struct ChatToken {
    request_id: String,
    content: String,
}

#[derive(Clone, Serialize)]
struct ChatSignal {
    request_id: String,
}

#[derive(Clone, Serialize)]
struct ChatError {
    request_id: String,
    message: String,
}

const SYSTEM_PROMPT_FILES: &[&str] = &["CLAUDE.md", "brand-voice.md", "HEARTBEAT.md"];

fn build_system_prompt(app: &AppHandle, workspace_id: i64) -> String {
    let path = {
        let db = app.state::<Db>();
        db.get_workspace(workspace_id).ok().map(|w| w.path)
    };
    let Some(path) = path else {
        return String::new();
    };
    let dir = Path::new(&path);
    let mut sections = Vec::new();
    for name in SYSTEM_PROMPT_FILES {
        if let Ok(content) = std::fs::read_to_string(dir.join(name)) {
            let trimmed = content.trim();
            if trimmed.is_empty() {
                continue;
            }
            let truncated: String = trimmed.chars().take(8000).collect();
            sections.push(format!("# {}\n\n{}", name, truncated));
        }
    }

    let services = crate::connectors::connected_services(app, workspace_id);
    if !services.is_empty() {
        sections.push(format!(
            "# Connected tools\n\nThe following connectors are configured for this project and their \
             credentials are available to agent sessions as environment variables: {}. \
             Tell the user when a task can use one of these connected tools.",
            services.join(", ")
        ));
    }

    sections.join("\n\n---\n\n")
}

#[tauri::command]
pub fn has_provider_key(app: AppHandle, workspace_id: i64, provider: String) -> bool {
    if provider == "local" {
        return true;
    }
    crate::llm::resolve_provider_credentials(&app, workspace_id, &provider)
        .map(|c| c.api_key.is_some())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    request_id: String,
    workspace_id: i64,
    provider: String,
    model: String,
    messages: Vec<ChatMsg>,
) -> Result<(), String> {
    let creds = crate::llm::resolve_provider_credentials(&app, workspace_id, &provider);
    let key = creds.as_ref().and_then(|c| c.api_key.clone());
    let base_url = creds.as_ref().and_then(|c| c.base_url.clone());

    if provider != "local" && key.is_none() {
        // Surfaced by the UI as "Add an API key in Settings -> Models".
        return Err("NO_KEY".to_string());
    }

    let system = build_system_prompt(&app, workspace_id);

    if let Err(e) = stream(
        &app,
        &request_id,
        &provider,
        &model,
        &system,
        &messages,
        key.as_deref(),
        base_url.as_deref(),
    )
    .await
    {
        let _ = app.emit(
            "chat-error",
            ChatError {
                request_id: request_id.clone(),
                message: e,
            },
        );
        return Ok(());
    }

    let _ = app.emit("chat-done", ChatSignal { request_id });
    Ok(())
}

enum Sse {
    Token(String),
    Done,
}

fn truncate(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

#[allow(clippy::too_many_arguments)]
async fn stream(
    app: &AppHandle,
    request_id: &str,
    provider: &str,
    model: &str,
    system: &str,
    messages: &[ChatMsg],
    key: Option<&str>,
    base_url: Option<&str>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let req = build_request(&client, provider, model, system, messages, key, base_url)?;

    let resp = req.send().await.map_err(|e| format!("request failed: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("{} — {}", status, truncate(&body, 500)));
    }

    let mut resp = resp;
    let mut buffer = String::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buffer.find('\n') {
            let line: String = buffer.drain(..=pos).collect();
            let line = line.trim_end_matches(['\r', '\n']);
            match parse_sse_line(provider, line) {
                Some(Sse::Token(t)) => {
                    if !t.is_empty() {
                        let _ = app.emit(
                            "chat-token",
                            ChatToken {
                                request_id: request_id.to_string(),
                                content: t,
                            },
                        );
                    }
                }
                Some(Sse::Done) => return Ok(()),
                None => {}
            }
        }
    }
    Ok(())
}

fn parse_sse_line(provider: &str, line: &str) -> Option<Sse> {
    let payload = line.strip_prefix("data:")?.trim();
    if payload.is_empty() {
        return None;
    }
    if payload == "[DONE]" {
        return Some(Sse::Done);
    }
    let v: Value = serde_json::from_str(payload).ok()?;

    match provider {
        "anthropic" => match v["type"].as_str() {
            Some("content_block_delta") => {
                Some(Sse::Token(v["delta"]["text"].as_str().unwrap_or("").to_string()))
            }
            Some("message_stop") => Some(Sse::Done),
            _ => None,
        },
        "gemini" => {
            let text: String = v["candidates"][0]["content"]["parts"]
                .as_array()
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(|p| p["text"].as_str())
                        .collect::<String>()
                })
                .unwrap_or_default();
            Some(Sse::Token(text))
        }
        // OpenAI-compatible (openai, openrouter, local)
        _ => Some(Sse::Token(
            v["choices"][0]["delta"]["content"]
                .as_str()
                .unwrap_or("")
                .to_string(),
        )),
    }
}

#[allow(clippy::too_many_arguments)]
fn build_request(
    client: &reqwest::Client,
    provider: &str,
    model: &str,
    system: &str,
    messages: &[ChatMsg],
    key: Option<&str>,
    base_url: Option<&str>,
) -> Result<reqwest::RequestBuilder, String> {
    match provider {
        "anthropic" => {
            let base = base_url.unwrap_or("https://api.anthropic.com");
            let url = format!("{}/v1/messages", base.trim_end_matches('/'));
            let msgs: Vec<Value> = messages
                .iter()
                .map(|m| json!({ "role": m.role, "content": m.content }))
                .collect();
            let mut body = json!({
                "model": model,
                "max_tokens": 4096,
                "stream": true,
                "messages": msgs,
            });
            if !system.is_empty() {
                body["system"] = json!(system);
            }
            Ok(client
                .post(url)
                .header("x-api-key", key.unwrap_or(""))
                .header("anthropic-version", "2023-06-01")
                .json(&body))
        }
        "gemini" => {
            let base = base_url.unwrap_or("https://generativelanguage.googleapis.com/v1beta");
            let url = format!(
                "{}/models/{}:streamGenerateContent?alt=sse&key={}",
                base.trim_end_matches('/'),
                model,
                key.unwrap_or("")
            );
            let contents: Vec<Value> = messages
                .iter()
                .map(|m| {
                    let role = if m.role == "assistant" { "model" } else { "user" };
                    json!({ "role": role, "parts": [{ "text": m.content }] })
                })
                .collect();
            let mut body = json!({ "contents": contents });
            if !system.is_empty() {
                body["systemInstruction"] = json!({ "parts": [{ "text": system }] });
            }
            Ok(client.post(url).json(&body))
        }
        _ => {
            let default = match provider {
                "openrouter" => "https://openrouter.ai/api/v1",
                "local" => "http://localhost:11434/v1",
                _ => "https://api.openai.com/v1",
            };
            let base = base_url.unwrap_or(default);
            let url = format!("{}/chat/completions", base.trim_end_matches('/'));
            let mut msgs: Vec<Value> = Vec::new();
            if !system.is_empty() {
                msgs.push(json!({ "role": "system", "content": system }));
            }
            for m in messages {
                msgs.push(json!({ "role": m.role, "content": m.content }));
            }
            let body = json!({ "model": model, "messages": msgs, "stream": true });
            let mut rb = client.post(url).json(&body);
            if let Some(k) = key {
                if !k.is_empty() {
                    rb = rb.bearer_auth(k);
                }
            }
            if provider == "openrouter" {
                rb = rb.header("X-Title", "SuperConsole");
            }
            Ok(rb)
        }
    }
}
