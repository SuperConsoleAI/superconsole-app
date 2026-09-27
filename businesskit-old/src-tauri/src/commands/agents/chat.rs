// src-tauri/src/commands/agents/chat.rs
//
// In-app Agent Chat loop for BusinessKit.
// Supports OpenRouter (Gemini, Claude, DeepSeek, Llama, OpenAI) and Anthropic direct Messages API
// with streaming SSE and native autonomous tool calling loop.
//
// HARD RULES:
// - UserDB only (&TursoConn for active profile). Zero Central DB calls.
// - Persists history to `agent_chat_sessions` and `agent_chat_messages`.
// - System prompt injects `brand_foundation` row for active profile.
// - Tool calls dispatch via `super::tools::execute`.

use crate::AppState;
use super::analytics::{aggregate_agent_analytics, estimate_cost, estimate_tokens};
use super::tools::{self, ToolCtx};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use uuid::Uuid;

const MAX_TOOL_ITERS: usize = 8;
const DEFAULT_ANTHROPIC_MODEL: &str = "claude-5-sonnet";
const DEFAULT_OPENROUTER_MODEL: &str = "google/gemini-3.5-flash-lite";

// ── Shared cancellation state ──────────────────────────────────────────────────

#[derive(Default)]
pub struct ChatCancelState {
    cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl ChatCancelState {
    pub async fn register(&self, request_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.cancels.lock().await.insert(request_id.to_string(), Arc::clone(&flag));
        flag
    }

    pub async fn cancel(&self, request_id: &str) {
        if let Some(flag) = self.cancels.lock().await.get(request_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }

    pub async fn remove(&self, request_id: &str) {
        self.cancels.lock().await.remove(request_id);
    }
}

// ── Types ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentPayload {
    pub name: String,
    #[serde(alias = "mime_type")]
    pub mime_type: String,
    #[serde(alias = "data_base64")]
    pub data_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub profile_id: String,
    pub user_id: Option<String>,
    pub staff_id: Option<String>,
    pub title: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub mode: Option<String>,
    pub domain: Option<String>,
    pub cli_resume_ref: Option<String>,
    pub total_tokens: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_cost: f64,
    pub message_count: i64,
    pub tool_call_count: i64,
    pub last_message_preview: Option<String>,
    pub is_pinned: bool,
    pub is_saved: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub session_id: String,
    pub role: String, // "user" | "assistant" | "system"
    pub content: String,
    pub tool_calls_json: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenEvent {
    pub request_id: String,
    pub session_id: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallEvent {
    pub request_id: String,
    pub session_id: String,
    pub tool_name: String,
    pub tool_id: String,
    pub args: Value,
    pub result: Option<Value>,
    pub status: String, // "executing" | "completed" | "failed"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DoneEvent {
    pub request_id: String,
    pub session_id: String,
    pub content: String,
    pub tool_results: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorEvent {
    pub request_id: String,
    pub session_id: String,
    pub error: String,
}

// ── Provider API Key Resolution ────────────────────────────────────────────────

#[derive(Debug, Clone)]
enum ResolvedProvider {
    OpenAICompatible {
        api_key: String,
        base_url: String,
        model: String,
        is_openrouter: bool,
    },
    Anthropic {
        api_key: String,
        model: String,
    },
}

async fn get_connection_secret(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
    services: &[&str],
) -> Option<String> {
    for service in services {
        let q = "SELECT client_secret, access_token, client_id, extra FROM connections \
                 WHERE (profile_id = ?1 OR profile_id = '' OR profile_id IS NULL) \
                   AND LOWER(service) = LOWER(?2) AND is_active = 1 \
                 ORDER BY CASE WHEN extra LIKE '%\"is_primary\":true%' OR extra LIKE '%\"primary\":true%' THEN 0 ELSE 1 END, created_at DESC LIMIT 1";
        if let Ok(mut rows) = conn.query(q, crate::turso_params![profile_id, *service]).await {
            if let Ok(Some(row)) = rows.next().await {
                let secret: Option<String> = row.get(0).unwrap_or(None);
                let token: Option<String> = row.get(1).unwrap_or(None);
                let client_id: Option<String> = row.get(2).unwrap_or(None);

                if let Some(s) = secret.filter(|s| !s.trim().is_empty()) {
                    return Some(s.trim().to_string());
                }
                if let Some(t) = token.filter(|t| !t.trim().is_empty()) {
                    return Some(t.trim().to_string());
                }
                if let Some(c) = client_id.filter(|c| !c.trim().is_empty()) {
                    return Some(c.trim().to_string());
                }
            }
        }
    }
    None
}

async fn resolve_provider(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
    requested_provider: Option<&str>,
    requested_model: Option<&str>,
) -> Result<ResolvedProvider, String> {
    let req_p = requested_provider.unwrap_or("").trim().to_lowercase();
    let req_m = requested_model.unwrap_or("").trim();

    // 1. Anthropic / Claude
    if req_p == "anthropic" || req_p == "claude" {
        if let Some(key) = get_connection_secret(conn, profile_id, &["anthropic", "claude"]).await {
            let raw_model = if !req_m.is_empty() { req_m } else { DEFAULT_ANTHROPIC_MODEL };
            let model = raw_model.strip_prefix("anthropic/").unwrap_or(raw_model).to_string();
            return Ok(ResolvedProvider::Anthropic { api_key: key, model });
        }
        if let Some(key) = get_connection_secret(conn, profile_id, &["openrouter"]).await {
            let mut model = if !req_m.is_empty() { req_m.to_string() } else { DEFAULT_OPENROUTER_MODEL.to_string() };
            if !model.contains('/') { model = format!("anthropic/{}", model); }
            return Ok(ResolvedProvider::OpenAICompatible {
                api_key: key,
                base_url: "https://openrouter.ai/api/v1/chat/completions".into(),
                model,
                is_openrouter: true,
            });
        }
        return Err("Anthropic connection not found. Please add your Anthropic or OpenRouter API Key in Settings → Connections.".into());
    }

    // 2. Google Gemini
    if req_p == "gemini" || req_p == "google" || req_p == "google_ai" {
        if let Some(key) = get_connection_secret(conn, profile_id, &["gemini", "google", "google_ai", "googleai"]).await {
            let raw_model = if !req_m.is_empty() { req_m } else { "gemini-3.1-flash-lite" };
            let model = raw_model.strip_prefix("google/").unwrap_or(raw_model).to_string();
            return Ok(ResolvedProvider::OpenAICompatible {
                api_key: key,
                base_url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions".into(),
                model,
                is_openrouter: false,
            });
        }
        if let Some(key) = get_connection_secret(conn, profile_id, &["openrouter"]).await {
            let mut model = if !req_m.is_empty() { req_m.to_string() } else { "google/gemini-3.5-flash-lite".to_string() };
            if !model.contains('/') { model = format!("google/{}", model); }
            return Ok(ResolvedProvider::OpenAICompatible {
                api_key: key,
                base_url: "https://openrouter.ai/api/v1/chat/completions".into(),
                model,
                is_openrouter: true,
            });
        }
        return Err("Google Gemini connection not found. Please add your Gemini or OpenRouter API Key in Settings → Connections.".into());
    }

    // 3. OpenAI
    if req_p == "openai" || req_p == "gpt" {
        if let Some(key) = get_connection_secret(conn, profile_id, &["openai"]).await {
            let raw_model = if !req_m.is_empty() { req_m } else { "gpt-4o-mini" };
            let model = raw_model.strip_prefix("openai/").unwrap_or(raw_model).to_string();
            return Ok(ResolvedProvider::OpenAICompatible {
                api_key: key,
                base_url: "https://api.openai.com/v1/chat/completions".into(),
                model,
                is_openrouter: false,
            });
        }
        if let Some(key) = get_connection_secret(conn, profile_id, &["openrouter"]).await {
            let mut model = if !req_m.is_empty() { req_m.to_string() } else { "openai/gpt-4o-mini".to_string() };
            if !model.contains('/') { model = format!("openai/{}", model); }
            return Ok(ResolvedProvider::OpenAICompatible {
                api_key: key,
                base_url: "https://openrouter.ai/api/v1/chat/completions".into(),
                model,
                is_openrouter: true,
            });
        }
        return Err("OpenAI connection not found. Please add your OpenAI or OpenRouter API Key in Settings → Connections.".into());
    }

    // 4. OpenRouter
    if req_p == "openrouter" {
        if let Some(key) = get_connection_secret(conn, profile_id, &["openrouter"]).await {
            let mut model = if !req_m.is_empty() { req_m.to_string() } else { DEFAULT_OPENROUTER_MODEL.to_string() };
            if !model.contains('/') && !model.starts_with("openai/") && !model.starts_with("anthropic/") && !model.starts_with("google/") {
                if model.starts_with("gemini-") {
                    model = format!("google/{}", model);
                } else if model.starts_with("claude-") {
                    model = format!("anthropic/{}", model);
                } else if model.starts_with("gpt-") {
                    model = format!("openai/{}", model);
                }
            }
            return Ok(ResolvedProvider::OpenAICompatible {
                api_key: key,
                base_url: "https://openrouter.ai/api/v1/chat/completions".into(),
                model,
                is_openrouter: true,
            });
        }
        return Err("OpenRouter connection not found. Please add your OpenRouter API Key in Settings → Connections.".into());
    }

    // 5. Groq
    if req_p == "groq" {
        if let Some(key) = get_connection_secret(conn, profile_id, &["groq"]).await {
            let raw_model = if !req_m.is_empty() { req_m } else { "openai/gpt-oss-120b" };
            let model = raw_model.strip_prefix("groq/").unwrap_or(raw_model).to_string();
            return Ok(ResolvedProvider::OpenAICompatible {
                api_key: key,
                base_url: "https://api.groq.com/openai/v1/chat/completions".into(),
                model,
                is_openrouter: false,
            });
        }
        if let Some(key) = get_connection_secret(conn, profile_id, &["openrouter"]).await {
            let model = if !req_m.is_empty() { req_m.to_string() } else { "openai/gpt-oss-120b".to_string() };
            return Ok(ResolvedProvider::OpenAICompatible {
                api_key: key,
                base_url: "https://openrouter.ai/api/v1/chat/completions".into(),
                model,
                is_openrouter: true,
            });
        }
        return Err("Groq connection not found. Please add your Groq or OpenRouter API Key in Settings → Connections.".into());
    }

    // 6. SpaceXAI / xAI / Grok
    if req_p == "xai" || req_p == "grok" || req_p == "spacexai" {
        if let Some(key) = get_connection_secret(conn, profile_id, &["xai", "grok", "spacexai"]).await {
            let raw_model = if !req_m.is_empty() { req_m } else { "grok-4.3" };
            let model = raw_model.strip_prefix("x-ai/").or_else(|| raw_model.strip_prefix("xai/")).unwrap_or(raw_model).to_string();
            return Ok(ResolvedProvider::OpenAICompatible {
                api_key: key,
                base_url: "https://api.x.ai/v1/chat/completions".into(),
                model,
                is_openrouter: false,
            });
        }
        if let Some(key) = get_connection_secret(conn, profile_id, &["openrouter"]).await {
            let mut model = if !req_m.is_empty() { req_m.to_string() } else { "x-ai/grok-4.3".to_string() };
            if !model.contains('/') { model = format!("x-ai/{}", model); }
            return Ok(ResolvedProvider::OpenAICompatible {
                api_key: key,
                base_url: "https://openrouter.ai/api/v1/chat/completions".into(),
                model,
                is_openrouter: true,
            });
        }
        return Err("SpaceXAI / Grok connection not found. Please add your xAI or OpenRouter API Key in Settings → Connections.".into());
    }

    // 7. DeepSeek
    if req_p == "deepseek" {
        if let Some(key) = get_connection_secret(conn, profile_id, &["deepseek"]).await {
            let raw_model = if !req_m.is_empty() { req_m } else { "deepseek-chat" };
            let model = raw_model.strip_prefix("deepseek/").unwrap_or(raw_model).to_string();
            return Ok(ResolvedProvider::OpenAICompatible {
                api_key: key,
                base_url: "https://api.deepseek.com/chat/completions".into(),
                model,
                is_openrouter: false,
            });
        }
        if let Some(key) = get_connection_secret(conn, profile_id, &["openrouter"]).await {
            let mut model = if !req_m.is_empty() { req_m.to_string() } else { "deepseek/deepseek-chat".to_string() };
            if !model.contains('/') { model = format!("deepseek/{}", model); }
            return Ok(ResolvedProvider::OpenAICompatible {
                api_key: key,
                base_url: "https://openrouter.ai/api/v1/chat/completions".into(),
                model,
                is_openrouter: true,
            });
        }
        return Err("DeepSeek connection not found. Please add your DeepSeek or OpenRouter API Key in Settings → Connections.".into());
    }

    // 8. Mistral
    if req_p == "mistral" {
        if let Some(key) = get_connection_secret(conn, profile_id, &["mistral", "mistralai"]).await {
            let raw_model = if !req_m.is_empty() { req_m } else { "mistralai/mistral-small-4" };
            let model = raw_model.strip_prefix("mistralai/").or_else(|| raw_model.strip_prefix("mistral/")).unwrap_or(raw_model).to_string();
            return Ok(ResolvedProvider::OpenAICompatible {
                api_key: key,
                base_url: "https://api.mistral.ai/v1/chat/completions".into(),
                model,
                is_openrouter: false,
            });
        }
        if let Some(key) = get_connection_secret(conn, profile_id, &["openrouter"]).await {
            let mut model = if !req_m.is_empty() { req_m.to_string() } else { "mistralai/mistral-small-4".to_string() };
            if !model.contains('/') { model = format!("mistralai/{}", model); }
            return Ok(ResolvedProvider::OpenAICompatible {
                api_key: key,
                base_url: "https://openrouter.ai/api/v1/chat/completions".into(),
                model,
                is_openrouter: true,
            });
        }
        return Err("Mistral connection not found. Please add your Mistral or OpenRouter API Key in Settings → Connections.".into());
    }

    // 9. Auto / fallback: check Gemini connection first, then OpenRouter, Anthropic, OpenAI, Groq, SpaceXAI/Grok, DeepSeek, Mistral
    // 9a. Google Gemini (Primary / Default)
    if let Some(key) = get_connection_secret(conn, profile_id, &["gemini", "google", "google_ai", "googleai"]).await {
        let raw_model = if !req_m.is_empty() { req_m } else { "gemini-3.1-flash-lite" };
        let model = raw_model.strip_prefix("google/").unwrap_or(raw_model).to_string();
        return Ok(ResolvedProvider::OpenAICompatible {
            api_key: key,
            base_url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions".into(),
            model,
            is_openrouter: false,
        });
    }

    // 9b. OpenRouter
    if let Some(key) = get_connection_secret(conn, profile_id, &["openrouter"]).await {
        let mut model = if !req_m.is_empty() { req_m.to_string() } else { DEFAULT_OPENROUTER_MODEL.to_string() };
        if !model.contains('/') && !model.starts_with("openai/") && !model.starts_with("anthropic/") && !model.starts_with("google/") && !model.starts_with("mistralai/") && !model.starts_with("x-ai/") && !model.starts_with("deepseek/") {
            if model.starts_with("gemini-") {
                model = format!("google/{}", model);
            } else if model.starts_with("claude-") {
                model = format!("anthropic/{}", model);
            } else if model.starts_with("gpt-") {
                model = format!("openai/{}", model);
            } else if model.starts_with("grok-") {
                model = format!("x-ai/{}", model);
            } else if model.starts_with("mistral-") {
                model = format!("mistralai/{}", model);
            } else if model.starts_with("deepseek-") {
                model = format!("deepseek/{}", model);
            }
        }
        return Ok(ResolvedProvider::OpenAICompatible {
            api_key: key,
            base_url: "https://openrouter.ai/api/v1/chat/completions".into(),
            model,
            is_openrouter: true,
        });
    }

    // 9c. Anthropic
    if let Some(key) = get_connection_secret(conn, profile_id, &["anthropic", "claude"]).await {
        let raw_model = if !req_m.is_empty() { req_m } else { DEFAULT_ANTHROPIC_MODEL };
        let model = raw_model.strip_prefix("anthropic/").unwrap_or(raw_model).to_string();
        return Ok(ResolvedProvider::Anthropic { api_key: key, model });
    }

    // 9d. OpenAI
    if let Some(key) = get_connection_secret(conn, profile_id, &["openai"]).await {
        let raw_model = if !req_m.is_empty() { req_m } else { "gpt-4o-mini" };
        let model = raw_model.strip_prefix("openai/").unwrap_or(raw_model).to_string();
        return Ok(ResolvedProvider::OpenAICompatible {
            api_key: key,
            base_url: "https://api.openai.com/v1/chat/completions".into(),
            model,
            is_openrouter: false,
        });
    }

    // 9e. SpaceXAI / Grok
    if let Some(key) = get_connection_secret(conn, profile_id, &["xai", "grok", "spacexai"]).await {
        let raw_model = if !req_m.is_empty() { req_m } else { "grok-4.3" };
        let model = raw_model.strip_prefix("x-ai/").or_else(|| raw_model.strip_prefix("xai/")).unwrap_or(raw_model).to_string();
        return Ok(ResolvedProvider::OpenAICompatible {
            api_key: key,
            base_url: "https://api.x.ai/v1/chat/completions".into(),
            model,
            is_openrouter: false,
        });
    }

    // 9f. DeepSeek
    if let Some(key) = get_connection_secret(conn, profile_id, &["deepseek"]).await {
        let raw_model = if !req_m.is_empty() { req_m } else { "deepseek-chat" };
        let model = raw_model.strip_prefix("deepseek/").unwrap_or(raw_model).to_string();
        return Ok(ResolvedProvider::OpenAICompatible {
            api_key: key,
            base_url: "https://api.deepseek.com/chat/completions".into(),
            model,
            is_openrouter: false,
        });
    }

    // 9g. Groq
    if let Some(key) = get_connection_secret(conn, profile_id, &["groq"]).await {
        let raw_model = if !req_m.is_empty() { req_m } else { "openai/gpt-oss-120b" };
        let model = raw_model.strip_prefix("groq/").unwrap_or(raw_model).to_string();
        return Ok(ResolvedProvider::OpenAICompatible {
            api_key: key,
            base_url: "https://api.groq.com/openai/v1/chat/completions".into(),
            model,
            is_openrouter: false,
        });
    }

    // 9h. Mistral
    if let Some(key) = get_connection_secret(conn, profile_id, &["mistral", "mistralai"]).await {
        let raw_model = if !req_m.is_empty() { req_m } else { "mistralai/mistral-small-4" };
        let model = raw_model.strip_prefix("mistralai/").or_else(|| raw_model.strip_prefix("mistral/")).unwrap_or(raw_model).to_string();
        return Ok(ResolvedProvider::OpenAICompatible {
            api_key: key,
            base_url: "https://api.mistral.ai/v1/chat/completions".into(),
            model,
            is_openrouter: false,
        });
    }

    Err(
        "No active AI connection found in your settings. Please add your API Key in Settings → Connections to enable the Autonomous Assistant."
            .to_string(),
    )
}

// ── System Prompt Builder ──────────────────────────────────────────────────────

pub(crate) async fn build_system_prompt(conn: &crate::db::turso::TursoConn, profile_id: &str) -> String {
    // 1. Pull Active Logged-in User (Owner / Operator)
    let mut active_user_display: Option<String> = None;
    if let Ok(mut rows) = conn
        .query(
            "SELECT first_name, last_name, username, email FROM users WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1",
            crate::turso_params![],
        )
        .await
    {
        if let Ok(Some(row)) = rows.next().await {
            let fn_opt: Option<String> = row.get(0).unwrap_or(None);
            let ln_opt: Option<String> = row.get(1).unwrap_or(None);
            let un_opt: Option<String> = row.get(2).unwrap_or(None);
            let em_opt: Option<String> = row.get(3).unwrap_or(None);

            let full_name = match (fn_opt, ln_opt) {
                (Some(f), Some(l)) if !f.trim().is_empty() && !l.trim().is_empty() => format!("{} {}", f.trim(), l.trim()),
                (Some(f), _) if !f.trim().is_empty() => f.trim().to_string(),
                (_, Some(l)) if !l.trim().is_empty() => l.trim().to_string(),
                _ => un_opt.unwrap_or_else(|| em_opt.unwrap_or_default()),
            };
            if !full_name.trim().is_empty() {
                active_user_display = Some(full_name.trim().to_string());
            }
        }
    }

    // 2. Pull Live Settings & Business Context
    let mut settings_title: Option<String> = None;
    let mut settings_industry: Option<String> = None;
    let mut settings_country: Option<String> = None;
    let mut settings_currency: Option<String> = None;
    let mut settings_location: Option<String> = None;

    if let Ok(mut rows) = conn
        .query(
            "SELECT site_title, industry, country, currency, location FROM settings WHERE profile_id = ?1 LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
    {
        if let Ok(Some(row)) = rows.next().await {
            settings_title = row.get(0).unwrap_or(None);
            settings_industry = row.get(1).unwrap_or(None);
            settings_country = row.get(2).unwrap_or(None);
            settings_currency = row.get(3).unwrap_or(None);
            settings_location = row.get(4).unwrap_or(None);
        }
    }

    // 3. Pull Live Tax & Compliance Configuration
    let mut tax_regime: Option<String> = None;
    let mut tax_country: Option<String> = None;
    let mut tax_currency: Option<String> = None;
    let mut tax_legal_name: Option<String> = None;
    let mut tax_gstin: Option<String> = None;
    let mut tax_state_code: Option<String> = None;
    let mut tax_postal_code: Option<String> = None;
    let mut tax_mode: Option<String> = None;
    let mut tax_inclusive: Option<i64> = None;

    if let Ok(mut rows) = conn
        .query(
            "SELECT regime, country, currency, legal_name, gstin, state_code, postal_code, tax_mode, tax_inclusive FROM fin_tax_configs WHERE profile_id = ?1 LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
    {
        if let Ok(Some(row)) = rows.next().await {
            tax_regime = row.get(0).unwrap_or(None);
            tax_country = row.get(1).unwrap_or(None);
            tax_currency = row.get(2).unwrap_or(None);
            tax_legal_name = row.get(3).unwrap_or(None);
            tax_gstin = row.get(4).unwrap_or(None);
            tax_state_code = row.get(5).unwrap_or(None);
            tax_postal_code = row.get(6).unwrap_or(None);
            tax_mode = row.get(7).unwrap_or(None);
            tax_inclusive = row.get(8).unwrap_or(None);
        }
    }

    // 4. Pull Active Staff Members
    let mut staff_list = Vec::new();
    let mut active_staff_display: Option<String> = None;
    if let Ok(mut rows) = conn
        .query(
            "SELECT first_name, last_name, display_name, name, role FROM shop_staff WHERE profile_id = ?1 AND is_active = 1 ORDER BY created_at ASC LIMIT 10",
            crate::turso_params![profile_id],
        )
        .await
    {
        while let Ok(Some(row)) = rows.next().await {
            let fn_opt: Option<String> = row.get(0).unwrap_or(None);
            let ln_opt: Option<String> = row.get(1).unwrap_or(None);
            let dn_opt: Option<String> = row.get(2).unwrap_or(None);
            let name_str: String = row.get(3).unwrap_or_default();
            let role: String = row.get(4).unwrap_or_else(|_| "staff".to_string());

            let full_staff_name = match (fn_opt, ln_opt) {
                (Some(f), Some(l)) if !f.trim().is_empty() && !l.trim().is_empty() => format!("{} {}", f.trim(), l.trim()),
                (Some(f), _) if !f.trim().is_empty() => f.trim().to_string(),
                (_, Some(l)) if !l.trim().is_empty() => l.trim().to_string(),
                _ => dn_opt.filter(|s| !s.trim().is_empty()).unwrap_or(name_str),
            };

            if !full_staff_name.trim().is_empty() {
                if active_staff_display.is_none() {
                    active_staff_display = Some(format!("{} ({})", full_staff_name.trim(), role));
                }
                staff_list.push(format!("{} ({})", full_staff_name.trim(), role));
            }
        }
    }

    // 5. Pull Default Catalog References
    let mut default_cat: Option<String> = None;
    if let Ok(mut rows) = conn
        .query(
            "SELECT name FROM shop_categories WHERE profile_id = ?1 AND is_active = 1 ORDER BY is_default DESC, sort_order ASC LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
    {
        if let Ok(Some(row)) = rows.next().await {
            default_cat = row.get(0).unwrap_or(None);
        }
    }

    let mut default_col: Option<String> = None;
    if let Ok(mut rows) = conn
        .query(
            "SELECT title FROM collections WHERE profile_id = ?1 AND is_active = 1 AND archived = 0 ORDER BY is_default DESC, sort_order ASC LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
    {
        if let Ok(Some(row)) = rows.next().await {
            default_col = row.get(0).unwrap_or(None);
        }
    }

    let mut default_unit: Option<String> = None;
    if let Ok(mut rows) = conn
        .query(
            "SELECT name, symbol FROM shop_units WHERE profile_id = ?1 AND is_active = 1 ORDER BY is_default DESC LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
    {
        if let Ok(Some(row)) = rows.next().await {
            let u_name: Option<String> = row.get(0).unwrap_or(None);
            let u_sym: Option<String> = row.get(1).unwrap_or(None);
            default_unit = match (u_name, u_sym) {
                (Some(n), Some(s)) => Some(format!("{} ({})", n, s)),
                (Some(n), None) => Some(n),
                (None, Some(s)) => Some(s),
                (None, None) => None,
            };
        }
    }

    let user_name_str = active_user_display.as_deref().unwrap_or("the Business Owner");
    let business_name_str = settings_title.as_deref().or(tax_legal_name.as_deref()).unwrap_or("the Business");

    let mut prompt = format!(
        "You are the BusinessKit Autonomous Assistant, dedicated specifically to assisting {user_name_str} in managing {business_name_str}. You have direct access to execute business operations, catalog management, inventory restocks, invoices, CRM, and content on their behalf.\n\
         - PERSONAL RECOGNITION & IDENTITY:\n\
           * You know {user_name_str} personally as the owner/operator of {business_name_str}.\n\
           * When the user greets you or asks 'who am I?', 'do you know me?', or 'what is my shop?', warmly recognize them directly by name ({user_name_str}), acknowledge their store ({business_name_str}), their industry, and active location.\n\
           * NEVER give generic AI privacy disclaimers like 'I don't have access to your personal identity or browsing history' or 'As an AI I don't know who you are'. You ARE their dedicated in-app business copilot with direct access to this workspace.\n\
         - INVOICE RESTOCKING & PURCHASE PROCESSING:\n\
           * When the user provides a purchase invoice, bill, receipt, restock shipment, or vendor invoice (e.g. from Apple, distributors, pharmaceutical suppliers), ALWAYS call `inventory_receive_purchase_invoice` so that it is properly recorded as a Purchase (Goods Receipt) with the vendor name, invoice number, unit costs, trade discounts (`discount`, `discount2`), schemes (`scheme_on`, `scheme_free`, `free_qty`), taxes, batches, and logged in the stock ledger with movement_type 'purchase'.\n\
           * Missing products are automatically created in `shop_items` with full schema awareness and clean 10-character uppercase alphanumeric SKUs (e.g. '7PKFJ7I5ND', without any 'SKU-' prefix).\n\
         - PRICING, MARKUP & DISCOUNT TEMPLATES:\n\
           * `shop_items.cost_price`: Inward purchase/landing cost per unit.\n\
           * `shop_items.price`: Outward selling price in storefront and POS billing.\n\
           * When the user specifies markup or discounts in `/add-inventory-from-invoice` (e.g. 'Selling Price (Rate) = Cost + 20%', 'Discount = 5%'):\n\
             - If a markup % is filled in (e.g. 'Cost + 20%'), calculate the selling price for new products using `default_markup_pct = 20`.\n\
             - If a customer discount is filled in (e.g. 'Discount = 5%'), apply customer discount to created products.\n\
             - If the user leaves placeholder template lines like 'Selling Price (Rate) = Cost + % ?' or 'Discount = % ?' unfilled, ignore the placeholder lines gracefully and proceed with standard invoice calculations without errors or extra questions.\n\
         - INVENTORY TRACKING & STOCK INTEGRITY:\n\
           * `shop_items.track_inventory = 1` is always set for physical goods, purchase invoices, and restocks so stock ledger balances and warehouse levels remain accurate.\n\
         - CATEGORY, COLLECTION & UNIT INTELLIGENCE:\n\
           * Use intelligence to assign the most fitting category (`shop_category_id`), collection (`collection_id`), and unit of measurement (`unit_id` e.g. PCS, KG, BOX, STRIP, BTL, PACK) based on item title, description, and packaging.\n\
           * If no specific category/collection/unit is detected or specified, fall back to the user's default category (`shop_categories.is_default`), default collection (`collections.is_default`), and default unit (`shop_units.is_default`).\n\
         - DUAL-LAYER NOTES & AGENT SELF-LEARNING MEMORY:\n\
           * `notes`: User-facing instructions and notes created by the human user (e.g. storage rules, handling constraints, customer requests). Always read and respect `notes`.\n\
           * `agent_notes`: Internal agent operational memory (written/updated by agents). Use `agent_notes` to record, retain, and build upon learnings:\n\
             - Supplier invoice aliases, OCR misspellings, and discount patterns on `shop_vendors` and `shop_items`.\n\
             - Calibrated pricing benchmarks, packaging specs, and margin trends on `shop_items`.\n\
             - Invoice audit observations and payment reconciliation details on `shop_documents`.\n\
             - Customer ordering tendencies, preferred channels, and billing preferences on `shop_customers`.\n\
             - Contact follow-up timing and outreach communication insights on `crm_contacts`.\n\
           Always consult existing `agent_notes` and update them with concise learnings so future turns operate with greater accuracy.\n\
         - Use `product_update_pricing` for standalone price, markup %, cost, MRP, or discount changes on existing catalog items.\n\
         - Use `inventory_add_stock` for manual inventory count adjustments, shrinkage, damages, or quick manual corrections.\n\
         - Use `inventory_get_levels` to check current stock levels across products.\n\
         - Use `invoice_create` and `invoice_send` for sales billing.\n\
         - Use `contact_create` and `contact_update` for CRM.\n\
         - Use `blog_post_create` for drafting or publishing content.\n\
         Keep explanations concise, friendly, and professional.\n\n\
         === SLASH COMMAND MAPPINGS ===\n\
         When the user's message starts with or includes a slash command, immediately execute the corresponding tool:\n\
         - `/add-inventory-from-invoice [invoice text/details]`: Parse all items, quantities, free quantities, scheme criteria (`scheme_on`, `scheme_free`), rates, trade discounts (`discount`, `discount2`), tax rates (`tax`, `tax_code`), batch numbers, MRP, selling price / markup %, vendor name, invoice #, and execute `inventory_receive_purchase_invoice`.\n\
         - `/update-price [sku and price/markup]`: Execute `product_update_pricing` to update selling price, cost price, markup %, or MRP.\n\
         - `/check-stock [optional item/category]`: Execute `inventory_get_levels` to check quantities on hand.\n\
         - `/adjust-stock [sku and delta]`: Execute `inventory_add_stock` to add/remove quantity.\n\
         - `/create-invoice [customer and items]`: Execute `invoice_create` to draft a customer invoice.\n\
         - `/send-invoice [invoice_id]`: Execute `invoice_send` to issue an invoice.\n\
         - `/add-contact [contact info]`: Execute `contact_create` to register a lead/contact.\n\
         - `/update-contact [contact_id and fields]`: Execute `contact_update`.\n\
         - `/draft-post [title and brief]` or `/publish-page`: Execute `blog_post_create`.\n\
         ==============================\n\n"
    );

    // Inject Business Profile Context Block
    prompt.push_str("=== LIVE BUSINESS PROFILE & CONFIGURATION ===\n");
    if let Some(name) = settings_title.as_deref().or(tax_legal_name.as_deref()).filter(|s| !s.trim().is_empty()) {
        prompt.push_str(&format!("- Business / Store Name: {}\n", name));
    }
    if let Some(ind) = settings_industry.as_deref().filter(|s| !s.trim().is_empty()) {
        prompt.push_str(&format!("- Industry: {}\n", ind));
    }
    if let Some(cntry) = tax_country.as_deref().or(settings_country.as_deref()).filter(|s| !s.trim().is_empty()) {
        prompt.push_str(&format!("- Country: {}\n", cntry));
    }
    let effective_currency = tax_currency.as_deref().or(settings_currency.as_deref()).unwrap_or("USD");
    prompt.push_str(&format!("- Base Currency: {}\n", effective_currency));

    if let Some(reg) = tax_regime.as_deref().filter(|s| !s.trim().is_empty()) {
        let mut tax_desc = format!("- Tax Regime: {}", reg);
        if let Some(gst) = tax_gstin.as_deref().filter(|s| !s.trim().is_empty()) {
            tax_desc.push_str(&format!(" | Tax/GSTIN ID: {}", gst));
        }
        if let Some(sc) = tax_state_code.as_deref().filter(|s| !s.trim().is_empty()) {
            tax_desc.push_str(&format!(" | State: {}", sc));
        }
        if let Some(pc) = tax_postal_code.as_deref().filter(|s| !s.trim().is_empty()) {
            tax_desc.push_str(&format!(" | PIN/ZIP: {}", pc));
        }
        tax_desc.push('\n');
        prompt.push_str(&tax_desc);
    }
    if let Some(tm) = tax_mode.as_deref() {
        let inc_str = if tax_inclusive.unwrap_or(0) == 1 { "Prices are Tax-Inclusive (MRP)" } else { "Tax added at checkout" };
        prompt.push_str(&format!("- Tax Calculation Mode: {} ({})\n", tm, inc_str));
    }
    if let Some(loc) = settings_location.as_deref().filter(|s| !s.trim().is_empty()) {
        prompt.push_str(&format!("- Location: {}\n", loc));
    }
    if let Some(user) = active_user_display.as_deref() {
        prompt.push_str(&format!("- Logged-in User / Owner: {}\n", user));
    }
    if let Some(staff) = active_staff_display.as_deref() {
        prompt.push_str(&format!("- Active Staff / Operator: {}\n", staff));
    }
    if !staff_list.is_empty() {
        prompt.push_str(&format!("- Team / Staff: {}\n", staff_list.join(", ")));
    }
    let cat_str = default_cat.unwrap_or_else(|| "General".to_string());
    let col_str = default_col.unwrap_or_else(|| "All Products".to_string());
    let unit_str = default_unit.unwrap_or_else(|| "Units (pcs)".to_string());
    prompt.push_str(&format!("- Catalog Defaults: Default Category = '{}', Default Collection = '{}', Default Unit = '{}'\n", cat_str, col_str, unit_str));
    prompt.push_str("=============================================\n\n");

    // Pull brand foundation from UserDB
    if let Ok(mut rows) = conn
        .query(
            "SELECT about_me, brand_voice, working_style, business_goals \
             FROM brand_foundation WHERE profile_id = ?1 LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
    {
        if let Ok(Some(row)) = rows.next().await {
            let about_me: Option<String> = row.get(0).unwrap_or(None);
            let brand_voice: Option<String> = row.get(1).unwrap_or(None);
            let working_style: Option<String> = row.get(2).unwrap_or(None);
            let business_goals: Option<String> = row.get(3).unwrap_or(None);

            prompt.push_str("=== BRAND FOUNDATION & CONTEXT ===\n");
            if let Some(v) = about_me.filter(|s| !s.trim().is_empty()) {
                prompt.push_str(&format!("About the business / founder: {}\n", v));
            }
            if let Some(v) = brand_voice.filter(|s| !s.trim().is_empty()) {
                prompt.push_str(&format!("Brand Voice & Tone: {}\n", v));
            }
            if let Some(v) = working_style.filter(|s| !s.trim().is_empty()) {
                prompt.push_str(&format!("Working Style / Preferences: {}\n", v));
            }
            if let Some(v) = business_goals.filter(|s| !s.trim().is_empty()) {
                prompt.push_str(&format!("Current Business Goals: {}\n", v));
            }
            prompt.push_str("==================================\n\n");
        }
    }

    prompt.push_str(
        "=== CRITICAL DATA INTEGRITY & SAFETY RULE ===\n\
         You must NEVER permanently delete database rows or records under any circumstances, even if the user explicitly asks to 'delete' or 'remove' an item.\n\
         Instead, you must ALWAYS perform soft-archiving using the exact schema flags:\n\
         - shop_items / products: archived = 1, is_active = 0, published = 0, archived_at = strftime('%s','now')\n\
         - crm_contacts: status = 'archived'\n\
         - content / pages / forms: archived = 1, published = 0\n\
         Physical deletion of business data via DELETE FROM is strictly forbidden.\n\
         ==============================================\n\n"
    );

    prompt
}

// ── Tools Formatting ───────────────────────────────────────────────────────────

fn get_anthropic_tools(tools_list: &[tools::ToolSpec]) -> Vec<Value> {
    tools_list
        .iter()
        .map(|t| {
            json!({
                "name": t.name,
                "description": t.description,
                "input_schema": t.input_schema
            })
        })
        .collect()
}

fn get_openai_tools(tools_list: &[tools::ToolSpec]) -> Vec<Value> {
    tools_list
        .iter()
        .map(|t| {
            json!({
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.input_schema
                }
            })
        })
        .collect()
}

// ── Turn & SSE Stream Processor ────────────────────────────────────────────────

struct TurnResult {
    assistant_text: String,
    tool_use_blocks: Vec<ToolUseBlock>,
    extra_content: Option<Value>,
}

struct ToolUseBlock {
    id: String,
    name: String,
    input: Value,
}

// ── OpenAI-Compatible SSE Streaming Turn (OpenRouter, Gemini, OpenAI, DeepSeek, Groq) ───────

async fn run_openai_compatible_turn(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    is_openrouter: bool,
    reasoning_effort: Option<&str>,
    system_prompt: &str,
    messages: &[Value],
    tools_list: &[tools::ToolSpec],
    app: &AppHandle,
    request_id: &str,
    session_id: &str,
    cancel_flag: &AtomicBool,
) -> Result<TurnResult, String> {
    let mut api_messages = vec![json!({
        "role": "system",
        "content": system_prompt
    })];
    api_messages.extend_from_slice(messages);

    let tools_json = get_openai_tools(tools_list);
    let mut req_body_map = serde_json::Map::new();
    req_body_map.insert("model".into(), json!(model));
    req_body_map.insert("messages".into(), json!(api_messages));
    req_body_map.insert("stream".into(), json!(true));
    if !tools_json.is_empty() {
        req_body_map.insert("tools".into(), json!(tools_json));
    }

    if let Some(effort) = reasoning_effort {
        let eff_trim = effort.trim().to_lowercase();
        if !eff_trim.is_empty() && eff_trim != "off" && eff_trim != "auto" {
            let effort_val = match eff_trim.as_str() {
                "fast" => "low",
                "extra" | "max" => "high",
                other => other,
            };
            req_body_map.insert("reasoning_effort".into(), json!(effort_val));
            if is_openrouter {
                req_body_map.insert("reasoning".into(), json!({ "effort": effort_val }));
            }
        }
    }

    let req_body = Value::Object(req_body_map);

    let mut req = client
        .post(base_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json");

    if base_url.contains("generativelanguage.googleapis.com") {
        req = req.header("x-goog-api-key", api_key);
    }

    if is_openrouter {
        req = req
            .header("HTTP-Referer", "https://businesskit.io")
            .header("X-Title", "BusinessKit AI");
    }

    let resp = req
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("AI Provider request failed: {e}"))?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_else(|_| "Unknown error".into());
        return Err(format!("AI Provider API error: {err_text}"));
    }

    let mut resp = resp;
    let mut buffer = String::new();

    let mut assistant_text = String::new();
    let mut extra_content: Option<Value> = None;
    // Map tool_call index -> (id, name, accumulated_args)
    let mut tool_calls_map: HashMap<usize, (String, String, String)> = HashMap::new();

    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("Stream error: {e}"))? {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Chat cancelled by user".to_string());
        }

        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.starts_with("data: ") {
                let json_str = &line[6..].trim();
                if *json_str == "[DONE]" {
                    break;
                }

                if let Ok(event) = serde_json::from_str::<Value>(json_str) {
                    if let Some(ec) = event.get("extra_content") {
                        extra_content = Some(ec.clone());
                    }

                    if let Some(choices) = event.get("choices").and_then(Value::as_array) {
                        if let Some(choice) = choices.first() {
                            if let Some(ec) = choice.get("extra_content") {
                                extra_content = Some(ec.clone());
                            }

                            if let Some(delta) = choice.get("delta") {
                                if let Some(ec) = delta.get("extra_content") {
                                    extra_content = Some(ec.clone());
                                }

                                // 1. Text token delta
                                if let Some(t) = delta.get("content").and_then(Value::as_str) {
                                    if !t.is_empty() {
                                        assistant_text.push_str(t);
                                        let _ = app.emit(
                                            "chat-token",
                                            TokenEvent {
                                                request_id: request_id.to_string(),
                                                session_id: session_id.to_string(),
                                                token: t.to_string(),
                                            },
                                        );
                                    }
                                }

                                // 2. Tool calls delta
                                if let Some(tools_arr) = delta.get("tool_calls").and_then(Value::as_array) {
                                    for tc in tools_arr {
                                        let idx = tc.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                                        let entry = tool_calls_map.entry(idx).or_insert_with(|| (
                                            format!("call_{}", Uuid::new_v4().to_string().replace('-', "")[..10].to_string()),
                                            String::new(),
                                            String::new(),
                                        ));

                                        if let Some(id) = tc.get("id").and_then(Value::as_str) {
                                            if !id.is_empty() {
                                                entry.0 = id.to_string();
                                            }
                                        }

                                        if let Some(ec) = tc.get("extra_content") {
                                            extra_content = Some(ec.clone());
                                        }

                                        if let Some(func) = tc.get("function") {
                                            if let Some(name) = func.get("name").and_then(Value::as_str) {
                                                if !name.is_empty() {
                                                    entry.1 = name.to_string();
                                                }
                                            }
                                            if let Some(args_chunk) = func.get("arguments").and_then(Value::as_str) {
                                                entry.2.push_str(args_chunk);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut tool_use_blocks = Vec::new();
    let mut indices: Vec<usize> = tool_calls_map.keys().cloned().collect();
    indices.sort();

    for idx in indices {
        if let Some((id, name, args_str)) = tool_calls_map.remove(&idx) {
            if !name.is_empty() {
                let parsed_input: Value = serde_json::from_str(&args_str).unwrap_or(json!({}));
                tool_use_blocks.push(ToolUseBlock {
                    id,
                    name,
                    input: parsed_input,
                });
            }
        }
    }

    Ok(TurnResult {
        assistant_text,
        tool_use_blocks,
        extra_content,
    })
}

// ── Anthropic SSE Streaming Turn ───────────────────────────────────────────────

async fn run_anthropic_turn(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    reasoning_effort: Option<&str>,
    system_prompt: &str,
    messages: &[Value],
    tools_list: &[tools::ToolSpec],
    app: &AppHandle,
    request_id: &str,
    session_id: &str,
    cancel_flag: &AtomicBool,
) -> Result<TurnResult, String> {
    let tools_json = get_anthropic_tools(tools_list);
    let mut req_body_map = serde_json::Map::new();
    req_body_map.insert("model".into(), json!(model));
    req_body_map.insert("max_tokens".into(), json!(4096));
    req_body_map.insert("system".into(), json!(system_prompt));
    req_body_map.insert("messages".into(), json!(messages));
    req_body_map.insert("stream".into(), json!(true));
    if !tools_json.is_empty() {
        req_body_map.insert("tools".into(), json!(tools_json));
    }

    if let Some(effort) = reasoning_effort {
        let eff_trim = effort.trim().to_lowercase();
        if !eff_trim.is_empty() && eff_trim != "off" && eff_trim != "auto" {
            let budget = match eff_trim.as_str() {
                "low" | "fast" => 2048,
                "medium" => 8192,
                "high" => 16384,
                "extra" => 32768,
                "max" => 64000,
                _ => 2048,
            };
            req_body_map.insert("thinking".into(), json!({
                "type": "enabled",
                "budget_tokens": budget
            }));
            req_body_map.insert("max_tokens".into(), json!(budget + 4096));
        }
    }

    let req_body = Value::Object(req_body_map);

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("Anthropic request failed: {e}"))?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_else(|_| "Unknown error".into());
        return Err(format!("Anthropic API error: {err_text}"));
    }

    let mut resp = resp;
    let mut buffer = String::new();

    let mut assistant_text = String::new();
    let mut current_block_type = String::new();
    let mut current_tool_id = String::new();
    let mut current_tool_name = String::new();
    let mut current_tool_json = String::new();
    let mut tool_use_blocks = Vec::new();

    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("Stream error: {e}"))? {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Chat cancelled by user".to_string());
        }

        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.starts_with("data: ") {
                let json_str = &line[6..].trim();
                if *json_str == "[DONE]" {
                    break;
                }

                if let Ok(event) = serde_json::from_str::<Value>(json_str) {
                    let event_type = event.get("type").and_then(Value::as_str).unwrap_or("");

                    match event_type {
                        "content_block_start" => {
                            if let Some(cb) = event.get("content_block") {
                                current_block_type = cb.get("type").and_then(Value::as_str).unwrap_or("").to_string();
                                if current_block_type == "tool_use" {
                                    current_tool_id = cb.get("id").and_then(Value::as_str).unwrap_or("").to_string();
                                    current_tool_name = cb.get("name").and_then(Value::as_str).unwrap_or("").to_string();
                                    current_tool_json.clear();
                                }
                            }
                        }
                        "content_block_delta" => {
                            if let Some(delta) = event.get("delta") {
                                let delta_type = delta.get("type").and_then(Value::as_str).unwrap_or("");
                                if delta_type == "text_delta" {
                                    if let Some(t) = delta.get("text").and_then(Value::as_str) {
                                        assistant_text.push_str(t);
                                        let _ = app.emit(
                                            "chat-token",
                                            TokenEvent {
                                                request_id: request_id.to_string(),
                                                session_id: session_id.to_string(),
                                                token: t.to_string(),
                                            },
                                        );
                                    }
                                } else if delta_type == "input_json_delta" {
                                    if let Some(p) = delta.get("partial_json").and_then(Value::as_str) {
                                        current_tool_json.push_str(p);
                                    }
                                }
                            }
                        }
                        "content_block_stop" => {
                            if current_block_type == "tool_use" {
                                let parsed_input: Value = serde_json::from_str(&current_tool_json)
                                    .unwrap_or(json!({}));
                                tool_use_blocks.push(ToolUseBlock {
                                    id: current_tool_id.clone(),
                                    name: current_tool_name.clone(),
                                    input: parsed_input,
                                });
                            }
                            current_block_type.clear();
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    Ok(TurnResult {
        assistant_text,
        tool_use_blocks,
        extra_content: None,
    })
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_chat_session(
    title: Option<String>,
    user_id: Option<String>,
    staff_id: Option<String>,
    model: Option<String>,
    provider: Option<String>,
    domain: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<ChatSession, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let session_id = format!("sess_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    let session_title = title.unwrap_or_else(|| "New Conversation".to_string());

    let mut eff_staff_id = staff_id;
    let mut eff_user_id = user_id;

    if eff_staff_id.is_none() && eff_user_id.is_none() {
        if let Ok(mut rows) = conn
            .query(
                "SELECT id FROM shop_staff WHERE profile_id = ?1 AND is_active = 1 ORDER BY created_at ASC LIMIT 1",
                crate::turso_params![profile_id.clone()],
            )
            .await
        {
            if let Ok(Some(row)) = rows.next().await {
                eff_staff_id = row.get(0).unwrap_or(None);
                eff_user_id = eff_staff_id.clone();
            }
        }
        if eff_user_id.is_none() {
            if let Ok(mut rows) = conn
                .query(
                    "SELECT id FROM users WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1",
                    crate::turso_params![],
                )
                .await
            {
                if let Ok(Some(row)) = rows.next().await {
                    eff_user_id = row.get(0).unwrap_or(None);
                }
            }
        }
    }

    let eff_mode = if let Some(ref p) = provider {
        if p.starts_with("cli_") || p == "cli" {
            "cli".to_string()
        } else {
            "hosted".to_string()
        }
    } else {
        "hosted".to_string()
    };

    // Reuse existing 0-message draft session if available for this profile
    if let Ok(mut check_rows) = conn
        .query(
            "SELECT id, domain FROM agent_chat_sessions WHERE profile_id = ?1 AND message_count = 0 ORDER BY updated_at DESC LIMIT 1",
            crate::turso_params![profile_id.clone()],
        )
        .await
    {
        if let Ok(Some(row)) = check_rows.next().await {
            if let Ok(existing_id) = row.get::<String>(0) {
                let existing_domain: Option<String> = row.get(1).unwrap_or(None);
                let final_domain = domain.clone().or(existing_domain);
                let _ = conn
                    .execute(
                        "UPDATE agent_chat_sessions SET title = ?1, model = ?2, provider = ?3, mode = ?4, domain = ?5, updated_at = strftime('%s','now') WHERE id = ?6",
                        crate::turso_params![session_title.clone(), model.clone(), provider.clone(), eff_mode.clone(), final_domain.clone(), existing_id.clone()],
                    )
                    .await;
                return Ok(ChatSession {
                    id: existing_id,
                    profile_id,
                    user_id: eff_user_id,
                    staff_id: eff_staff_id,
                    title: session_title,
                    model,
                    provider,
                    mode: Some(eff_mode),
                    domain: final_domain,
                    cli_resume_ref: None,
                    total_tokens: 0,
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_cost: 0.0,
                    message_count: 0,
                    tool_call_count: 0,
                    last_message_preview: None,
                    is_pinned: false,
                    is_saved: false,
                    created_at: chrono::Utc::now().timestamp(),
                    updated_at: chrono::Utc::now().timestamp(),
                });
            }
        }
    }

    conn.execute(
        "INSERT INTO agent_chat_sessions (id, profile_id, user_id, staff_id, title, model, provider, mode, domain, cli_resume_ref, total_tokens, prompt_tokens, completion_tokens, total_cost, message_count, tool_call_count, last_message_preview, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, 0, 0, 0, 0.0, 0, 0, NULL, strftime('%s','now'), strftime('%s','now'))",
        crate::turso_params![
            session_id.clone(),
            profile_id.clone(),
            eff_user_id.clone(),
            eff_staff_id.clone(),
            session_title.clone(),
            model.clone(),
            provider.clone(),
            eff_mode.clone(),
            domain.clone(),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ChatSession {
        id: session_id,
        profile_id,
        user_id: eff_user_id,
        staff_id: eff_staff_id,
        title: session_title,
        model,
        provider,
        mode: Some(eff_mode),
        domain,
        cli_resume_ref: None,
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_cost: 0.0,
        message_count: 0,
        tool_call_count: 0,
        last_message_preview: None,
        is_pinned: false,
        is_saved: false,
        created_at: chrono::Utc::now().timestamp(),
        updated_at: chrono::Utc::now().timestamp(),
    })
}

#[tauri::command]
pub async fn list_chat_sessions(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ChatSession>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Clean up abandoned 0-message sessions older than 5 minutes
    let _ = conn
        .execute(
            "DELETE FROM agent_chat_sessions WHERE profile_id = ?1 AND message_count = 0 AND created_at < (strftime('%s','now') - 300)",
            crate::turso_params![profile_id.clone()],
        )
        .await;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, user_id, staff_id, title, model, provider, COALESCE(mode, 'hosted'), domain, cli_resume_ref, total_tokens, prompt_tokens, completion_tokens, total_cost, message_count, tool_call_count, last_message_preview, COALESCE(is_pinned, 0), COALESCE(is_saved, 0), created_at, updated_at \
             FROM agent_chat_sessions WHERE profile_id = ?1 AND (message_count > 0 OR is_pinned = 1) ORDER BY is_pinned DESC, updated_at DESC LIMIT 100",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut sessions = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        sessions.push(ChatSession {
            id: row.get(0).map_err(|e| e.to_string())?,
            profile_id: row.get(1).map_err(|e| e.to_string())?,
            user_id: row.get(2).unwrap_or(None),
            staff_id: row.get(3).unwrap_or(None),
            title: row.get(4).unwrap_or_else(|_| "Conversation".into()),
            model: row.get(5).unwrap_or(None),
            provider: row.get(6).unwrap_or(None),
            mode: row.get(7).unwrap_or(Some("hosted".into())),
            domain: row.get(8).unwrap_or(None),
            cli_resume_ref: row.get(9).unwrap_or(None),
            total_tokens: row.get::<i64>(10).unwrap_or(0),
            prompt_tokens: row.get::<i64>(11).unwrap_or(0),
            completion_tokens: row.get::<i64>(12).unwrap_or(0),
            total_cost: row.get::<f64>(13).unwrap_or(0.0),
            message_count: row.get::<i64>(14).unwrap_or(0),
            tool_call_count: row.get::<i64>(15).unwrap_or(0),
            last_message_preview: row.get(16).unwrap_or(None),
            is_pinned: row.get::<i64>(17).unwrap_or(0) == 1,
            is_saved: row.get::<i64>(18).unwrap_or(0) == 1,
            created_at: row.get::<i64>(19).unwrap_or(0),
            updated_at: row.get::<i64>(20).unwrap_or(0),
        });
    }

    Ok(sessions)
}

#[tauri::command]
pub async fn rename_chat_session(
    session_id: String,
    title: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE agent_chat_sessions SET title = ?1, updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
        crate::turso_params![title.trim(), session_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn toggle_pin_chat_session(
    session_id: String,
    is_pinned: bool,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let val: i64 = if is_pinned { 1 } else { 0 };
    conn.execute(
        "UPDATE agent_chat_sessions SET is_pinned = ?1, updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
        crate::turso_params![val, session_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(is_pinned)
}

#[tauri::command]
pub async fn toggle_save_chat_session(
    session_id: String,
    is_saved: bool,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let val: i64 = if is_saved { 1 } else { 0 };
    conn.execute(
        "UPDATE agent_chat_sessions SET is_saved = ?1, updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
        crate::turso_params![val, session_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(is_saved)
}

#[tauri::command]
pub async fn delete_chat_session(
    session_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM agent_chat_messages WHERE session_id = ?1",
        crate::turso_params![session_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM agent_chat_sessions WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![session_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_chat_history(
    session_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ChatMessage>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Verify session belongs to active profile
    let mut check_rows = conn
        .query(
            "SELECT id FROM agent_chat_sessions WHERE id = ?1 AND profile_id = ?2",
            crate::turso_params![session_id.clone(), profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if check_rows.next().await.map_err(|e| e.to_string())?.is_none() {
        return Err("Chat session not found".into());
    }

    let mut rows = conn
        .query(
            "SELECT id, session_id, role, content, tool_calls_json, created_at \
             FROM agent_chat_messages WHERE session_id = ?1 ORDER BY created_at ASC",
            crate::turso_params![session_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut messages = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        messages.push(ChatMessage {
            id: row.get(0).map_err(|e| e.to_string())?,
            session_id: row.get(1).map_err(|e| e.to_string())?,
            role: row.get(2).map_err(|e| e.to_string())?,
            content: row.get(3).unwrap_or_default(),
            tool_calls_json: row.get(4).unwrap_or(None),
            created_at: row.get::<i64>(5).unwrap_or(0),
        });
    }

    Ok(messages)
}

#[tauri::command]
pub async fn stop_chat_session(
    request_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.chat_cancels.cancel(&request_id).await;
    Ok(())
}

#[tauri::command]
pub async fn send_chat_message(
    session_id: String,
    message: String,
    request_id: String,
    provider: Option<String>,
    model: Option<String>,
    domain: Option<String>,
    attachment: Option<AttachmentPayload>,
    reasoning_effort: Option<String>,
    source_command_id: Option<String>,
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // 1. Check if CLI provider (e.g. cli:claude, cli:codex) and read session's stored domain
    let mut eff_provider = provider.clone().unwrap_or_default().trim().to_lowercase();
    let mut session_domain: Option<String> = None;

    if let Ok(mut s_rows) = conn
        .query(
            "SELECT provider, domain FROM agent_chat_sessions WHERE id = ?1",
            crate::turso_params![session_id.clone()],
        )
        .await
    {
        if let Ok(Some(s_row)) = s_rows.next().await {
            if eff_provider.is_empty() {
                if let Ok(Some(sp)) = s_row.get::<Option<String>>(0) {
                    eff_provider = sp.trim().to_lowercase();
                }
            }
            session_domain = s_row.get(1).unwrap_or(None);
        }
    }

    // Tier 3 Server-Side Source of Truth:
    // Look up domain directly from stored agent_chat_sessions record.
    // Client parameter is completely ignored if DB has a record, preventing any client-side drift.
    let eff_domain = match session_domain {
        Some(d) => {
            let trimmed = d.trim().to_lowercase();
            if trimmed.is_empty() || trimmed == "all" {
                None
            } else {
                Some(trimmed)
            }
        }
        None => {
            // Legacy session created prior to domain migration:
            // Backfill and permanently store domain in SQLite if provided
            let fallback = domain.filter(|d| !d.trim().is_empty() && d.trim() != "all");
            if let Some(ref fb) = fallback {
                let _ = conn
                    .execute(
                        "UPDATE agent_chat_sessions SET domain = ?1 WHERE id = ?2 AND domain IS NULL",
                        crate::turso_params![fb.clone(), session_id.clone()],
                    )
                    .await;
            }
            fallback
        }
    };

    let is_cli = eff_provider.starts_with("cli:") || eff_provider.starts_with("cli_");

    // 2. Persist user message to UserDB
    let user_msg_id = format!("msg_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    conn.execute(
        "INSERT INTO agent_chat_messages (id, session_id, role, content, created_at) \
         VALUES (?1, ?2, 'user', ?3, strftime('%s','now'))",
        crate::turso_params![user_msg_id, session_id.clone(), message.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Auto-update session title if it's the first message
    let mut count_rows = conn
        .query(
            "SELECT count(*) FROM agent_chat_messages WHERE session_id = ?1",
            crate::turso_params![session_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = count_rows.next().await.map_err(|e| e.to_string())? {
        let count: i64 = row.get(0).unwrap_or(0);
        if count <= 1 {
            let auto_title = if message.chars().count() > 30 {
                format!("{}...", message.chars().take(27).collect::<String>())
            } else {
                message.clone()
            };
            let _ = conn.execute(
                "UPDATE agent_chat_sessions SET title = ?1 WHERE id = ?2",
                crate::turso_params![auto_title, session_id.clone()],
            ).await;
        }
    }

    // If CLI mode, branch into CLI runner directly
    if is_cli {
        let cancel_flag = state.chat_cancels.register(&request_id).await;
        let res = super::cli::run_cli_turn(
            &session_id,
            &message,
            &request_id,
            &eff_provider,
            model.as_deref(),
            reasoning_effort.as_deref(),
            &app,
            &state,
            &cancel_flag,
        )
        .await;
        state.chat_cancels.remove(&request_id).await;
        return res;
    }

    // 3. Hosted Provider Path: Resolve Provider & API Key
    let resolved_provider = resolve_provider(
        &conn,
        &profile_id,
        provider.as_deref(),
        model.as_deref(),
    )
    .await?;

    // 3. Build system prompt & load message history
    let system_prompt = build_system_prompt(&conn, &profile_id).await;

    // 3b. If an attachment is provided, upload it to configured storage (Webflow priority 1, R2 priority 2)
    let mut uploaded_media_info: Option<crate::commands::media::MediaRow> = None;
    if let Some(ref att) = attachment {
        match crate::commands::media::upload_invoice_attachment(
            &conn,
            &profile_id,
            &att.name,
            &att.mime_type,
            &att.data_base64,
        )
        .await
        {
            Ok(m_row) => {
                uploaded_media_info = Some(m_row);
            }
            Err(e) => {
                log::warn!("[Agents] attachment upload error: {}", e);
            }
        }
    }

    let mut history_rows = conn
        .query(
            "SELECT role, content, tool_calls_json FROM agent_chat_messages \
             WHERE session_id = ?1 ORDER BY created_at ASC",
            crate::turso_params![session_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut raw_history: Vec<(String, String)> = Vec::new();
    while let Some(row) = history_rows.next().await.map_err(|e| e.to_string())? {
        let role: String = row.get(0).map_err(|e| e.to_string())?;
        let content: String = row.get(1).unwrap_or_default();
        raw_history.push((role, content));
    }

    // Cost-effective context sliding window: keep last 14 messages (7 round-trip work turns) intact
    let total_msgs = raw_history.len();
    let window_start = if total_msgs > 14 { total_msgs - 14 } else { 0 };

    let mut conversation_messages: Vec<Value> = Vec::new();
    let is_anthropic = matches!(&resolved_provider, ResolvedProvider::Anthropic { .. });

    for (i, (role, content)) in raw_history.into_iter().enumerate() {
        if i >= window_start {
            // If the latest message has an attached image, format it as a multimodal vision content block
            if i == total_msgs - 1 && role == "user" && attachment.is_some() {
                let att = attachment.as_ref().unwrap();
                let raw_data = att.data_base64.trim();
                let (extracted_mime, clean_b64) = if let Some(idx) = raw_data.find(";base64,") {
                    let header = &raw_data[..idx];
                    let mime_from_header = if header.starts_with("data:") {
                        &header[5..]
                    } else {
                        "image/png"
                    };
                    (mime_from_header, &raw_data[idx + 8..])
                } else {
                    (
                        if att.mime_type.is_empty() { "image/png" } else { &att.mime_type },
                        raw_data,
                    )
                };

                let is_pdf = extracted_mime.contains("pdf") || att.name.to_lowercase().ends_with(".pdf");
                let effective_text = if let Some(ref m) = uploaded_media_info {
                    format!(
                        "{}\n\n[Attached Invoice Document: \"{}\" | media_id: \"{}\" | storage: \"{}\" | url: \"{}\"]",
                        content, m.filename, m.id, m.storage_provider, m.url
                    )
                } else {
                    content
                };

                if is_anthropic {
                    let source_block = if is_pdf {
                        json!({
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": "application/pdf",
                                "data": clean_b64
                            }
                        })
                    } else {
                        json!({
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": extracted_mime,
                                "data": clean_b64
                            }
                        })
                    };

                    conversation_messages.push(json!({
                        "role": "user",
                        "content": [
                            source_block,
                            {
                                "type": "text",
                                "text": effective_text
                            }
                        ]
                    }));
                } else {
                    conversation_messages.push(json!({
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": effective_text
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": format!("data:{};base64,{}", extracted_mime, clean_b64)
                                }
                            }
                        ]
                    }));
                }
            } else {
                conversation_messages.push(json!({
                    "role": role,
                    "content": content
                }));
            }
        }
    }

    // 4. Resolve Active Tools:
    // Tier 1 (Command-Level Tool Scoping): If message originated from a clicked command,
    // look up that command's `required_tools` and send ONLY those tools.
    // Tier 2 (Fast-path Slash Command): If message matches an explicit slash command (/add-inventory-from-invoice),
    // pass ONLY the 1 exact tool needed.
    // Tier 3 (Domain Scoping): Otherwise, filter tools by session's stored domain (eff_domain).
    let active_tools = if let Some(ref cmd_id) = source_command_id {
        let req_tools = super::commands::get_command_required_tools(&conn, &profile_id, cmd_id)
            .await
            .unwrap_or_default();
        if !req_tools.is_empty() {
            let tool_refs: Vec<&str> = req_tools.iter().map(|s| s.as_str()).collect();
            tools::registry_for_tools(&tool_refs)
        } else if let Some(cmd_tools) = tools::tools_for_slash_command(&message) {
            cmd_tools
        } else {
            tools::registry_for_domain(eff_domain.as_deref())
        }
    } else if let Some(cmd_tools) = tools::tools_for_slash_command(&message) {
        cmd_tools
    } else {
        tools::registry_for_domain(eff_domain.as_deref())
    };

    let cancel_flag = state.chat_cancels.register(&request_id).await;
    let client = crate::db::turso::create_shared_http_client();

    let (agent_user_id, agent_name) = match &resolved_provider {
        ResolvedProvider::Anthropic { .. } => {
            ("a1b2c3d4-0001-4000-8000-000000000001", "Claude")
        }
        ResolvedProvider::OpenAICompatible { model, .. } => {
            let m = model.to_lowercase();
            if m.contains("claude") || m.contains("anthropic") {
                ("a1b2c3d4-0001-4000-8000-000000000001", "Claude")
            } else if m.contains("gemini") || m.contains("google") {
                ("a1b2c3d4-0002-4000-8000-000000000002", "Gemini")
            } else if m.contains("gpt") || m.contains("openai") || m.contains("o1") || m.contains("o3") {
                ("a1b2c3d4-0003-4000-8000-000000000003", "ChatGPT")
            } else if m.contains("grok") || m.contains("xai") || m.contains("spacexai") {
                ("a1b2c3d4-0004-4000-8000-000000000004", "Grok")
            } else if m.contains("deepseek") {
                ("a1b2c3d4-0005-4000-8000-000000000005", "DeepSeek")
            } else if m.contains("mistral") || m.contains("codestral") {
                ("a1b2c3d4-0005-4000-8000-000000000005", "Mistral")
            } else {
                ("a1b2c3d4-0005-4000-8000-000000000005", "AI Agents")
            }
        }
    };

    let ctx = ToolCtx {
        user_db: &conn,
        profile_id: profile_id.clone(),
        agent_user_id: agent_user_id.to_string(),
        agent_name: agent_name.to_string(),
        media_attachment_id: uploaded_media_info.as_ref().map(|m| m.id.clone()),
        media_attachment_url: uploaded_media_info.as_ref().map(|m| m.url.clone()),
    };

    let mut total_assistant_text = String::new();
    let mut all_tool_results = Vec::new();
    let mut iteration = 0;

    while iteration < MAX_TOOL_ITERS {
        iteration += 1;

        if cancel_flag.load(Ordering::SeqCst) {
            let _ = app.emit(
                "chat-error",
                ErrorEvent {
                    request_id: request_id.clone(),
                    session_id: session_id.clone(),
                    error: "Chat cancelled".into(),
                },
            );
            state.chat_cancels.remove(&request_id).await;
            return Ok(());
        }

        let turn_res = match &resolved_provider {
            ResolvedProvider::OpenAICompatible {
                api_key,
                base_url,
                model,
                is_openrouter,
            } => {
                run_openai_compatible_turn(
                    &client,
                    base_url,
                    api_key,
                    model,
                    *is_openrouter,
                    reasoning_effort.as_deref(),
                    &system_prompt,
                    &conversation_messages,
                    &active_tools,
                    &app,
                    &request_id,
                    &session_id,
                    &cancel_flag,
                )
                .await
            }
            ResolvedProvider::Anthropic { api_key, model } => {
                run_anthropic_turn(
                    &client,
                    api_key,
                    model,
                    reasoning_effort.as_deref(),
                    &system_prompt,
                    &conversation_messages,
                    &active_tools,
                    &app,
                    &request_id,
                    &session_id,
                    &cancel_flag,
                )
                .await
            }
        };

        let turn_res = match turn_res {
            Ok(res) => res,
            Err(e) => {
                let _ = app.emit(
                    "chat-error",
                    ErrorEvent {
                        request_id: request_id.clone(),
                        session_id: session_id.clone(),
                        error: e.clone(),
                    },
                );
                state.chat_cancels.remove(&request_id).await;
                return Err(e);
            }
        };

        if !turn_res.assistant_text.is_empty() {
            total_assistant_text.push_str(&turn_res.assistant_text);
        }

        // If no tool calls, turn is finished!
        if turn_res.tool_use_blocks.is_empty() {
            break;
        }

        // Handle tool use blocks formatting for next turn depending on provider
        match &resolved_provider {
            ResolvedProvider::Anthropic { .. } => {
                let mut assistant_content_blocks = Vec::new();
                if !turn_res.assistant_text.is_empty() {
                    assistant_content_blocks.push(json!({
                        "type": "text",
                        "text": turn_res.assistant_text
                    }));
                }

                for tool_use in &turn_res.tool_use_blocks {
                    assistant_content_blocks.push(json!({
                        "type": "tool_use",
                        "id": tool_use.id,
                        "name": tool_use.name,
                        "input": tool_use.input
                    }));
                }

                conversation_messages.push(json!({
                    "role": "assistant",
                    "content": assistant_content_blocks
                }));
            }
            ResolvedProvider::OpenAICompatible { base_url, model, .. } => {
                let is_google = base_url.contains("googleapis.com") || model.starts_with("google/") || model.starts_with("gemini-");

                let google_extra_content = turn_res.extra_content.clone().unwrap_or_else(|| {
                    json!({
                        "google": {
                            "thought_signature": "skip_thought_signature_validator"
                        }
                    })
                });

                let tool_calls: Vec<Value> = turn_res.tool_use_blocks.iter().map(|tu| {
                    let mut tc_obj = json!({
                        "id": tu.id,
                        "type": "function",
                        "function": {
                            "name": tu.name,
                            "arguments": tu.input.to_string()
                        }
                    });
                    if is_google {
                        tc_obj["extra_content"] = google_extra_content.clone();
                    }
                    tc_obj
                }).collect();

                let mut assistant_msg = json!({
                    "role": "assistant",
                    "content": if turn_res.assistant_text.is_empty() { Value::Null } else { json!(turn_res.assistant_text) },
                    "tool_calls": tool_calls
                });

                if is_google {
                    assistant_msg["extra_content"] = google_extra_content;
                }

                conversation_messages.push(assistant_msg);
            }
        }

        // Execute each tool and collect results
        let mut anthropic_tool_result_blocks = Vec::new();

        for tool_use in turn_res.tool_use_blocks {
            let _ = app.emit(
                "chat-tool-call",
                ToolCallEvent {
                    request_id: request_id.clone(),
                    session_id: session_id.clone(),
                    tool_name: tool_use.name.clone(),
                    tool_id: tool_use.id.clone(),
                    args: tool_use.input.clone(),
                    result: None,
                    status: "executing".into(),
                },
            );

            let exec_res = tools::execute(&tool_use.name, tool_use.input.clone(), &ctx).await;

            match exec_res {
                Ok(val) => {
                    let _ = app.emit(
                        "chat-tool-call",
                        ToolCallEvent {
                            request_id: request_id.clone(),
                            session_id: session_id.clone(),
                            tool_name: tool_use.name.clone(),
                            tool_id: tool_use.id.clone(),
                            args: tool_use.input.clone(),
                            result: Some(val.clone()),
                            status: "completed".into(),
                        },
                    );

                    all_tool_results.push(json!({
                        "tool": tool_use.name,
                        "id": tool_use.id,
                        "result": val.clone()
                    }));

                    match &resolved_provider {
                        ResolvedProvider::Anthropic { .. } => {
                            anthropic_tool_result_blocks.push(json!({
                                "type": "tool_result",
                                "tool_use_id": tool_use.id,
                                "content": val.to_string()
                            }));
                        }
                        ResolvedProvider::OpenAICompatible { .. } => {
                            conversation_messages.push(json!({
                                "role": "tool",
                                "tool_call_id": tool_use.id,
                                "content": val.to_string()
                            }));
                        }
                    }
                }
                Err(err) => {
                    let _ = app.emit(
                        "chat-tool-call",
                        ToolCallEvent {
                            request_id: request_id.clone(),
                            session_id: session_id.clone(),
                            tool_name: tool_use.name.clone(),
                            tool_id: tool_use.id.clone(),
                            args: tool_use.input.clone(),
                            result: Some(json!({ "error": err })),
                            status: "failed".into(),
                        },
                    );

                    match &resolved_provider {
                        ResolvedProvider::Anthropic { .. } => {
                            anthropic_tool_result_blocks.push(json!({
                                "type": "tool_result",
                                "tool_use_id": tool_use.id,
                                "content": format!("Tool execution error: {err}"),
                                "is_error": true
                            }));
                        }
                        ResolvedProvider::OpenAICompatible { .. } => {
                            conversation_messages.push(json!({
                                "role": "tool",
                                "tool_call_id": tool_use.id,
                                "content": format!("Tool execution error: {err}")
                            }));
                        }
                    }
                }
            }
        }

        if let ResolvedProvider::Anthropic { .. } = &resolved_provider {
            conversation_messages.push(json!({
                "role": "user",
                "content": anthropic_tool_result_blocks
            }));
        }
    }

    // 4. Persist assistant response to UserDB
    let assistant_msg_id = format!("msg_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    let tool_calls_json = if all_tool_results.is_empty() {
        None
    } else {
        Some(json!(all_tool_results).to_string())
    };

    conn.execute(
        "INSERT INTO agent_chat_messages (id, session_id, role, content, tool_calls_json, created_at) \
         VALUES (?1, ?2, 'assistant', ?3, ?4, strftime('%s','now'))",
        crate::turso_params![
            assistant_msg_id,
            session_id.clone(),
            total_assistant_text.clone(),
            tool_calls_json.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Calculate tokens & cost
    let (eff_model, eff_provider) = match &resolved_provider {
        ResolvedProvider::OpenAICompatible { model, is_openrouter, base_url, .. } => {
            let p = if *is_openrouter {
                "openrouter"
            } else if base_url.contains("googleapis") {
                "gemini"
            } else if base_url.contains("deepseek") {
                "deepseek"
            } else if base_url.contains("groq") {
                "groq"
            } else {
                "openai"
            };
            (model.clone(), p.to_string())
        }
        ResolvedProvider::Anthropic { model, .. } => (model.clone(), "anthropic".to_string()),
    };

    let prompt_tokens = estimate_tokens(&system_prompt) + estimate_tokens(&message);
    let completion_tokens = estimate_tokens(&total_assistant_text)
        + if let Some(ref tj) = tool_calls_json { estimate_tokens(tj) } else { 0 };
    let total_turn_tokens = prompt_tokens + completion_tokens;
    let turn_cost = estimate_cost(&eff_model, &eff_provider, prompt_tokens, completion_tokens);
    let preview = if total_assistant_text.chars().count() > 120 {
        format!("{}...", total_assistant_text.chars().take(117).collect::<String>())
    } else {
        total_assistant_text.clone()
    };
    let tool_count = all_tool_results.len() as i64;

    let _ = conn.execute(
        "UPDATE agent_chat_sessions SET \
            model = COALESCE(?2, model), \
            provider = COALESCE(?3, provider), \
            prompt_tokens = prompt_tokens + ?4, \
            completion_tokens = completion_tokens + ?5, \
            total_tokens = total_tokens + ?6, \
            total_cost = total_cost + ?7, \
            message_count = message_count + 2, \
            tool_call_count = tool_call_count + ?8, \
            last_message_preview = ?9, \
            updated_at = strftime('%s','now') \
         WHERE id = ?1",
        crate::turso_params![
            session_id.clone(),
            eff_model.clone(),
            eff_provider.clone(),
            prompt_tokens,
            completion_tokens,
            total_turn_tokens,
            turn_cost,
            tool_count,
            preview,
        ],
    ).await;

    // Aggregate into agent_analytics
    let _ = aggregate_agent_analytics(&conn, &profile_id).await;

    // 5. Emit done event
    let _ = app.emit(
        "chat-done",
        DoneEvent {
            request_id: request_id.clone(),
            session_id,
            content: total_assistant_text,
            tool_results: all_tool_results,
        },
    );

    state.chat_cancels.remove(&request_id).await;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPriceInfo {
    pub id: String,
    pub name: String,
    pub prompt_price_1m: f64,
    pub completion_price_1m: f64,
    pub formatted: String,
    pub supports_reasoning: bool,
}

#[tauri::command]
pub async fn get_openrouter_pricing() -> Result<HashMap<String, ModelPriceInfo>, String> {
    let api_key = std::env::var("OPENROUTER_API_KEY").unwrap_or_default();
    let client = crate::db::turso::create_shared_http_client();

    let mut req = client.get("https://openrouter.ai/api/v1/models");
    if !api_key.trim().is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key.trim()));
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("OpenRouter models API returned status {}", resp.status()));
    }

    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut map = HashMap::new();

    if let Some(arr) = body.get("data").and_then(|d| d.as_array()) {
        for m in arr {
            if let (Some(id), Some(pricing)) = (m.get("id").and_then(|v| v.as_str()), m.get("pricing")) {
                let p_str = pricing.get("prompt").and_then(|v| v.as_str()).unwrap_or("0");
                let c_str = pricing.get("completion").and_then(|v| v.as_str()).unwrap_or("0");
                let p_val: f64 = p_str.parse().unwrap_or(0.0) * 1_000_000.0;
                let c_val: f64 = c_str.parse().unwrap_or(0.0) * 1_000_000.0;
                let name = m.get("name").and_then(|v| v.as_str()).unwrap_or(id).to_string();
                let formatted = format!("${:.2} / ${:.2}", p_val, c_val);

                let id_lower = id.to_lowercase();
                let supports_reasoning = m.get("supported_parameters")
                    .and_then(|p| p.as_array())
                    .map(|arr| arr.iter().any(|v| {
                        let s = v.as_str().unwrap_or("");
                        s == "reasoning" || s == "include_reasoning" || s == "reasoning_effort"
                    }))
                    .unwrap_or(false)
                    || id_lower.contains("r1")
                    || id_lower.contains("reasoner")
                    || id_lower.contains("thinking")
                    || id_lower.contains("o1")
                    || id_lower.contains("o3")
                    || id_lower.contains("o4")
                    || id_lower.contains("gpt-5")
                    || id_lower.contains("claude-3-7")
                    || id_lower.contains("claude-4")
                    || id_lower.contains("claude-5")
                    || id_lower.contains("gemini-3")
                    || id_lower.contains("gemini-2.5-pro");

                let info = ModelPriceInfo {
                    id: id.to_string(),
                    name,
                    prompt_price_1m: p_val,
                    completion_price_1m: c_val,
                    formatted,
                    supports_reasoning,
                };

                // Insert exact id
                map.insert(id.to_string(), info.clone());

                // Also insert short alias if prefixed (e.g. "google/gemini-3.1-flash-lite" -> "gemini-3.1-flash-lite")
                if let Some(stripped) = id.strip_prefix("google/").or_else(|| id.strip_prefix("anthropic/")).or_else(|| id.strip_prefix("openai/")).or_else(|| id.strip_prefix("deepseek/")) {
                    map.entry(stripped.to_string()).or_insert_with(|| info.clone());
                }
            }
        }
    }

    Ok(map)
}
