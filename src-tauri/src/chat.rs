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
use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// Request ids the user has asked to stop. The streaming loops poll this and
/// finalize early. Cleared per request at the start/end of `chat_send`.
#[derive(Default)]
pub struct ChatCancel(pub Mutex<HashSet<String>>);

fn is_cancelled(app: &AppHandle, request_id: &str) -> bool {
    app.state::<ChatCancel>()
        .0
        .lock()
        .map(|s| s.contains(request_id))
        .unwrap_or(false)
}

fn clear_cancel(app: &AppHandle, request_id: &str) {
    if let Ok(mut s) = app.state::<ChatCancel>().0.lock() {
        s.remove(request_id);
    }
}

#[tauri::command]
pub fn stop_chat(app: AppHandle, request_id: String) {
    if let Ok(mut s) = app.state::<ChatCancel>().0.lock() {
        s.insert(request_id);
    }
}

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
struct ChatDone {
    request_id: String,
    tokens_prompt: i64,
    tokens_completion: i64,
    cost_usd: f64,
}

#[derive(Clone, Serialize)]
struct ChatError {
    request_id: String,
    message: String,
}

#[derive(Clone, Serialize)]
pub struct CompactedPayload {
    pub request_id: String,
    pub messages_before: usize,
    pub messages_after: usize,
}

#[derive(Clone, Serialize)]
pub struct CompactResult {
    pub messages_before: usize,
    pub messages_after: usize,
}

/// Returns the context-window token limit for a given model name.
fn context_limit_for_model(model: &str) -> u64 {
    if model.contains("claude-opus-4") || model.contains("claude-sonnet-4") {
        200_000
    } else if model.contains("claude-haiku") {
        200_000
    } else if model.contains("gpt-4o") {
        128_000
    } else if model.contains("gpt-4o-mini") {
        128_000
    } else if model.contains("gemini") {
        1_000_000
    } else {
        128_000 // safe fallback
    }
}

/// Simple token estimator: ~4 chars per token is a reasonable English estimate.
fn estimate_tokens(text: &str) -> u64 {
    (text.len() as u64) / 4
}

/// 3-layer chat compaction:
///   Layer 1 — identify oldest 50% of user/assistant/tool messages (never touch system/harness)
///   Layer 2 — LLM produces a structured markdown summary, written as an append-only session log
///             file at .superconsole/sessions/<session_id>.md
///   Layer 3 — replace pruned messages with a single user-role context message (NOT system,
///             which is the SuperConsole harness — never overwrite it)
async fn compact_messages(
    messages: Vec<ChatMsg>,
    provider: &str,
    model: &str,
    app: &AppHandle,
    workspace_id: i64,
    session_id: &str,
    workspace_path: &str,
) -> Result<Vec<ChatMsg>, String> {
    if messages.len() < 4 {
        return Ok(messages);
    }

    let split_at = messages.len() / 2;
    let to_prune = &messages[..split_at];
    let to_keep = &messages[split_at..];

    // Layer 1: collect messages to prune (skip system — that's the SuperConsole harness)
    let history_text = to_prune
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| format!("{}: {}", m.role, &m.content[..m.content.len().min(300)]))
        .collect::<Vec<_>>()
        .join("\n");

    // Layer 2: structured summary (not a raw dump)
    let summary_prompt = format!(
        "Summarize this conversation in structured markdown. Include:\n\
         - What was being worked on (1-2 sentences)\n\
         - Key decisions made (bullet list)\n\
         - Current state / outcome\n\
         Be specific. Use real names, file paths, values from the conversation.\n\n\
         Conversation:\n{}",
        history_text
    );

    let summary = crate::llm::one_shot_completion(
        app,
        workspace_id,
        provider,
        model,
        "You summarize conversations into structured markdown. Be specific, not generic.",
        &summary_prompt,
    )
    .await
    .unwrap_or_else(|_| "Earlier conversation context omitted.".to_string());

    // Layer 2 (cont.): write structured summary to session log file (append-only)
    let sessions_dir = format!("{}/.superconsole/sessions", workspace_path);
    std::fs::create_dir_all(&sessions_dir).ok();
    let session_log_path = format!("{}/{}.md", sessions_dir, session_id);
    let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M UTC");
    let existing = std::fs::read_to_string(&session_log_path).unwrap_or_default();
    let header = if existing.is_empty() {
        format!(
            "# Session Log\n\nSession: `{}`  \nStarted: {}\n\n---\n",
            session_id,
            chrono::Utc::now().format("%Y-%m-%d %H:%M UTC")
        )
    } else {
        String::new()
    };
    let log_entry = format!("\n\n## Compacted at {}\n\n{}\n\n---", timestamp, summary);
    // Never fail compaction because of log write failure
    std::fs::write(
        &session_log_path,
        format!("{}{}{}", existing, header, log_entry),
    )
    .ok();

    // Upsert session log metadata so it's discoverable in SessionsView + autocomplete
    {
        let db = app.state::<crate::db::Db>();
        let _ = db.upsert_session_log(
            session_id,
            workspace_id,
            &session_log_path,
            &format!("Chat compaction at {}", timestamp),
        );
    }

    // Layer 3: replace pruned messages with ONE user message (NOT system)
    // system message = SuperConsole harness (build_system_prompt) — never touch it
    // user message   = conversation history — safe to insert summary context here
    let mut compacted = vec![ChatMsg {
        role: "user".to_string(),
        content: format!(
            "[Context from earlier in this conversation]\n\n{}\n\n\
             [Full log: .superconsole/sessions/{}.md]",
            summary, session_id
        ),
    }];
    compacted.extend_from_slice(to_keep);
    Ok(compacted)
}

const SYSTEM_PROMPT_FILES: &[&str] = &["CLAUDE.md", "brand-voice.md", "HEARTBEAT.md"];

pub(crate) fn build_system_prompt(app: &AppHandle, workspace_id: i64) -> String {
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

    let skills = crate::skills::active_skills(app, workspace_id);
    if !skills.is_empty() {
        let list = skills
            .iter()
            .map(|(name, desc)| {
                if desc.is_empty() {
                    format!("- {}", name)
                } else {
                    format!("- {}: {}", name, desc)
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        sections.push(format!(
            "# Skills available\n\nThe following skills are active for this project. Each is a reusable \
             instruction set. Only the names and descriptions are listed here; ask the user to run a \
             skill (e.g. /{}) to load its full instructions on demand.\n\n{}",
            skills[0].0, list
        ));
    }

    let context_files = crate::context::scan_for(app, workspace_id);
    if !context_files.is_empty() {
        sections.push(format!(
            "# Context files available\n\nReference files the user maintains for this project. Only \
             the slugs are listed; fetch a file on demand with context_read when relevant: {}.",
            context_files.join(", ")
        ));
    }

    let memory = crate::memory::memory_context(app, workspace_id);
    if !memory.is_empty() {
        sections.push(memory);
    }

    let wiki = crate::wiki::wiki_context(app, workspace_id);
    if !wiki.is_empty() {
        sections.push(wiki);
    }

    // Before-prompt hook — non-blocking, stdout appended as extra context.
    {
        let mut hook_env = std::collections::HashMap::new();
        let total_len: usize = sections.iter().map(|s| s.len()).sum();
        hook_env.insert("SUPERCONSOLE_PROMPT_LENGTH".into(), total_len.to_string());
        let hook_out =
            crate::hooks::run_hook(&path, crate::hooks::HookType::BeforePrompt, &hook_env);
        let trimmed = hook_out.trim();
        if !trimmed.is_empty() {
            sections.push(format!(
                "# Additional context (from before-prompt hook)\n\n{}",
                trimmed
            ));
        }
    }

    let rules = crate::rules::list_rules(&path);
    let active_rules: Vec<_> = rules.into_iter().filter(|r| r.always_apply).collect();
    if !active_rules.is_empty() {
        let mut rule_section = String::from("# Rules\n\n");
        for rule in active_rules {
            rule_section.push_str(&format!("### {}\n{}\n\n", rule.name, rule.content));
        }
        sections.push(rule_section);
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
    tool_mode: Option<String>,
    reasoning: Option<String>,
) -> Result<(), String> {
    clear_cancel(&app, &request_id);
    // Models are picked from the OpenRouter catalog (ids like `anthropic/claude…`).
    // For first-party providers we call their own API, which expects the bare
    // model name, so strip the `vendor/` prefix. Anthropic ids use dots on
    // OpenRouter (`claude-sonnet-4.5`) but the native API uses hyphens
    // (`claude-sonnet-4-5`); OpenAI/Gemini keep their dots. OpenRouter keeps the
    // full id.
    let model = match provider.as_str() {
        "anthropic" => {
            let bare = model.split_once('/').map(|(_, m)| m).unwrap_or(&model);
            bare.replace('.', "-")
        }
        "openai" | "gemini" => model
            .split_once('/')
            .map(|(_, m)| m.to_string())
            .unwrap_or(model),
        _ => model,
    };
    let creds = crate::llm::resolve_provider_credentials(&app, workspace_id, &provider);
    let key = creds.as_ref().and_then(|c| c.api_key.clone());
    let base_url = creds.as_ref().and_then(|c| c.base_url.clone());

    if provider != "local" && key.is_none() {
        // Surfaced by the UI as "Add an API key in Settings -> Models".
        return Err("NO_KEY".to_string());
    }

    // --- Auto-compaction: estimate token usage and compact before sending if >70% full ---
    let messages = {
        let history_tokens: u64 = messages.iter().map(|m| estimate_tokens(&m.content)).sum();
        let limit = context_limit_for_model(&model);
        let usage_pct = (history_tokens as f64 / limit as f64) * 100.0;
        if usage_pct > 70.0 && messages.len() >= 4 {
            let original_count = messages.len();
            // Clone so we can fall back if compaction fails
            let fallback = messages.clone();
            match compact_messages(
                messages,
                &provider,
                &model,
                &app,
                workspace_id,
                "auto", // auto-compact during chat_send has no canonical session_id
                &{
                    let db = app.state::<crate::db::Db>();
                    db.get_workspace(workspace_id)
                        .map(|w| w.path)
                        .unwrap_or_default()
                },
            )
            .await
            {
                Ok(compacted) => {
                    let after = compacted.len();
                    let _ = app.emit(
                        "chat-compacted",
                        CompactedPayload {
                            request_id: request_id.clone(),
                            messages_before: original_count,
                            messages_after: after,
                        },
                    );
                    compacted
                }
                Err(e) => {
                    eprintln!("[chat] auto-compact failed (sending full history): {}", e);
                    fallback
                }
            }
        } else {
            messages
        }
    };
    let mut system = build_system_prompt(&app, workspace_id);

    // Expand a trailing `/slash` command message into its body for the model.
    // The persisted/displayed user bubble keeps the short slash form.
    let mut messages = messages;
    if let Some(last) = messages.last_mut() {
        if last.role == "user" && last.content.trim_start().starts_with('/') {
            let ws_path = {
                let db = app.state::<Db>();
                db.get_workspace(workspace_id).ok().map(|w| w.path)
            };
            if let Some(ws_path) = ws_path {
                if let Some(body) = crate::commands::resolve(&app, &ws_path, &last.content) {
                    last.content = body;
                }
            }
        }
    }

    // Surface @skill:/@context:/@connector:/@agent: resources referenced in the
    // latest user message as an availability hint — fetched on demand via MCP,
    // never inlined.
    if let Some(last) = messages.last() {
        if last.role == "user" {
            if let Some(hint) = crate::mcp::available_resources_hint(&last.content) {
                system = if system.is_empty() {
                    hint
                } else {
                    format!("{}\n\n{}", system, hint)
                };
            }
        }
    }

    // Tool-calling is supported for Anthropic + OpenAI-compatible cloud
    // providers. Gemini and local keep plain text streaming.
    let ctx = crate::mcp::native_ctx(&app, workspace_id);
    let tools_supported = matches!(provider.as_str(), "anthropic" | "openai" | "openrouter");
    let reasoning = reasoning.filter(|r| !r.is_empty() && r != "off");
    let result = if let (true, Some(ctx)) = (tools_supported, ctx) {
        run_tool_loop(
            &app,
            &request_id,
            &provider,
            &model,
            &system,
            &messages,
            key.as_deref(),
            base_url.as_deref(),
            &ctx,
            tool_mode.as_deref(),
            reasoning.as_deref(),
        )
        .await
    } else {
        stream(
            &app,
            &request_id,
            &provider,
            &model,
            &system,
            &messages,
            key.as_deref(),
            base_url.as_deref(),
            reasoning.as_deref(),
        )
        .await
    };

    let usage = match result {
        Err(e) => {
            clear_cancel(&app, &request_id);
            let _ = app.emit(
                "chat-error",
                ChatError {
                    request_id: request_id.clone(),
                    message: e,
                },
            );
            return Ok(());
        }
        Ok(u) => u,
    };

    // Cost estimate: prefer OpenRouter's live per-token pricing for OR models,
    // otherwise fall back to the hardcoded pricing table.
    let cost = match crate::llm::or_price_per_token(&model) {
        Some((p_in, p_out)) => {
            let t = |n: i64, r: f64| (n.max(0) as f64) * r;
            t(usage.prompt + usage.cached, p_in) + t(usage.completion + usage.reasoning, p_out)
        }
        None => crate::usage::estimate_cost(
            &model,
            &provider,
            usage.prompt,
            usage.cached,
            usage.completion,
            usage.reasoning,
        ),
    };

    // Record token usage for this chat turn (cli = "chat"). Needs a cloud
    // project ULID; skip recording silently for non-cloud workspaces.
    if usage.total() > 0 {
        let project_id = {
            let db = app.state::<Db>();
            db.get_workspace(workspace_id)
                .ok()
                .and_then(|w| w.project_id)
        };
        if let Some(project_id) = project_id {
            let cache_total = usage.prompt + usage.cached;
            let ev = crate::db::UsageEvent {
                project_id,
                session_id: Some(request_id.clone()),
                model: Some(model.clone()),
                provider: Some(provider.clone()),
                cli: Some("chat".to_string()),
                tokens_prompt: usage.prompt,
                tokens_prompt_cached: usage.cached,
                tokens_completion: usage.completion,
                tokens_reasoning: usage.reasoning,
                cost_usd: cost,
                cache_hit_rate: if cache_total > 0 {
                    usage.cached as f64 / cache_total as f64
                } else {
                    0.0
                },
                ..Default::default()
            };
            crate::usage::record_usage(&app, ev);
            // Also accumulate into chat_sessions for the Sessions feed display.
            let db = app.state::<Db>();
            db.update_chat_session_cost(
                &request_id,
                usage.prompt + usage.cached,
                usage.completion + usage.reasoning,
                cost,
                &model,
                &provider,
            );
            let app_c = app.clone();
            let rid_c = request_id.clone();
            tauri::async_runtime::spawn(async move {
                crate::userdb::sync_chat_session_to_userdb(&app_c, &rid_c).await;
            });
        }
    }

    clear_cancel(&app, &request_id);
    let _ = app.emit(
        "chat-done",
        ChatDone {
            request_id,
            tokens_prompt: usage.prompt + usage.cached,
            tokens_completion: usage.completion + usage.reasoning,
            cost_usd: cost,
        },
    );
    Ok(())
}

#[derive(Debug, Clone)]
struct ToolCall {
    id: String,
    name: String,
    args: String,
}

#[derive(Debug, Clone, Copy, Default)]
struct TurnUsage {
    prompt: i64,
    cached: i64,
    completion: i64,
    reasoning: i64,
}

impl TurnUsage {
    fn add(&mut self, o: &TurnUsage) {
        self.prompt += o.prompt;
        self.cached += o.cached;
        self.completion += o.completion;
        self.reasoning += o.reasoning;
    }
    fn total(&self) -> i64 {
        self.prompt + self.cached + self.completion + self.reasoning
    }
}

struct TurnResult {
    text: String,
    tool_calls: Vec<ToolCall>,
    usage: TurnUsage,
}

const MAX_TOOL_ITERS: usize = 8;

/// Multi-turn loop: stream a turn, execute any tool calls with project-scoped
/// credentials, append the results, and continue until the model stops calling
/// tools. Text is streamed to the UI live via chat-token events throughout.
#[allow(clippy::too_many_arguments)]
async fn run_tool_loop(
    app: &AppHandle,
    request_id: &str,
    provider: &str,
    model: &str,
    system: &str,
    init: &[ChatMsg],
    key: Option<&str>,
    base_url: Option<&str>,
    ctx: &crate::mcp::ToolCtx,
    tool_mode: Option<&str>,
    reasoning: Option<&str>,
) -> Result<TurnUsage, String> {
    let client = reqwest::Client::new();
    let anthropic = provider == "anthropic";
    let mut total = TurnUsage::default();

    let cw = crate::mcp::context_window(model);
    let specs = {
        let db = app.state::<Db>();
        // "direct" exposes every tool schema up front; "auto" (default) lets the
        // bridge load tools on demand to keep the context compact.
        if tool_mode == Some("direct") {
            crate::mcp::full_catalog(&db, ctx)
        } else {
            crate::mcp::exposed_specs(&db, ctx, cw).0
        }
    };
    let tools: Vec<Value> = if anthropic {
        specs.iter().map(|s| s.to_anthropic()).collect()
    } else {
        specs.iter().map(|s| s.to_openai()).collect()
    };

    // Provider-shaped running message history.
    let mut messages: Vec<Value> = init
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    for _ in 0..MAX_TOOL_ITERS {
        if is_cancelled(app, request_id) {
            return Ok(total);
        }
        let req = build_turn_request(
            &client, provider, model, system, &messages, &tools, key, base_url, reasoning,
        )?;
        let resp = req
            .send()
            .await
            .map_err(|e| format!("request failed: {}", e))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("{} — {}", status, truncate(&body, 500)));
        }
        let turn = collect_turn(provider, resp, app, request_id).await?;
        total.add(&turn.usage);

        if turn.tool_calls.is_empty() {
            return Ok(total);
        }

        // Execute tools and append assistant + result messages.
        let mut results: Vec<(ToolCall, String)> = Vec::new();
        for call in &turn.tool_calls {
            let args: Value = serde_json::from_str(&call.args).unwrap_or_else(|_| json!({}));
            let out = {
                let db = app.state::<Db>();
                crate::mcp::execute(&db, ctx, &call.name, args).await
            };
            let text = match out {
                Ok(v) => v.to_string(),
                Err(e) => json!({ "error": e }).to_string(),
            };
            results.push((call.clone(), text));
        }

        if anthropic {
            let mut content: Vec<Value> = Vec::new();
            if !turn.text.is_empty() {
                content.push(json!({"type": "text", "text": turn.text}));
            }
            for call in &turn.tool_calls {
                let input: Value = serde_json::from_str(&call.args).unwrap_or_else(|_| json!({}));
                content.push(
                    json!({"type": "tool_use", "id": call.id, "name": call.name, "input": input}),
                );
            }
            messages.push(json!({"role": "assistant", "content": content}));
            let result_blocks: Vec<Value> = results
                .iter()
                .map(|(c, t)| json!({"type": "tool_result", "tool_use_id": c.id, "content": t}))
                .collect();
            messages.push(json!({"role": "user", "content": result_blocks}));
        } else {
            let tool_calls: Vec<Value> = turn
                .tool_calls
                .iter()
                .map(|c| json!({"id": c.id, "type": "function", "function": {"name": c.name, "arguments": c.args}}))
                .collect();
            messages.push(json!({
                "role": "assistant",
                "content": if turn.text.is_empty() { Value::Null } else { json!(turn.text) },
                "tool_calls": tool_calls
            }));
            for (c, t) in &results {
                messages.push(json!({"role": "tool", "tool_call_id": c.id, "content": t}));
            }
        }
    }
    Ok(total)
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
    reasoning: Option<&str>,
) -> Result<TurnUsage, String> {
    let client = reqwest::Client::new();
    let req = build_request(
        &client, provider, model, system, messages, key, base_url, reasoning,
    )?;

    let resp = req
        .send()
        .await
        .map_err(|e| format!("request failed: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("{} — {}", status, truncate(&body, 500)));
    }

    let mut resp = resp;
    let mut buffer = String::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        if is_cancelled(app, request_id) {
            return Ok(TurnUsage::default());
        }
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
                Some(Sse::Done) => return Ok(TurnUsage::default()),
                None => {}
            }
        }
    }
    Ok(TurnUsage::default())
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
                let text = v["delta"]["text"]
                    .as_str()
                    .or_else(|| v["delta"]["thinking"].as_str())
                    .unwrap_or("")
                    .to_string();
                Some(Sse::Token(text))
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
        _ => {
            let text = v["choices"][0]["delta"]["content"]
                .as_str()
                .or_else(|| v["choices"][0]["delta"]["reasoning_content"].as_str())
                .unwrap_or("")
                .to_string();
            Some(Sse::Token(text))
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn apply_reasoning(body: &mut Value, provider: &str, reasoning: Option<&str>) {
    let Some(level) = reasoning else { return };
    if level == "off" {
        return;
    }
    match provider {
        // OpenAI reasoning models take a flat `reasoning_effort` ("low" | "medium" | "high").
        "openai" => {
            let effort = match level {
                "low" => "low",
                "medium" => "medium",
                _ => "high",
            };
            body["reasoning_effort"] = json!(effort);
        }
        // OpenRouter normalizes a `reasoning` object across models.
        "openrouter" => {
            let effort = match level {
                "extra" => "xhigh",
                other => other,
            };
            body["reasoning"] = json!({ "effort": effort });
        }
        "anthropic" => {
            let budget = match level {
                "low" => 2048,
                "medium" => 4096,
                "high" => 16384,
                "max" => 32768,
                "extra" => 64000,
                _ => 4096,
            };
            body["thinking"] = json!({
                "type": "enabled",
                "budget_tokens": budget
            });
            if body["max_tokens"].as_i64().unwrap_or(4096) <= budget {
                body["max_tokens"] = json!(budget + 4096);
            }
        }
        "gemini" => {
            let budget = match level {
                "low" => 2048,
                "medium" => 4096,
                "high" => 16384,
                "max" => 32768,
                "extra" => 65536,
                _ => 4096,
            };
            body["generationConfig"] = json!({
                "thinkingConfig": {
                    "thinkingBudget": budget
                }
            });
        }
        _ => {}
    }
}

fn build_request(
    client: &reqwest::Client,
    provider: &str,
    model: &str,
    system: &str,
    messages: &[ChatMsg],
    key: Option<&str>,
    base_url: Option<&str>,
    reasoning: Option<&str>,
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
            apply_reasoning(&mut body, provider, reasoning);
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
                    let role = if m.role == "assistant" {
                        "model"
                    } else {
                        "user"
                    };
                    json!({ "role": role, "parts": [{ "text": m.content }] })
                })
                .collect();
            let mut body = json!({ "contents": contents });
            if !system.is_empty() {
                body["systemInstruction"] = json!({ "parts": [{ "text": system }] });
            }
            apply_reasoning(&mut body, provider, reasoning);
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
            let mut body = json!({ "model": model, "messages": msgs, "stream": true });
            apply_reasoning(&mut body, provider, reasoning);
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

// --- tool-aware request + streaming collectors ---

#[allow(clippy::too_many_arguments)]
fn build_turn_request(
    client: &reqwest::Client,
    provider: &str,
    model: &str,
    system: &str,
    messages: &[Value],
    tools: &[Value],
    key: Option<&str>,
    base_url: Option<&str>,
    reasoning: Option<&str>,
) -> Result<reqwest::RequestBuilder, String> {
    if provider == "anthropic" {
        let base = base_url.unwrap_or("https://api.anthropic.com");
        let url = format!("{}/v1/messages", base.trim_end_matches('/'));
        let mut body = json!({
            "model": model,
            "max_tokens": 4096,
            "stream": true,
            "messages": messages,
        });
        if !system.is_empty() {
            body["system"] = json!(system);
        }
        if !tools.is_empty() {
            body["tools"] = json!(tools);
        }
        apply_reasoning(&mut body, provider, reasoning);
        Ok(client
            .post(url)
            .header("x-api-key", key.unwrap_or(""))
            .header("anthropic-version", "2023-06-01")
            .json(&body))
    } else {
        let default = match provider {
            "openrouter" => "https://openrouter.ai/api/v1",
            _ => "https://api.openai.com/v1",
        };
        let base = base_url.unwrap_or(default);
        let url = format!("{}/chat/completions", base.trim_end_matches('/'));
        let mut msgs: Vec<Value> = Vec::new();
        if !system.is_empty() {
            msgs.push(json!({ "role": "system", "content": system }));
        }
        msgs.extend(messages.iter().cloned());
        let mut body = json!({
            "model": model, "messages": msgs, "stream": true,
            "stream_options": { "include_usage": true }
        });
        if !tools.is_empty() {
            body["tools"] = json!(tools);
        }
        apply_reasoning(&mut body, provider, reasoning);
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

/// Stream one turn, emitting text tokens live and accumulating any tool calls.
async fn collect_turn(
    provider: &str,
    resp: reqwest::Response,
    app: &AppHandle,
    request_id: &str,
) -> Result<TurnResult, String> {
    let mut resp = resp;
    let mut buffer = String::new();
    let mut text = String::new();
    let mut usage = TurnUsage::default();
    // Keyed by streaming block/tool index.
    let mut tools: std::collections::BTreeMap<i64, (String, String, String)> =
        std::collections::BTreeMap::new();

    let emit = |t: &str| {
        if !t.is_empty() {
            let _ = app.emit(
                "chat-token",
                ChatToken {
                    request_id: request_id.to_string(),
                    content: t.to_string(),
                },
            );
        }
    };

    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        if is_cancelled(app, request_id) {
            return Ok(TurnResult {
                text,
                tool_calls: finalize(tools),
                usage,
            });
        }
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buffer.find('\n') {
            let line: String = buffer.drain(..=pos).collect();
            let line = line.trim_end_matches(['\r', '\n']);
            let Some(payload) = line.strip_prefix("data:").map(|s| s.trim()) else {
                continue;
            };
            if payload.is_empty() {
                continue;
            }
            if payload == "[DONE]" {
                return Ok(TurnResult {
                    text,
                    tool_calls: finalize(tools),
                    usage,
                });
            }
            let Ok(v) = serde_json::from_str::<Value>(payload) else {
                continue;
            };
            if provider == "anthropic" {
                // Usage arrives on message_start (input/cache) + message_delta (output).
                if let Some(u) = v
                    .get("message")
                    .and_then(|m| m.get("usage"))
                    .or_else(|| v.get("usage"))
                {
                    if let Some(n) = u["input_tokens"].as_i64() {
                        usage.prompt = n;
                    }
                    if let Some(n) = u["cache_read_input_tokens"].as_i64() {
                        usage.cached = n;
                    }
                    if let Some(n) = u["output_tokens"].as_i64() {
                        usage.completion = n;
                    }
                }
                match v["type"].as_str() {
                    Some("content_block_start") => {
                        let idx = v["index"].as_i64().unwrap_or(0);
                        let block = &v["content_block"];
                        if block["type"] == "tool_use" {
                            tools.insert(
                                idx,
                                (
                                    block["id"].as_str().unwrap_or("").to_string(),
                                    block["name"].as_str().unwrap_or("").to_string(),
                                    String::new(),
                                ),
                            );
                        }
                    }
                    Some("content_block_delta") => {
                        let idx = v["index"].as_i64().unwrap_or(0);
                        match v["delta"]["type"].as_str() {
                            Some("text_delta") => {
                                let t = v["delta"]["text"].as_str().unwrap_or("");
                                text.push_str(t);
                                emit(t);
                            }
                            Some("input_json_delta") => {
                                if let Some(e) = tools.get_mut(&idx) {
                                    e.2.push_str(v["delta"]["partial_json"].as_str().unwrap_or(""));
                                }
                            }
                            _ => {}
                        }
                    }
                    Some("message_stop") => {
                        return Ok(TurnResult {
                            text,
                            tool_calls: finalize(tools),
                            usage,
                        });
                    }
                    _ => {}
                }
            } else {
                // OpenAI-compatible usage (final chunk, needs stream_options).
                if let Some(u) = v.get("usage").filter(|u| !u.is_null()) {
                    if let Some(n) = u["prompt_tokens"].as_i64() {
                        let cached = u["prompt_tokens_details"]["cached_tokens"]
                            .as_i64()
                            .unwrap_or(0);
                        usage.cached = cached;
                        usage.prompt = (n - cached).max(0);
                    }
                    if let Some(n) = u["completion_tokens"].as_i64() {
                        usage.completion = n;
                    }
                    if let Some(n) = u["completion_tokens_details"]["reasoning_tokens"].as_i64() {
                        usage.reasoning = n;
                    }
                }
                let delta = &v["choices"][0]["delta"];
                if let Some(t) = delta["content"].as_str() {
                    text.push_str(t);
                    emit(t);
                }
                if let Some(calls) = delta["tool_calls"].as_array() {
                    for c in calls {
                        let idx = c["index"].as_i64().unwrap_or(0);
                        let entry = tools.entry(idx).or_insert((
                            String::new(),
                            String::new(),
                            String::new(),
                        ));
                        if let Some(id) = c["id"].as_str() {
                            if !id.is_empty() {
                                entry.0 = id.to_string();
                            }
                        }
                        if let Some(n) = c["function"]["name"].as_str() {
                            if !n.is_empty() {
                                entry.1 = n.to_string();
                            }
                        }
                        if let Some(a) = c["function"]["arguments"].as_str() {
                            entry.2.push_str(a);
                        }
                    }
                }
                if v["choices"][0]["finish_reason"].is_string() {
                    // Don't return yet: the usage chunk (stream_options) arrives
                    // after finish_reason on OpenAI. Keep reading until [DONE].
                    if provider == "anthropic" {
                        return Ok(TurnResult {
                            text,
                            tool_calls: finalize(tools),
                            usage,
                        });
                    }
                }
            }
        }
    }
    Ok(TurnResult {
        text,
        tool_calls: finalize(tools),
        usage,
    })
}

fn finalize(tools: std::collections::BTreeMap<i64, (String, String, String)>) -> Vec<ToolCall> {
    tools
        .into_values()
        .filter(|(_, name, _)| !name.is_empty())
        .map(|(id, name, args)| ToolCall {
            id,
            name,
            args: if args.trim().is_empty() {
                "{}".into()
            } else {
                args
            },
        })
        .collect()
}

/// Manual compaction command — called when the user types `/compact` in the chat input.
/// Loads the full session history, compacts it using the workspace's configured provider/model,
/// persists the result, writes a structured session log file, and returns before/after counts.
#[tauri::command]
pub async fn compact_chat_session(
    app: AppHandle,
    workspace_id: i64,
    session_id: String,
    provider: String,
    model: String,
) -> Result<CompactResult, String> {
    let (messages, workspace_path) = {
        let db = app.state::<crate::db::Db>();
        let messages = db.list_chat_messages(&session_id)?;
        let path = db
            .get_workspace(workspace_id)
            .map(|w| w.path)
            .unwrap_or_default();
        (messages, path)
    };
    let messages_before = messages.len();

    // Convert DB ChatMessage -> ChatMsg (the streaming type used by compact_messages)
    let chat_msgs: Vec<ChatMsg> = messages
        .into_iter()
        .map(|m| ChatMsg {
            role: m.role,
            content: m.content,
        })
        .collect();

    // Strip the vendor prefix that OpenRouter uses (e.g. "anthropic/claude-sonnet-4")
    let bare_model = match provider.as_str() {
        "anthropic" => {
            let b = model.split_once('/').map(|(_, m)| m).unwrap_or(&model);
            b.replace('.', "-")
        }
        "openai" | "gemini" => model
            .split_once('/')
            .map(|(_, m)| m.to_string())
            .unwrap_or(model.clone()),
        _ => model.clone(),
    };

    let compacted = compact_messages(
        chat_msgs,
        &provider,
        &bare_model,
        &app,
        workspace_id,
        &session_id,
        &workspace_path,
    )
    .await?;
    let messages_after = compacted.len();

    {
        let db = app.state::<crate::db::Db>();
        db.replace_chat_messages_with_compacted(&session_id, &compacted)?;
    }

    Ok(CompactResult {
        messages_before,
        messages_after,
    })
}
