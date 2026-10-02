// Phase 21: usage monitoring — pricing + aggregation core.
//
// The aggregation core operates on a single canonical JSON row shape (the same
// columns for project/org/account levels, see db.rs). `apply_event` folds one
// `UsageEvent` into a row: lifetime counters, year-keyed analytics, rolling
// windows, the by_* breakdowns relevant to the level, and the 365-day heatmap.
// The exact same function runs locally and against the Turso shared totals, so
// behavior is identical on every surface.

use crate::cloud::{self, cell_text};
use crate::db::{Db, UsageEvent};
use chrono::{DateTime, Duration, Utc};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use ulid::Ulid;

/// Hardcoded, updatable pricing. USD per 1M tokens. Shown as an estimate, never
/// a billing guarantee. `provider` empty = matches any provider for the model.
pub struct ModelPricing {
    pub model: &'static str,
    pub provider: &'static str,
    pub prompt_per_1m: f64,
    pub cached_per_1m: f64,
    pub completion_per_1m: f64,
    pub reasoning_per_1m: f64,
}

const PRICING: &[ModelPricing] = &[
    // Anthropic / Claude Code
    ModelPricing {
        model: "opus-5.5",
        provider: "anthropic",
        prompt_per_1m: 4.0,
        cached_per_1m: 0.40,
        completion_per_1m: 20.0,
        reasoning_per_1m: 20.0,
    },
    ModelPricing {
        model: "opus-5",
        provider: "anthropic",
        prompt_per_1m: 4.0,
        cached_per_1m: 0.40,
        completion_per_1m: 20.0,
        reasoning_per_1m: 20.0,
    },
    ModelPricing {
        model: "fable-5.1",
        provider: "anthropic",
        prompt_per_1m: 10.0,
        cached_per_1m: 1.00,
        completion_per_1m: 50.0,
        reasoning_per_1m: 50.0,
    },
    ModelPricing {
        model: "fable-5",
        provider: "anthropic",
        prompt_per_1m: 10.0,
        cached_per_1m: 1.00,
        completion_per_1m: 50.0,
        reasoning_per_1m: 50.0,
    },
    ModelPricing {
        model: "sonnet-5",
        provider: "anthropic",
        prompt_per_1m: 2.0,
        cached_per_1m: 0.20,
        completion_per_1m: 10.0,
        reasoning_per_1m: 10.0,
    },
    ModelPricing {
        model: "haiku-4.5",
        provider: "anthropic",
        prompt_per_1m: 1.0,
        cached_per_1m: 0.10,
        completion_per_1m: 5.0,
        reasoning_per_1m: 5.0,
    },
    ModelPricing {
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        prompt_per_1m: 3.0,
        cached_per_1m: 0.30,
        completion_per_1m: 15.0,
        reasoning_per_1m: 15.0,
    },
    ModelPricing {
        model: "claude-sonnet-4-5",
        provider: "anthropic",
        prompt_per_1m: 3.0,
        cached_per_1m: 0.30,
        completion_per_1m: 15.0,
        reasoning_per_1m: 15.0,
    },
    ModelPricing {
        model: "claude-3-5-sonnet",
        provider: "anthropic",
        prompt_per_1m: 3.0,
        cached_per_1m: 0.30,
        completion_per_1m: 15.0,
        reasoning_per_1m: 15.0,
    },
    ModelPricing {
        model: "claude-3-7-sonnet",
        provider: "anthropic",
        prompt_per_1m: 3.0,
        cached_per_1m: 0.30,
        completion_per_1m: 15.0,
        reasoning_per_1m: 15.0,
    },
    ModelPricing {
        model: "claude-3-5-haiku",
        provider: "anthropic",
        prompt_per_1m: 0.80,
        cached_per_1m: 0.08,
        completion_per_1m: 4.0,
        reasoning_per_1m: 4.0,
    },
    ModelPricing {
        model: "claude-3-haiku",
        provider: "anthropic",
        prompt_per_1m: 0.25,
        cached_per_1m: 0.025,
        completion_per_1m: 1.25,
        reasoning_per_1m: 1.25,
    },
    ModelPricing {
        model: "claude-3-opus",
        provider: "anthropic",
        prompt_per_1m: 15.0,
        cached_per_1m: 1.50,
        completion_per_1m: 75.0,
        reasoning_per_1m: 75.0,
    },
    ModelPricing {
        model: "claude-opus-4",
        provider: "anthropic",
        prompt_per_1m: 15.0,
        cached_per_1m: 1.50,
        completion_per_1m: 75.0,
        reasoning_per_1m: 75.0,
    },
    ModelPricing {
        model: "opus-4.8",
        provider: "anthropic",
        prompt_per_1m: 6.0,
        cached_per_1m: 0.60,
        completion_per_1m: 30.0,
        reasoning_per_1m: 30.0,
    },
    // OpenAI / Codex
    ModelPricing {
        model: "gpt-6-astra",
        provider: "openai",
        prompt_per_1m: 5.0,
        cached_per_1m: 1.25,
        completion_per_1m: 20.0,
        reasoning_per_1m: 20.0,
    },
    ModelPricing {
        model: "gpt-6-sol",
        provider: "openai",
        prompt_per_1m: 1.50,
        cached_per_1m: 0.375,
        completion_per_1m: 6.0,
        reasoning_per_1m: 6.0,
    },
    ModelPricing {
        model: "gpt-6-luna",
        provider: "openai",
        prompt_per_1m: 0.20,
        cached_per_1m: 0.05,
        completion_per_1m: 0.80,
        reasoning_per_1m: 0.80,
    },
    ModelPricing {
        model: "gpt-5.6-sol",
        provider: "openai",
        prompt_per_1m: 2.0,
        cached_per_1m: 0.50,
        completion_per_1m: 8.0,
        reasoning_per_1m: 8.0,
    },
    ModelPricing {
        model: "gpt-5.6-terra",
        provider: "openai",
        prompt_per_1m: 1.0,
        cached_per_1m: 0.25,
        completion_per_1m: 4.0,
        reasoning_per_1m: 4.0,
    },
    ModelPricing {
        model: "gpt-5.6-luna",
        provider: "openai",
        prompt_per_1m: 0.30,
        cached_per_1m: 0.075,
        completion_per_1m: 1.20,
        reasoning_per_1m: 1.20,
    },
    ModelPricing {
        model: "gpt-5.5",
        provider: "openai",
        prompt_per_1m: 1.25,
        cached_per_1m: 0.125,
        completion_per_1m: 10.0,
        reasoning_per_1m: 10.0,
    },
    ModelPricing {
        model: "gpt-4o",
        provider: "openai",
        prompt_per_1m: 2.50,
        cached_per_1m: 1.25,
        completion_per_1m: 10.0,
        reasoning_per_1m: 10.0,
    },
    ModelPricing {
        model: "gpt-4o-mini",
        provider: "openai",
        prompt_per_1m: 0.15,
        cached_per_1m: 0.075,
        completion_per_1m: 0.60,
        reasoning_per_1m: 0.60,
    },
    ModelPricing {
        model: "o1",
        provider: "openai",
        prompt_per_1m: 15.0,
        cached_per_1m: 7.50,
        completion_per_1m: 60.0,
        reasoning_per_1m: 60.0,
    },
    ModelPricing {
        model: "o3-mini",
        provider: "openai",
        prompt_per_1m: 1.10,
        cached_per_1m: 0.55,
        completion_per_1m: 4.40,
        reasoning_per_1m: 4.40,
    },
    ModelPricing {
        model: "gpt-5.3-codex",
        provider: "openai",
        prompt_per_1m: 1.25,
        cached_per_1m: 0.125,
        completion_per_1m: 10.0,
        reasoning_per_1m: 10.0,
    },
    // Google / Antigravity
    ModelPricing {
        model: "gemini-3.8-flash",
        provider: "google",
        prompt_per_1m: 0.75,
        cached_per_1m: 0.1875,
        completion_per_1m: 3.75,
        reasoning_per_1m: 3.75,
    },
    ModelPricing {
        model: "gemini-3.7-flash",
        provider: "google",
        prompt_per_1m: 0.75,
        cached_per_1m: 0.1875,
        completion_per_1m: 3.75,
        reasoning_per_1m: 3.75,
    },
    ModelPricing {
        model: "gemini-3.6-flash",
        provider: "google",
        prompt_per_1m: 0.50,
        cached_per_1m: 0.125,
        completion_per_1m: 2.50,
        reasoning_per_1m: 2.50,
    },
    ModelPricing {
        model: "gemini-3.1-pro",
        provider: "google",
        prompt_per_1m: 2.00,
        cached_per_1m: 0.50,
        completion_per_1m: 12.0,
        reasoning_per_1m: 12.0,
    },
    ModelPricing {
        model: "gemini-3-flash",
        provider: "google",
        prompt_per_1m: 0.50,
        cached_per_1m: 0.125,
        completion_per_1m: 3.00,
        reasoning_per_1m: 3.00,
    },
    ModelPricing {
        model: "gemini-2.5-pro",
        provider: "google",
        prompt_per_1m: 1.25,
        cached_per_1m: 0.3125,
        completion_per_1m: 10.0,
        reasoning_per_1m: 10.0,
    },
    ModelPricing {
        model: "gemini-2.5-flash",
        provider: "google",
        prompt_per_1m: 0.30,
        cached_per_1m: 0.075,
        completion_per_1m: 2.50,
        reasoning_per_1m: 2.50,
    },
    ModelPricing {
        model: "gemini-2.5-flash-lite",
        provider: "google",
        prompt_per_1m: 0.10,
        cached_per_1m: 0.025,
        completion_per_1m: 0.40,
        reasoning_per_1m: 0.40,
    },
    ModelPricing {
        model: "gemini-2.0-flash",
        provider: "google",
        prompt_per_1m: 0.10,
        cached_per_1m: 0.025,
        completion_per_1m: 0.40,
        reasoning_per_1m: 0.40,
    },
    ModelPricing {
        model: "gemini-1.5-pro",
        provider: "google",
        prompt_per_1m: 1.25,
        cached_per_1m: 0.3125,
        completion_per_1m: 5.0,
        reasoning_per_1m: 5.0,
    },
    ModelPricing {
        model: "gpt-oss-120b",
        provider: "google",
        prompt_per_1m: 0.40,
        cached_per_1m: 0.04,
        completion_per_1m: 1.60,
        reasoning_per_1m: 1.60,
    },
    // xAI / Grok
    ModelPricing {
        model: "grok-4.7",
        provider: "xai",
        prompt_per_1m: 2.0,
        cached_per_1m: 0.50,
        completion_per_1m: 10.0,
        reasoning_per_1m: 10.0,
    },
    ModelPricing {
        model: "grok-4.6",
        provider: "xai",
        prompt_per_1m: 2.0,
        cached_per_1m: 0.50,
        completion_per_1m: 10.0,
        reasoning_per_1m: 10.0,
    },
    ModelPricing {
        model: "grok-4.5",
        provider: "xai",
        prompt_per_1m: 2.0,
        cached_per_1m: 0.50,
        completion_per_1m: 10.0,
        reasoning_per_1m: 10.0,
    },
    ModelPricing {
        model: "grok-3",
        provider: "xai",
        prompt_per_1m: 3.0,
        cached_per_1m: 0.75,
        completion_per_1m: 15.0,
        reasoning_per_1m: 15.0,
    },
    ModelPricing {
        model: "grok-2",
        provider: "xai",
        prompt_per_1m: 2.0,
        cached_per_1m: 0.50,
        completion_per_1m: 10.0,
        reasoning_per_1m: 10.0,
    },
    // DeepSeek & Open Source / Droid
    ModelPricing {
        model: "glm-5.3-flash",
        provider: "zhipu",
        prompt_per_1m: 0.10,
        cached_per_1m: 0.02,
        completion_per_1m: 0.40,
        reasoning_per_1m: 0.40,
    },
    ModelPricing {
        model: "glm-5.3",
        provider: "zhipu",
        prompt_per_1m: 0.50,
        cached_per_1m: 0.10,
        completion_per_1m: 2.00,
        reasoning_per_1m: 2.00,
    },
    ModelPricing {
        model: "glm-5.2",
        provider: "zhipu",
        prompt_per_1m: 0.50,
        cached_per_1m: 0.10,
        completion_per_1m: 2.00,
        reasoning_per_1m: 2.00,
    },
    ModelPricing {
        model: "kimi-k3",
        provider: "moonshot",
        prompt_per_1m: 0.60,
        cached_per_1m: 0.12,
        completion_per_1m: 2.40,
        reasoning_per_1m: 2.40,
    },
    ModelPricing {
        model: "mistral-medium-3.5",
        provider: "mistral",
        prompt_per_1m: 0.60,
        cached_per_1m: 0.12,
        completion_per_1m: 2.40,
        reasoning_per_1m: 2.40,
    },
    ModelPricing {
        model: "inkling",
        provider: "droid",
        prompt_per_1m: 0.40,
        cached_per_1m: 0.08,
        completion_per_1m: 1.60,
        reasoning_per_1m: 1.60,
    },
    ModelPricing {
        model: "deepseek-chat",
        provider: "deepseek",
        prompt_per_1m: 0.14,
        cached_per_1m: 0.014,
        completion_per_1m: 0.28,
        reasoning_per_1m: 0.28,
    },
    ModelPricing {
        model: "deepseek-r1",
        provider: "deepseek",
        prompt_per_1m: 0.55,
        cached_per_1m: 0.14,
        completion_per_1m: 2.19,
        reasoning_per_1m: 2.19,
    },
];

use std::collections::HashMap;
use std::sync::RwLock;

#[derive(Debug, Clone)]
pub struct ModelPriceEntry {
    pub prompt_per_1m: f64,
    pub cached_per_1m: f64,
    pub completion_per_1m: f64,
    pub reasoning_per_1m: f64,
}

static DYNAMIC_PRICING: RwLock<Option<HashMap<String, ModelPriceEntry>>> = RwLock::new(None);

pub fn update_dynamic_pricing(rates: &[(String, String, f64, f64, f64, f64)]) {
    let mut map = HashMap::new();
    for (id, _prov, p, cp, c, r) in rates {
        map.insert(
            id.clone(),
            ModelPriceEntry {
                prompt_per_1m: *p,
                cached_per_1m: *cp,
                completion_per_1m: *c,
                reasoning_per_1m: *r,
            },
        );
        if let Some(short) = id.split('/').nth(1) {
            map.entry(short.to_string()).or_insert(ModelPriceEntry {
                prompt_per_1m: *p,
                cached_per_1m: *cp,
                completion_per_1m: *c,
                reasoning_per_1m: *r,
            });
        }
    }
    if let Ok(mut lock) = DYNAMIC_PRICING.write() {
        *lock = Some(map);
    }
}

pub fn load_cached_pricing(db: &Db) {
    if let Ok(cached) = db.get_cached_model_pricing() {
        if !cached.is_empty() {
            update_dynamic_pricing(&cached);
        }
    }
}

pub async fn sync_openrouter_pricing(app: &AppHandle) {
    if let Some(db) = app.try_state::<Db>() {
        load_cached_pricing(&db);
    }

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("SuperConsole/0.1.0")
        .build()
    {
        Ok(c) => c,
        Err(_) => return,
    };

    let resp = match client.get("https://openrouter.ai/api/v1/models").send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("superconsole pricing: openrouter sync error: {}", e);
            return;
        }
    };

    if !resp.status().is_success() {
        return;
    }

    let body: Value = match resp.json().await {
        Ok(b) => b,
        Err(_) => return,
    };

    let data = match body.get("data").and_then(|d| d.as_array()) {
        Some(arr) => arr,
        None => return,
    };

    let mut rates = Vec::new();
    for item in data {
        let id = match item.get("id").and_then(|s| s.as_str()) {
            Some(s) => s.to_lowercase(),
            None => continue,
        };
        let pricing = match item.get("pricing") {
            Some(p) => p,
            None => continue,
        };
        let prompt_per_tok = pricing
            .get("prompt")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);
        let comp_per_tok = pricing
            .get("completion")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);
        let cached_per_tok = pricing
            .get("input_cache_read")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(prompt_per_tok * 0.25);
        let rsn_per_tok = pricing
            .get("internal_reasoning")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(comp_per_tok);

        let p_1m = prompt_per_tok * 1_000_000.0;
        let c_1m = comp_per_tok * 1_000_000.0;
        let cp_1m = cached_per_tok * 1_000_000.0;
        let r_1m = rsn_per_tok * 1_000_000.0;

        let provider = id.split('/').next().unwrap_or("").to_string();
        rates.push((id, provider, p_1m, cp_1m, c_1m, r_1m));
    }

    if !rates.is_empty() {
        if let Some(db) = app.try_state::<Db>() {
            let _ = db.save_model_pricing(&rates);
        }
        update_dynamic_pricing(&rates);
    }
}

/// Best-effort prefix match on model name (+ provider when given). Returns the
/// per-1M rates. First checks live dynamic cache (from OpenRouter/SQLite),
/// then falls back to the embedded rate card.
pub fn pricing_for(model: &str, provider: &str) -> (f64, f64, f64, f64) {
    let m = model.to_lowercase();
    let p = provider.to_lowercase();

    // 1. Check in-memory dynamic pricing cache from OpenRouter sync
    if let Ok(guard) = DYNAMIC_PRICING.read() {
        if let Some(ref cache) = *guard {
            if let Some(entry) = cache.get(&m) {
                return (entry.prompt_per_1m, entry.cached_per_1m, entry.completion_per_1m, entry.reasoning_per_1m);
            }
            for (key, entry) in cache.iter() {
                if key.ends_with(&m) || m.ends_with(key) || key.contains(&m) || m.contains(key) {
                    return (entry.prompt_per_1m, entry.cached_per_1m, entry.completion_per_1m, entry.reasoning_per_1m);
                }
            }
        }
    }

    // 2. Fallback to built-in rate card
    let hit = PRICING
        .iter()
        .find(|e| m.starts_with(e.model) && (p.is_empty() || e.provider == p))
        .or_else(|| PRICING.iter().find(|e| m.starts_with(e.model)))
        .or_else(|| PRICING.iter().find(|e| m.contains(e.model)));
    match hit {
        Some(e) => (
            e.prompt_per_1m,
            e.cached_per_1m,
            e.completion_per_1m,
            e.reasoning_per_1m,
        ),
        None => (3.0, 0.30, 15.0, 15.0),
    }
}

/// Estimate cost in USD from token counts and the pricing table.
pub fn estimate_cost(
    model: &str,
    provider: &str,
    tokens_prompt: i64,
    tokens_prompt_cached: i64,
    tokens_completion: i64,
    tokens_reasoning: i64,
) -> f64 {
    let (pp, cp, cmp, rp) = pricing_for(model, provider);
    let per = |n: i64, rate: f64| (n.max(0) as f64) / 1_000_000.0 * rate;
    per(tokens_prompt, pp)
        + per(tokens_prompt_cached, cp)
        + per(tokens_completion, cmp)
        + per(tokens_reasoning, rp)
}

/// Best-effort parse of token usage printed by a CLI at session end. Different
/// CLIs print slightly different lines; we scan for "<n> input" / "<n> output"
/// (commas allowed) plus an optional "($<cost>)". Returns None if not found.
/// Always flagged as estimated by the caller since it is screen-scraped.
pub fn parse_cli_usage(text: &str) -> Option<(i64, i64, Option<f64>)> {
    let lower = text.to_lowercase();
    let num_before = |kw: &str| -> Option<i64> {
        let pos = lower.rfind(kw)?;
        let head = &lower[..pos];
        let digits: String = head
            .chars()
            .rev()
            .skip_while(|c| c.is_whitespace())
            .take_while(|c| c.is_ascii_digit() || *c == ',')
            .collect::<String>()
            .chars()
            .rev()
            .filter(|c| c.is_ascii_digit())
            .collect();
        digits.parse::<i64>().ok()
    };
    let prompt = num_before(" input").or_else(|| num_before(" in"));
    let completion = num_before(" output").or_else(|| num_before(" out"));
    let (prompt, completion) = (prompt?, completion?);
    if prompt == 0 && completion == 0 {
        return None;
    }
    // Optional cost: "($0.142)" or "Cost: $0.142" or "$0.142"
    let cost = lower.find("($").and_then(|i| {
        let rest = &lower[i + 2..];
        let end = rest.find(')')?;
        rest[..end].trim().parse::<f64>().ok()
    }).or_else(|| {
        lower.find('$').and_then(|i| {
            let rest = &lower[i + 1..];
            let num: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
            num.parse::<f64>().ok()
        })
    });
    Some((prompt, completion, cost))
}

#[derive(Debug, Clone, Default)]
pub struct CliUsageResult {
    pub tokens_prompt: i64,
    pub tokens_completion: i64,
    pub tokens_reasoning: i64,
    pub cost_usd: f64,
    pub model: String,
    pub provider: String,
    pub estimated: bool,
}

fn get_home() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME").map(std::path::PathBuf::from)
}

pub fn extract_clean_session_id(raw: Option<&str>) -> Option<String> {
    let mut s = raw?.trim();
    if s.is_empty() {
        return None;
    }
    while let Some(pos) = s.rfind(":resume:") {
        s = &s[pos + 8..];
    }
    if let Some(pos) = s.find(':') {
        let prefix = &s[..pos];
        if prefix.chars().all(|c| c.is_ascii_digit()) {
            s = &s[pos + 1..];
        }
    }
    if s.starts_with("antigravity-") || s.starts_with("antigravity:") {
        s = &s[12..];
    } else if s.starts_with("claude-") || s.starts_with("claude:") {
        s = &s[7..];
    } else if s.starts_with("grok-") || s.starts_with("grok:") {
        s = &s[5..];
    } else if s.starts_with("codex-") || s.starts_with("codex:") {
        s = &s[6..];
    } else if s.starts_with("droid-") || s.starts_with("droid:") {
        s = &s[6..];
    } else if s.starts_with("warp-") || s.starts_with("warp:") {
        s = &s[5..];
    } else if s.starts_with("cursor-") || s.starts_with("cursor:") {
        s = &s[7..];
    }
    s = s.trim();
    if s.is_empty() || s.starts_with("tab-") {
        return None;
    }
    // If it's a chained timestamp like "1790546990520-1790547016522", extract the first (root) parent timestamp
    if s.contains('-')
        && s.split('-')
            .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
    {
        if let Some(first) = s.split('-').next() {
            return Some(first.to_string());
        }
    }
    Some(s.to_string())
}

pub fn find_latest_claude_session_id(workspace_path: &str) -> Option<String> {
    let home = get_home()?;
    let encoded: String = workspace_path
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let base = home.join(".claude").join("projects").join(&encoded);
    if !base.is_dir() {
        return None;
    }
    let rd = std::fs::read_dir(&base).ok()?;
    let mut latest: Option<(String, std::time::SystemTime)> = None;
    for entry in rd.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
            if let Ok(meta) = std::fs::metadata(&path) {
                let mtime = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    if latest.as_ref().map(|l| mtime > l.1).unwrap_or(true) {
                        latest = Some((stem.to_string(), mtime));
                    }
                }
            }
        }
    }
    latest.map(|l| l.0)
}

pub fn extract_cli_usage(
    cli: &str,
    workspace_path: &str,
    resume_session_id: Option<&str>,
    tail: &str,
) -> CliUsageResult {
    let home = match get_home() {
        Some(h) => h,
        None => return screen_scrape_fallback(cli, tail),
    };

    let clean_sid = extract_clean_session_id(resume_session_id);

    match cli {
        "claude" => {
            let encoded: String = workspace_path
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
                .collect();
            let base = home.join(".claude").join("projects").join(&encoded);
            let mut session_file = None;

            if let Some(ref sid) = clean_sid {
                let candidate = base.join(format!("{}.jsonl", sid));
                if candidate.exists() {
                    session_file = Some(candidate);
                }
            }

            if session_file.is_none() && base.is_dir() {
                if let Some(latest_id) = find_latest_claude_session_id(workspace_path) {
                    let candidate = base.join(format!("{}.jsonl", latest_id));
                    if candidate.exists() {
                        session_file = Some(candidate);
                    }
                }
            }

            if let Some(sf) = session_file {
                if let Ok(file) = std::fs::File::open(&sf) {
                    use std::io::{BufRead, BufReader};
                    let mut prompt = 0i64;
                    let mut cached = 0i64;
                    let mut completion = 0i64;
                    let mut reasoning = 0i64;
                    let mut model = "claude-sonnet-4-6".to_string();
                    let mut total_cost = 0.0;

                    for line in BufReader::new(file).lines().flatten() {
                        if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&line) {
                            if let Some(msg) = obj.get("message") {
                                if let Some(m) = msg.get("model").and_then(|s| s.as_str()) {
                                    model = m.to_string();
                                }
                                if let Some(usage) = msg.get("usage") {
                                    let inp = usage.get("input_tokens").and_then(|n| n.as_i64()).unwrap_or(0);
                                    let cache_read = usage.get("cache_read_input_tokens").and_then(|n| n.as_i64()).unwrap_or(0);
                                    let cache_create = usage.get("cache_creation_input_tokens").and_then(|n| n.as_i64()).unwrap_or(0);
                                    let out = usage.get("output_tokens").and_then(|n| n.as_i64()).unwrap_or(0);
                                    let rsn = usage.get("output_tokens_details")
                                        .and_then(|d| d.get("thinking_tokens"))
                                        .and_then(|n| n.as_i64())
                                        .unwrap_or(0);

                                    let p = inp + cache_create;
                                    prompt += p;
                                    cached += cache_read;
                                    completion += out;
                                    reasoning += rsn;

                                    total_cost += estimate_cost(&model, "anthropic", p, cache_read, out, rsn);
                                }
                            }
                        }
                    }

                    if prompt > 0 || cached > 0 || completion > 0 {
                        let cost = if total_cost > 0.0 {
                            total_cost
                        } else {
                            estimate_cost(&model, "anthropic", prompt, cached, completion, reasoning)
                        };
                        return CliUsageResult {
                            tokens_prompt: prompt + cached,
                            tokens_completion: completion,
                            tokens_reasoning: reasoning,
                            cost_usd: cost,
                            model,
                            provider: "anthropic".to_string(),
                            estimated: false,
                        };
                    }
                }
            }
        }
        "grok" | "grok-build" | "xai" | "x-ai" => {
            let encoded = workspace_path.replace('/', "%2F");
            let base = home.join(".grok").join("sessions").join(&encoded);
            let mut usage_file = None;

            if let Some(ref sid) = clean_sid {
                let candidate = base.join(sid).join("usage.json");
                if candidate.exists() {
                    usage_file = Some(candidate);
                }
            }

            if usage_file.is_none() && base.is_dir() {
                if let Ok(rd) = std::fs::read_dir(&base) {
                    let mut latest: Option<(std::path::PathBuf, std::time::SystemTime)> = None;
                    for entry in rd.flatten() {
                        let u = entry.path().join("usage.json");
                        if u.exists() {
                            if let Ok(meta) = std::fs::metadata(&u) {
                                let mtime = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                                if latest.as_ref().map(|l| mtime > l.1).unwrap_or(true) {
                                    latest = Some((u, mtime));
                                }
                            }
                        }
                    }
                    usage_file = latest.map(|l| l.0);
                }
            }

            if let Some(uf) = usage_file {
                if let Ok(content) = std::fs::read_to_string(&uf) {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                        let sess = v.get("session").unwrap_or(&v);
                        let inp = sess.get("inputTokens").and_then(|n| n.as_i64()).unwrap_or(0);
                        let out = sess.get("outputTokens").and_then(|n| n.as_i64()).unwrap_or(0);
                        let rsn = sess.get("reasoningTokens").and_then(|n| n.as_i64()).unwrap_or(0);
                        let ticks = sess.get("costUsdTicks").and_then(|n| n.as_f64()).unwrap_or(0.0);
                        let model = sess.get("primaryModelId").and_then(|s| s.as_str()).unwrap_or("grok-4.7").to_string();
                        let cost = if ticks > 0.0 {
                            ticks / 10_000_000_000.0
                        } else {
                            estimate_cost(&model, "xai", inp, 0, out, rsn)
                        };
                        return CliUsageResult {
                            tokens_prompt: inp,
                            tokens_completion: out,
                            tokens_reasoning: rsn,
                            cost_usd: cost,
                            model,
                            provider: "xai".to_string(),
                            estimated: false,
                        };
                    }
                }
            }
        }
        "antigravity" => {
            let mut transcript_path = None;
            if let Some(ref sid) = clean_sid {
                let p1 = home.join(".gemini").join("antigravity-cli").join("brain").join(sid).join(".system_generated").join("logs").join("transcript.jsonl");
                let p2 = home.join(".gemini").join("antigravity-ide").join("brain").join(sid).join(".system_generated").join("logs").join("transcript.jsonl");
                if p1.exists() {
                    transcript_path = Some(p1);
                } else if p2.exists() {
                    transcript_path = Some(p2);
                }
            }

            if transcript_path.is_none() {
                let last_json = home.join(".gemini").join("antigravity-cli").join("cache").join("last_conversations.json");
                if let Ok(content) = std::fs::read_to_string(&last_json) {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(id) = v.get(workspace_path).and_then(|s| s.as_str()) {
                            let p = home.join(".gemini").join("antigravity-cli").join("brain").join(id).join(".system_generated").join("logs").join("transcript.jsonl");
                            if p.exists() {
                                transcript_path = Some(p);
                            }
                        }
                    }
                }
            }

            if let Some(tp) = transcript_path {
                if let Ok(file) = std::fs::File::open(&tp) {
                    use std::io::{BufRead, BufReader};
                    let mut prompt_chars = 0usize;
                    let mut comp_chars = 0usize;
                    let mut model = "gemini-3.7-flash".to_string();
                    let mut total_cost = 0.0;

                    for line in BufReader::new(file).lines().flatten() {
                        if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&line) {
                            let content = obj.get("content").and_then(|c| c.as_str()).unwrap_or("");
                            let typ = obj.get("type").and_then(|t| t.as_str()).unwrap_or("");
                            let src = obj.get("source").and_then(|s| s.as_str()).unwrap_or("");

                            if content.contains("Gemini 3.7 Flash") || content.contains("gemini-3.7-flash") {
                                model = "gemini-3.7-flash".to_string();
                            } else if content.contains("Gemini 2.5 Pro") || content.contains("gemini-2.5-pro") {
                                model = "gemini-2.5-pro".to_string();
                            } else if content.contains("Claude 3.7") || content.contains("claude-3-7") {
                                model = "claude-3-7-sonnet".to_string();
                            }

                            let chars = content.len();
                            if chars > 0 {
                                let tok = (chars as f64 / 3.8).ceil() as i64;
                                if typ == "USER_INPUT" || src == "USER_EXPLICIT" {
                                    prompt_chars += chars;
                                    let prov = if model.contains("claude") { "anthropic" } else { "google" };
                                    total_cost += estimate_cost(&model, prov, tok, 0, 0, 0);
                                } else if typ == "PLANNER_RESPONSE" || src == "MODEL" {
                                    comp_chars += chars;
                                    let prov = if model.contains("claude") { "anthropic" } else { "google" };
                                    total_cost += estimate_cost(&model, prov, 0, 0, tok, 0);
                                }
                            }
                        }
                    }

                    let prompt_tokens = (prompt_chars as f64 / 3.8).ceil() as i64;
                    let comp_tokens = (comp_chars as f64 / 3.8).ceil() as i64;
                    if prompt_tokens > 0 || comp_tokens > 0 {
                        let cost = if total_cost > 0.0 {
                            total_cost
                        } else {
                            estimate_cost(&model, "google", prompt_tokens, 0, comp_tokens, 0)
                        };
                        return CliUsageResult {
                            tokens_prompt: prompt_tokens,
                            tokens_completion: comp_tokens,
                            tokens_reasoning: 0,
                            cost_usd: cost,
                            model,
                            provider: "google".to_string(),
                            estimated: true,
                        };
                    }
                }
            }
        }
        "codex" => {
            let codex_dir = home.join(".codex");
            let mut session_file = None;

            if let Some(ref sid) = clean_sid {
                let sessions_dir = codex_dir.join("sessions");
                if sessions_dir.is_dir() {
                    if let Ok(rd_years) = std::fs::read_dir(&sessions_dir) {
                        for y in rd_years.flatten() {
                            if let Ok(rd_months) = std::fs::read_dir(y.path()) {
                                for m in rd_months.flatten() {
                                    if let Ok(rd_days) = std::fs::read_dir(m.path()) {
                                        for d in rd_days.flatten() {
                                            if let Ok(files) = std::fs::read_dir(d.path()) {
                                                for f in files.flatten() {
                                                    let name = f.file_name().to_string_lossy().to_string();
                                                    if name.contains(sid) && name.ends_with(".jsonl") {
                                                        session_file = Some(f.path());
                                                        break;
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

            if session_file.is_none() {
                let sessions_dir = codex_dir.join("sessions");
                if sessions_dir.is_dir() {
                    let mut latest: Option<(std::path::PathBuf, std::time::SystemTime)> = None;
                    if let Ok(rd_years) = std::fs::read_dir(&sessions_dir) {
                        for y in rd_years.flatten() {
                            if let Ok(rd_months) = std::fs::read_dir(y.path()) {
                                for m in rd_months.flatten() {
                                    if let Ok(rd_days) = std::fs::read_dir(m.path()) {
                                        for d in rd_days.flatten() {
                                            if let Ok(files) = std::fs::read_dir(d.path()) {
                                                for f in files.flatten() {
                                                    let path = f.path();
                                                    if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                                                        if let Ok(meta) = std::fs::metadata(&path) {
                                                            let mtime = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                                                            if latest.as_ref().map(|l| mtime > l.1).unwrap_or(true) {
                                                                latest = Some((path, mtime));
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
                    session_file = latest.map(|l| l.0);
                }
            }

            if let Some(sf) = session_file {
                if let Ok(file) = std::fs::File::open(&sf) {
                    use std::io::{BufRead, BufReader};
                    let mut total_prompt = 0i64;
                    let mut total_cached = 0i64;
                    let mut total_comp = 0i64;
                    let mut total_rsn = 0i64;
                    let mut model = "gpt-5.6-luna".to_string();
                    let mut total_cost = 0.0;

                    for line in BufReader::new(file).lines().flatten() {
                        if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&line) {
                            if let Some(payload) = obj.get("payload") {
                                if let Some(m) = payload.get("model").and_then(|s| s.as_str()) {
                                    model = m.to_string();
                                }
                                if let Some(usage) = payload.get("usage") {
                                    let inp = usage.get("input_tokens").and_then(|n| n.as_i64()).unwrap_or(0);
                                    let cached = usage.get("cached_input_tokens").and_then(|n| n.as_i64()).unwrap_or(0);
                                    let out = usage.get("output_tokens").and_then(|n| n.as_i64()).unwrap_or(0);
                                    let rsn = usage.get("reasoning_output_tokens").and_then(|n| n.as_i64()).unwrap_or(0);

                                    total_prompt += inp;
                                    total_cached += cached;
                                    total_comp += out;
                                    total_rsn += rsn;

                                    total_cost += estimate_cost(&model, "openai", inp, cached, out, rsn);
                                }
                            }
                        }
                    }

                    if total_prompt > 0 || total_comp > 0 {
                        let cost = if total_cost > 0.0 {
                            total_cost
                        } else {
                            estimate_cost(&model, "openai", total_prompt, total_cached, total_comp, total_rsn)
                        };
                        return CliUsageResult {
                            tokens_prompt: total_prompt,
                            tokens_completion: total_comp,
                            tokens_reasoning: total_rsn,
                            cost_usd: cost,
                            model,
                            provider: "openai".to_string(),
                            estimated: false,
                        };
                    }
                }
            }
        }
        _ => {}
    }

    screen_scrape_fallback(cli, tail)
}

fn screen_scrape_fallback(cli: &str, tail: &str) -> CliUsageResult {
    if let Some((prompt, completion, cost)) = parse_cli_usage(tail) {
        let cost = cost.unwrap_or_else(|| estimate_cost(cli, "", prompt, 0, completion, 0));
        return CliUsageResult {
            tokens_prompt: prompt,
            tokens_completion: completion,
            tokens_reasoning: 0,
            cost_usd: cost,
            model: cli.to_string(),
            provider: String::new(),
            estimated: true,
        };
    }

    CliUsageResult::default()
}

fn ev_time(ev: &UsageEvent) -> DateTime<Utc> {
    ev.ended_at
        .as_deref()
        .or(ev.started_at.as_deref())
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(Utc::now)
}

/// A fresh zero row for `id` matching the canonical aggregate shape.
pub fn zero_row(id: &str) -> Value {
    json!({
        "id": id,
        "tokens_prompt_lifetime": 0,
        "tokens_prompt_cached_lifetime": 0,
        "tokens_completion_lifetime": 0,
        "tokens_reasoning_lifetime": 0,
        "cost_lifetime_usd": 0.0,
        "sessions_lifetime": 0,
        "cache_hits_lifetime": 0,
        "analytics_lifetime": {},
        "usage_24h": [],
        "usage_7d": [],
        "usage_30d": [],
        "usage_12m": [],
        "by_model": {},
        "by_provider": {},
        "by_cli": {},
        "by_member": {},
        "by_project": {},
        "by_org": {},
        "heatmap_365d": {},
    })
}

fn add_i(row: &mut Value, key: &str, delta: i64) {
    let cur = row[key].as_i64().unwrap_or(0);
    row[key] = json!(cur + delta);
}

fn add_f(row: &mut Value, key: &str, delta: f64) {
    let cur = row[key].as_f64().unwrap_or(0.0);
    row[key] = json!(cur + delta);
}

/// Increment numeric fields of a nested map entry `map[key]`, creating it from
/// zeros if absent. `extra` sets non-numeric fields (e.g. provider/name) once.
fn bump_map(
    row: &mut Value,
    map: &str,
    key: &str,
    fields: &[(&str, f64)],
    extra: &[(&str, Value)],
) {
    let entry = row[map].as_object_mut().and_then(|m| {
        if !m.contains_key(key) {
            m.insert(key.to_string(), json!({}));
        }
        m.get_mut(key)
    });
    if let Some(e) = entry {
        for (f, d) in fields {
            let cur = e[*f].as_f64().unwrap_or(0.0);
            e[*f] = json!(cur + d);
        }
        for (f, v) in extra {
            if e.get(*f).map(|x| x.is_null()).unwrap_or(true) {
                e[*f] = v.clone();
            }
        }
    }
}

/// Add/merge a bucket into a rolling window array and drop buckets older than
/// `cutoff_key` (lexicographic compare works for the ISO key formats used).
fn bump_window(row: &mut Value, win: &str, key: &str, cutoff_key: &str, fields: &[(&str, f64)]) {
    let arr = match row[win].as_array_mut() {
        Some(a) => a,
        None => {
            row[win] = json!([]);
            row[win].as_array_mut().unwrap()
        }
    };
    if let Some(b) = arr.iter_mut().find(|b| b["date"].as_str() == Some(key)) {
        for (f, d) in fields {
            let cur = b[*f].as_f64().unwrap_or(0.0);
            b[*f] = json!(cur + d);
        }
    } else {
        let mut b = json!({ "date": key });
        for (f, d) in fields {
            b[*f] = json!(*d);
        }
        arr.push(b);
    }
    arr.retain(|b| b["date"].as_str().map(|d| d >= cutoff_key).unwrap_or(false));
    arr.sort_by(|a, b| {
        a["date"]
            .as_str()
            .unwrap_or("")
            .cmp(b["date"].as_str().unwrap_or(""))
    });
}

/// Fold one event into a row. `level` selects which by_* maps to update:
/// "project" -> by_model/provider/cli/member; "org" -> by_project/model/provider;
/// "account" -> by_org/model/provider. `project_name` is an optional label.
pub fn apply_event(row: &mut Value, ev: &UsageEvent, level: &str, project_name: Option<&str>) {
    let t = ev_time(ev);
    let prompt = ev.tokens_prompt;
    let completion = ev.tokens_completion;
    let cached = ev.tokens_prompt_cached;
    let reasoning = ev.tokens_reasoning;
    let cost = ev.cost_usd;
    let total_tokens = prompt + cached + completion + reasoning;
    let cache_hit = if ev.cache_hit_rate > 0.0 || cached > 0 {
        1
    } else {
        0
    };

    // Lifetime counters.
    add_i(row, "tokens_prompt_lifetime", prompt);
    add_i(row, "tokens_prompt_cached_lifetime", cached);
    add_i(row, "tokens_completion_lifetime", completion);
    add_i(row, "tokens_reasoning_lifetime", reasoning);
    add_f(row, "cost_lifetime_usd", cost);
    add_i(row, "sessions_lifetime", 1);
    add_i(row, "cache_hits_lifetime", cache_hit);

    // Year-keyed analytics_lifetime.
    let year = t.format("%Y").to_string();
    {
        let analytics = row["analytics_lifetime"].as_object_mut().unwrap();
        if !analytics.contains_key(&year) {
            analytics.insert(year.clone(), json!({"tokens_prompt":0,"tokens_completion":0,"cost_usd":0.0,"sessions":0,"cache_hits":0}));
        }
        let y = analytics.get_mut(&year).unwrap();
        y["tokens_prompt"] = json!(y["tokens_prompt"].as_i64().unwrap_or(0) + prompt + cached);
        y["tokens_completion"] = json!(y["tokens_completion"].as_i64().unwrap_or(0) + completion);
        y["cost_usd"] = json!(y["cost_usd"].as_f64().unwrap_or(0.0) + cost);
        y["sessions"] = json!(y["sessions"].as_i64().unwrap_or(0) + 1);
        y["cache_hits"] = json!(y["cache_hits"].as_i64().unwrap_or(0) + cache_hit);
    }

    // Rolling windows.
    let win_fields: &[(&str, f64)] = &[
        ("tokens_prompt", (prompt + cached) as f64),
        ("tokens_completion", completion as f64),
        ("cost_usd", cost),
        ("sessions", 1.0),
    ];
    let now = Utc::now();
    bump_window(
        row,
        "usage_24h",
        &t.format("%Y-%m-%dT%H").to_string(),
        &(now - Duration::hours(24))
            .format("%Y-%m-%dT%H")
            .to_string(),
        win_fields,
    );
    bump_window(
        row,
        "usage_7d",
        &t.format("%Y-%m-%d").to_string(),
        &(now - Duration::days(7)).format("%Y-%m-%d").to_string(),
        win_fields,
    );
    bump_window(
        row,
        "usage_30d",
        &t.format("%Y-%m-%d").to_string(),
        &(now - Duration::days(30)).format("%Y-%m-%d").to_string(),
        win_fields,
    );
    bump_window(
        row,
        "usage_12m",
        &t.format("%Y-%m").to_string(),
        &(now - Duration::days(365)).format("%Y-%m").to_string(),
        win_fields,
    );

    // Heatmap (365 days), pruned by date.
    let day = t.format("%Y-%m-%d").to_string();
    let cutoff_day = (now - Duration::days(365)).format("%Y-%m-%d").to_string();
    {
        let hm = row["heatmap_365d"].as_object_mut().unwrap();
        if !hm.contains_key(&day) {
            hm.insert(day.clone(), json!({"cost_usd":0.0,"sessions":0,"tokens":0}));
        }
        let d = hm.get_mut(&day).unwrap();
        d["cost_usd"] = json!(d["cost_usd"].as_f64().unwrap_or(0.0) + cost);
        d["sessions"] = json!(d["sessions"].as_i64().unwrap_or(0) + 1);
        d["tokens"] = json!(d["tokens"].as_i64().unwrap_or(0) + total_tokens);
        hm.retain(|k, _| k.as_str() >= cutoff_day.as_str());
    }

    let model = ev.model.clone().unwrap_or_default();
    let provider = ev.provider.clone().unwrap_or_default();
    let cli = ev.cli.clone().unwrap_or_default();

    // model:provider keyed breakdown (shared by every level).
    if !model.is_empty() {
        let key = format!("{}:{}", model, provider);
        bump_map(
            row,
            "by_model",
            &key,
            &[
                ("tokens_prompt", (prompt + cached) as f64),
                ("tokens_completion", completion as f64),
                ("cost_usd", cost),
                ("sessions", 1.0),
            ],
            &[("provider", json!(provider))],
        );
    }
    if !provider.is_empty() {
        bump_map(
            row,
            "by_provider",
            &provider,
            &[
                ("cost_usd", cost),
                ("sessions", 1.0),
                ("tokens", total_tokens as f64),
            ],
            &[],
        );
    }

    match level {
        "project" => {
            if !cli.is_empty() {
                bump_map(
                    row,
                    "by_cli",
                    &cli,
                    &[("sessions", 1.0), ("cost_usd", cost)],
                    &[],
                );
            }
            if let Some(uid) = ev.user_id.as_deref() {
                bump_map(
                    row,
                    "by_member",
                    uid,
                    &[
                        ("sessions", 1.0),
                        ("cost_usd", cost),
                        ("tokens", total_tokens as f64),
                    ],
                    &[],
                );
            }
        }
        "org" => {
            bump_map(
                row,
                "by_project",
                &ev.project_id,
                &[
                    ("cost_usd", cost),
                    ("sessions", 1.0),
                    ("tokens", total_tokens as f64),
                ],
                &[("name", json!(project_name.unwrap_or("")))],
            );
        }
        "user" => {
            if !cli.is_empty() {
                bump_map(
                    row,
                    "by_cli",
                    &cli,
                    &[("sessions", 1.0), ("cost_usd", cost)],
                    &[],
                );
            }
            bump_map(
                row,
                "by_project",
                &ev.project_id,
                &[
                    ("cost_usd", cost),
                    ("sessions", 1.0),
                    ("tokens", total_tokens as f64),
                ],
                &[("name", json!(project_name.unwrap_or("")))],
            );
            if let Some(org) = ev.org_id.as_deref() {
                bump_map(
                    row,
                    "by_org",
                    org,
                    &[
                        ("cost_usd", cost),
                        ("sessions", 1.0),
                        ("tokens", total_tokens as f64),
                    ],
                    &[],
                );
            }
        }
        "account" => {
            if !cli.is_empty() {
                bump_map(
                    row,
                    "by_cli",
                    &cli,
                    &[("sessions", 1.0), ("cost_usd", cost)],
                    &[],
                );
            }
            bump_map(
                row,
                "by_project",
                &ev.project_id,
                &[
                    ("cost_usd", cost),
                    ("sessions", 1.0),
                    ("tokens", total_tokens as f64),
                ],
                &[("name", json!(project_name.unwrap_or("")))],
            );
            if let Some(org) = ev.org_id.as_deref() {
                bump_map(
                    row,
                    "by_org",
                    org,
                    &[
                        ("cost_usd", cost),
                        ("sessions", 1.0),
                        ("tokens", total_tokens as f64),
                    ],
                    &[],
                );
            }
            if let Some(uid) = ev.user_id.as_deref() {
                bump_map(
                    row,
                    "by_member",
                    uid,
                    &[
                        ("sessions", 1.0),
                        ("cost_usd", cost),
                        ("tokens", total_tokens as f64),
                    ],
                    &[],
                );
            }
        }
        _ => {}
    }
}

// ---- Cloud (Turso shared totals) + local recording ----

const INT_COLS: &[&str] = &[
    "tokens_prompt_lifetime",
    "tokens_prompt_cached_lifetime",
    "tokens_completion_lifetime",
    "tokens_reasoning_lifetime",
    "sessions_lifetime",
    "cache_hits_lifetime",
];
const REAL_COLS: &[&str] = &["cost_lifetime_usd"];
const JSON_COLS: &[&str] = &[
    "analytics_lifetime",
    "usage_24h",
    "usage_7d",
    "usage_30d",
    "usage_12m",
    "by_model",
    "by_provider",
    "by_cli",
    "by_member",
    "by_project",
    "by_org",
    "heatmap_365d",
];

/// Ordered column list (id first), used to keep SELECT/INSERT in lockstep.
fn ordered_cols() -> Vec<&'static str> {
    let mut v = vec!["id"];
    v.extend_from_slice(INT_COLS);
    v.extend_from_slice(REAL_COLS);
    v.extend_from_slice(JSON_COLS);
    v
}

fn now_rfc3339() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

pub async fn ensure_usage_tables(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
) -> Result<(), String> {
    let cols = INT_COLS
        .iter()
        .map(|c| format!("{} INTEGER NOT NULL DEFAULT 0", c))
        .chain(
            REAL_COLS
                .iter()
                .map(|c| format!("{} REAL NOT NULL DEFAULT 0", c)),
        )
        .chain(
            JSON_COLS
                .iter()
                .map(|c| format!("{} TEXT NOT NULL DEFAULT '{{}}'", c)),
        )
        .collect::<Vec<_>>()
        .join(", ");
    for table in ["project_usage", "org_usage", "user_usage", "account_usage"] {
        let sql = format!(
            "CREATE TABLE IF NOT EXISTS {} (id TEXT PRIMARY KEY NOT NULL, {}, \
             last_synced_at TEXT, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
            table, cols
        );
        cloud::turso_execute(client, cfg, &sql, vec![]).await?;
    }
    Ok(())
}

async fn fetch_cloud_row(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
    table: &str,
    id: &str,
) -> Option<Value> {
    let cols = ordered_cols();
    let sql = format!("SELECT {} FROM {} WHERE id = ?", cols.join(", "), table);
    let result = cloud::turso_execute(client, cfg, &sql, vec![Some(id.to_string())])
        .await
        .ok()?;
    let rs = cloud::rows(&result);
    let row = rs.first()?;
    let mut out = json!({ "id": id });
    let mut idx = 1usize; // 0 = id
    for c in INT_COLS {
        out[*c] = json!(cell_text(row, idx).parse::<i64>().unwrap_or(0));
        idx += 1;
    }
    for c in REAL_COLS {
        out[*c] = json!(cell_text(row, idx).parse::<f64>().unwrap_or(0.0));
        idx += 1;
    }
    for c in JSON_COLS {
        out[*c] = serde_json::from_str(&cell_text(row, idx)).unwrap_or(json!({}));
        idx += 1;
    }
    Some(out)
}

pub async fn write_cloud_row(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
    table: &str,
    row: &Value,
) -> Result<(), String> {
    let cols = ordered_cols();
    let placeholders = (0..cols.len()).map(|_| "?").collect::<Vec<_>>().join(", ");
    let updates = cols
        .iter()
        .filter(|c| **c != "id")
        .map(|c| format!("{} = excluded.{}", c, c))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "INSERT INTO {} ({}, updated_at) VALUES ({}, ?) \
         ON CONFLICT(id) DO UPDATE SET {}, updated_at = excluded.updated_at",
        table,
        cols.join(", "),
        placeholders,
        updates
    );
    let mut params: Vec<Option<String>> = Vec::with_capacity(cols.len() + 1);
    params.push(Some(row["id"].as_str().unwrap_or("").to_string()));
    for c in INT_COLS {
        params.push(Some(row[*c].as_i64().unwrap_or(0).to_string()));
    }
    for c in REAL_COLS {
        params.push(Some(row[*c].as_f64().unwrap_or(0.0).to_string()));
    }
    for c in JSON_COLS {
        params.push(Some(row[*c].to_string()));
    }
    params.push(Some(now_rfc3339()));
    cloud::turso_execute(client, cfg, &sql, params).await?;
    Ok(())
}

/// Read-modify-write one aggregate level in Turso, then mirror it into the local
/// display cache. Returns false on any cloud error (so the event stays unsynced).
async fn push_one(
    app: &AppHandle,
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
    table: &str,
    id: &str,
    ev: &UsageEvent,
    level: &str,
    project_name: Option<&str>,
) -> bool {
    let mut row = fetch_cloud_row(client, cfg, table, id)
        .await
        .unwrap_or_else(|| zero_row(id));
    row["id"] = json!(id);
    apply_event(&mut row, ev, level, project_name);
    if write_cloud_row(client, cfg, table, &row).await.is_err() {
        return false;
    }
    let db = app.state::<Db>();
    let _ = db.put_usage_row(table, &row);
    true
}

async fn push_one_remote(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
    table: &str,
    id: &str,
    ev: &UsageEvent,
    level: &str,
    project_name: Option<&str>,
) -> bool {
    let mut row = fetch_cloud_row(client, cfg, table, id)
        .await
        .unwrap_or_else(|| zero_row(id));
    row["id"] = json!(id);
    apply_event(&mut row, ev, level, project_name);
    write_cloud_row(client, cfg, table, &row).await.is_ok()
}

/// Push an event's delta to the shared Turso totals (project -> org -> user -> account)
/// in Central Cloud and UserDB (if connected), and mirror locally.
pub async fn push_event_to_cloud(app: &AppHandle, ev: &UsageEvent) {
    let client = reqwest::Client::new();
    let mut synced_any = false;

    // 1. Central Cloud push
    if let Ok(cfg) = cloud::turso_config() {
        if ensure_usage_tables(&client, &cfg).await.is_ok() {
            let mut central_ok = true;
            if !ev.project_id.is_empty() {
                central_ok &= push_one(
                    app,
                    &client,
                    &cfg,
                    "project_usage",
                    &ev.project_id,
                    ev,
                    "project",
                    None,
                )
                .await;
            }
            if let Some(org) = ev.org_id.clone() {
                central_ok &= push_one(app, &client, &cfg, "org_usage", &org, ev, "org", None).await;
            }
            if let Some(uid) = ev.user_id.clone() {
                central_ok &= push_one(
                    app,
                    &client,
                    &cfg,
                    "user_usage",
                    &uid,
                    ev,
                    "user",
                    None,
                )
                .await;
            }
            central_ok &= push_one(
                app,
                &client,
                &cfg,
                "account_usage",
                "total",
                ev,
                "account",
                None,
            )
            .await;
            if central_ok {
                synced_any = true;
            }
        }
    }

    // 2. UserDB push (if userdb connected, pass all 4 usage tables to UserDB as well!)
    if let Some(user_cfg) = crate::connectors::userdb_config(&app.state::<Db>()) {
        if ensure_usage_tables(&client, &user_cfg).await.is_ok() {
            let mut userdb_ok = true;
            if !ev.project_id.is_empty() {
                userdb_ok &= push_one_remote(
                    &client,
                    &user_cfg,
                    "project_usage",
                    &ev.project_id,
                    ev,
                    "project",
                    None,
                )
                .await;
            }
            if let Some(org) = ev.org_id.clone() {
                userdb_ok &= push_one_remote(
                    &client,
                    &user_cfg,
                    "org_usage",
                    &org,
                    ev,
                    "org",
                    None,
                )
                .await;
            }
            if let Some(uid) = ev.user_id.clone() {
                userdb_ok &= push_one_remote(
                    &client,
                    &user_cfg,
                    "user_usage",
                    &uid,
                    ev,
                    "user",
                    None,
                )
                .await;
            }
            userdb_ok &= push_one_remote(
                &client,
                &user_cfg,
                "account_usage",
                "total",
                ev,
                "account",
                None,
            )
            .await;
            if userdb_ok {
                synced_any = true;
            }
        }
    }

    if synced_any {
        let db = app.state::<Db>();
        let _ = db.mark_usage_synced(&[ev.id.clone()]);
    }
}

/// Pull one shared aggregate row from Turso into the local display cache.
pub async fn pull_usage(
    app: &AppHandle,
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
    table: &str,
    id: &str,
) {
    if ensure_usage_tables(client, cfg).await.is_err() {
        return;
    }
    if let Some(row) = fetch_cloud_row(client, cfg, table, id).await {
        let db = app.state::<Db>();
        let _ = db.put_usage_row(table, &row);
    }
}

fn current_user_id(app: &AppHandle) -> Option<String> {
    let db = app.state::<Db>();
    let json = db.get_cloud_identity()?;
    let v: Value = serde_json::from_str(&json).ok()?;
    v["user"]["id"].as_str().map(String::from)
}

/// Record a usage event: fill missing ids, write the raw local event, and push
/// the delta to the shared cloud totals asynchronously. Display reads local.
pub fn record_usage(app: &AppHandle, mut ev: UsageEvent) {
    if ev.id.is_empty() {
        ev.id = Ulid::new().to_string();
    }
    if ev.ended_at.is_none() {
        ev.ended_at = Some(now_rfc3339());
    }
    if ev.rate_prompt_per_1m.is_none() || ev.rate_completion_per_1m.is_none() || ev.rate_cached_per_1m.is_none() || ev.rate_reasoning_per_1m.is_none() {
        let model = ev.model.as_deref().unwrap_or("");
        let provider = ev.provider.as_deref().unwrap_or("");
        let (rp, rcached, rc, rre) = pricing_for(model, provider);
        if ev.rate_prompt_per_1m.is_none() { ev.rate_prompt_per_1m = Some(rp); }
        if ev.rate_cached_per_1m.is_none() { ev.rate_cached_per_1m = Some(rcached); }
        if ev.rate_completion_per_1m.is_none() { ev.rate_completion_per_1m = Some(rc); }
        if ev.rate_reasoning_per_1m.is_none() { ev.rate_reasoning_per_1m = Some(rre); }
    }
    {
        let db = app.state::<Db>();
        if ev.org_id.is_none() {
            ev.org_id = db.get_project_org(&ev.project_id);
        }
        if ev.user_id.is_none() {
            ev.user_id = current_user_id(app);
        }
        if let Err(e) = db.insert_usage_event(&ev) {
            eprintln!("superconsole usage: insert failed: {}", e);
            return;
        }

        // Fold into local SQLite display tables immediately
        if !ev.project_id.is_empty() {
            let mut row = db
                .get_usage_row("project_usage", &ev.project_id)
                .unwrap_or_else(|| zero_row(&ev.project_id));
            row["id"] = json!(&ev.project_id);
            apply_event(&mut row, &ev, "project", None);
            row["updated_at"] = json!(now_rfc3339());
            let _ = db.put_usage_row("project_usage", &row);
        }
        if let Some(ref org) = ev.org_id {
            let mut row = db
                .get_usage_row("org_usage", org)
                .unwrap_or_else(|| zero_row(org));
            row["id"] = json!(org);
            apply_event(&mut row, &ev, "org", None);
            row["updated_at"] = json!(now_rfc3339());
            let _ = db.put_usage_row("org_usage", &row);
        }
        if let Some(ref uid) = ev.user_id {
            let mut row = db
                .get_usage_row("user_usage", uid)
                .unwrap_or_else(|| zero_row(uid));
            row["id"] = json!(uid);
            apply_event(&mut row, &ev, "user", None);
            row["updated_at"] = json!(now_rfc3339());
            let _ = db.put_usage_row("user_usage", &row);
        }
        {
            let mut row = db
                .get_usage_row("account_usage", "total")
                .unwrap_or_else(|| zero_row("total"));
            row["id"] = json!("total");
            apply_event(&mut row, &ev, "account", None);
            row["updated_at"] = json!(now_rfc3339());
            let _ = db.put_usage_row("account_usage", &row);
        }
    }
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        push_event_to_cloud(&app2, &ev).await;
    });
}

/// Recomputes a local aggregate row from all raw `usage_events` in the SQLite DB
/// for a project, org, user, or account and updates the local display cache table.
pub fn recompute_local_usage(db: &Db, level: &str, id: &str) -> serde_json::Value {
    let table = match level {
        "project" => "project_usage",
        "org" => "org_usage",
        "user" => "user_usage",
        "account" => "account_usage",
        _ => return zero_row(id),
    };

    let events = db.list_usage_events_for_level(level, id);
    let mut row = zero_row(id);
    row["id"] = json!(id);

    for ev in &events {
        let proj_name = if level == "org" || level == "account" || level == "user" {
            db.get_project_name(&ev.project_id)
        } else {
            None
        };
        apply_event(&mut row, ev, level, proj_name.as_deref());
    }

    row["updated_at"] = json!(now_rfc3339());
    let _ = db.put_usage_row(table, &row);
    row
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_clean_session_id() {
        assert_eq!(extract_clean_session_id(None), None);
        assert_eq!(extract_clean_session_id(Some("")), None);
        assert_eq!(
            extract_clean_session_id(Some("5:antigravity:resume:9c3d4f64-fa1e-44f0-b229-0bf79ebbeaac")),
            Some("9c3d4f64-fa1e-44f0-b229-0bf79ebbeaac".to_string())
        );
        assert_eq!(
            extract_clean_session_id(Some("9c3d4f64-fa1e-44f0-b229-0bf79ebbeaac")),
            Some("9c3d4f64-fa1e-44f0-b229-0bf79ebbeaac".to_string())
        );
        assert_eq!(
            extract_clean_session_id(Some("5:claude-1790453789627")),
            Some("1790453789627".to_string())
        );
        assert_eq!(
            extract_clean_session_id(Some("1:antigravity:resume:1790546990520-1790547016522")),
            Some("1790546990520".to_string())
        );
    }

    #[test]
    fn test_estimate_cost_pricing() {
        // Grok-4.7: prompt $2.00 / 1M, completion $10.00 / 1M
        let cost = estimate_cost("grok-4.7", "xai", 1_000_000, 0, 1_000_000, 0);
        assert!((cost - 12.0).abs() < 1e-6);

        // Gemini-3.7-flash: prompt $0.75 / 1M, completion $3.75 / 1M -> $4.50 / 2M
        let cost_gemini = estimate_cost("gemini-3.7-flash", "google", 1_000_000, 0, 1_000_000, 0);
        assert!((cost_gemini - 4.50).abs() < 1e-6);

        // Claude-3-5-sonnet: prompt $3.00 / 1M, completion $15.00 / 1M
        let cost_claude = estimate_cost("claude-3-5-sonnet", "anthropic", 1_000_000, 0, 1_000_000, 0);
        assert!((cost_claude - 18.0).abs() < 1e-6);
    }

    #[test]
    fn test_screen_scrape_fallback() {
        let tail = "Some output... 1500 input, 300 output tokens. Cost: $0.05";
        let res = extract_cli_usage("custom-cli", "/tmp/nonexistent-workspace-path-xyz", None, tail);
        assert_eq!(res.tokens_prompt, 1500);
        assert_eq!(res.tokens_completion, 300);
        assert_eq!(res.cost_usd, 0.05);
    }

    #[test]
    fn test_grok_json_parsing() {
        let json_str = r#"{
            "sessionId": "test-sid",
            "session": {
                "inputTokens": 19349,
                "outputTokens": 201,
                "reasoningTokens": 186,
                "costUsdTicks": 372160000,
                "primaryModelId": "grok-4.7"
            }
        }"#;
        let v: serde_json::Value = serde_json::from_str(json_str).unwrap();
        let sess = v.get("session").unwrap();
        let inp = sess.get("inputTokens").unwrap().as_i64().unwrap();
        let out = sess.get("outputTokens").unwrap().as_i64().unwrap();
        let rsn = sess.get("reasoningTokens").unwrap().as_i64().unwrap();
        let ticks = sess.get("costUsdTicks").unwrap().as_f64().unwrap();
        assert_eq!(inp, 19349);
        assert_eq!(out, 201);
        assert_eq!(rsn, 186);
        assert!((ticks / 10_000_000_000.0 - 0.037216).abs() < 1e-6);
    }

    #[test]
    fn test_apply_event_and_aggregation() {
        let mut row = zero_row("proj_123");
        let ev = UsageEvent {
            project_id: "proj_123".into(),
            session_id: Some("sess_1".into()),
            cli: Some("grok".into()),
            provider: Some("xai".into()),
            model: Some("grok-4.7".into()),
            tokens_prompt: 1000,
            tokens_completion: 200,
            tokens_reasoning: 50,
            cost_usd: 0.005,
            ..Default::default()
        };
        apply_event(&mut row, &ev, "project", None);
        assert_eq!(row["tokens_prompt_lifetime"].as_i64(), Some(1000));
        assert_eq!(row["tokens_completion_lifetime"].as_i64(), Some(200));
        assert_eq!(row["sessions_lifetime"].as_i64(), Some(1));
        assert!((row["cost_lifetime_usd"].as_f64().unwrap() - 0.005).abs() < 1e-6);
    }

    #[test]
    fn test_full_usage_aggregation_pipeline() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::schema::localdb::provision_local_database(&conn).unwrap();
        let db = Db(std::sync::Mutex::new(conn));

        // Insert events across multiple projects, orgs, users, and CLIs
        let events = vec![
            // Event 1: Alex runs Claude in Project Alpha (Org Marketing)
            UsageEvent {
                id: "ev_1".into(),
                project_id: "proj_alpha".into(),
                org_id: Some("org_marketing".into()),
                user_id: Some("user_alex".into()),
                session_id: Some("sess_1".into()),
                cli: Some("claude".into()),
                provider: Some("anthropic".into()),
                model: Some("claude-3-5-sonnet".into()),
                tokens_prompt: 10_000,
                tokens_completion: 2_000,
                tokens_reasoning: 0,
                cost_usd: 0.06,
                ..Default::default()
            },
            // Event 2: Jordan runs Droid in Project Alpha (Org Marketing)
            UsageEvent {
                id: "ev_2".into(),
                project_id: "proj_alpha".into(),
                org_id: Some("org_marketing".into()),
                user_id: Some("user_jordan".into()),
                session_id: Some("sess_2".into()),
                cli: Some("droid".into()),
                provider: Some("google".into()),
                model: Some("gemini-3.7-flash".into()),
                tokens_prompt: 20_000,
                tokens_completion: 4_000,
                tokens_reasoning: 500,
                cost_usd: 0.03,
                ..Default::default()
            },
            // Event 3: Alex runs Grok in Project Beta (Org Engineering)
            UsageEvent {
                id: "ev_3".into(),
                project_id: "proj_beta".into(),
                org_id: Some("org_engineering".into()),
                user_id: Some("user_alex".into()),
                session_id: Some("sess_3".into()),
                cli: Some("grok".into()),
                provider: Some("xai".into()),
                model: Some("grok-4.7".into()),
                tokens_prompt: 30_000,
                tokens_completion: 6_000,
                tokens_reasoning: 1_000,
                cost_usd: 0.12,
                ..Default::default()
            },
        ];

        for ev in &events {
            db.insert_usage_event(ev).unwrap();
        }

        // 1. Verify Project Aggregation (proj_alpha)
        let proj_row = recompute_local_usage(&db, "project", "proj_alpha");
        assert_eq!(proj_row["sessions_lifetime"].as_i64(), Some(2));
        assert_eq!(proj_row["tokens_prompt_lifetime"].as_i64(), Some(30_000));
        assert_eq!(proj_row["tokens_completion_lifetime"].as_i64(), Some(6_000));
        assert!((proj_row["cost_lifetime_usd"].as_f64().unwrap() - 0.09).abs() < 1e-6);
        // by_member in project
        let members = proj_row["by_member"].as_object().unwrap();
        assert!(members.contains_key("user_alex"));
        assert!(members.contains_key("user_jordan"));
        assert!((members["user_alex"]["cost_usd"].as_f64().unwrap() - 0.06).abs() < 1e-6);
        assert!((members["user_jordan"]["cost_usd"].as_f64().unwrap() - 0.03).abs() < 1e-6);
        // by_cli in project
        let clis = proj_row["by_cli"].as_object().unwrap();
        assert!(clis.contains_key("claude"));
        assert!(clis.contains_key("droid"));

        // 2. Verify Org Aggregation (org_marketing)
        let org_row = recompute_local_usage(&db, "org", "org_marketing");
        assert_eq!(org_row["sessions_lifetime"].as_i64(), Some(2));
        assert!((org_row["cost_lifetime_usd"].as_f64().unwrap() - 0.09).abs() < 1e-6);
        let org_projects = org_row["by_project"].as_object().unwrap();
        assert!(org_projects.contains_key("proj_alpha"));

        // 3. Verify User Aggregation (user_alex across proj_alpha and proj_beta)
        let user_row = recompute_local_usage(&db, "user", "user_alex");
        assert_eq!(user_row["sessions_lifetime"].as_i64(), Some(2));
        assert_eq!(user_row["tokens_prompt_lifetime"].as_i64(), Some(40_000)); // 10k + 30k
        assert_eq!(user_row["tokens_completion_lifetime"].as_i64(), Some(8_000)); // 2k + 6k
        assert!((user_row["cost_lifetime_usd"].as_f64().unwrap() - 0.18).abs() < 1e-6); // 0.06 + 0.12
        // by_project in user
        let user_projects = user_row["by_project"].as_object().unwrap();
        assert!(user_projects.contains_key("proj_alpha"));
        assert!(user_projects.contains_key("proj_beta"));
        assert!((user_projects["proj_alpha"]["cost_usd"].as_f64().unwrap() - 0.06).abs() < 1e-6);
        assert!((user_projects["proj_beta"]["cost_usd"].as_f64().unwrap() - 0.12).abs() < 1e-6);
        // by_cli in user
        let user_clis = user_row["by_cli"].as_object().unwrap();
        assert!(user_clis.contains_key("claude"));
        assert!(user_clis.contains_key("grok"));
        // by_org in user
        let user_orgs = user_row["by_org"].as_object().unwrap();
        assert!(user_orgs.contains_key("org_marketing"));
        assert!(user_orgs.contains_key("org_engineering"));

        // 4. Verify Account Aggregation (total across all 3 events)
        let acct_row = recompute_local_usage(&db, "account", "total");
        assert_eq!(acct_row["sessions_lifetime"].as_i64(), Some(3));
        assert_eq!(acct_row["tokens_prompt_lifetime"].as_i64(), Some(60_000)); // 10k + 20k + 30k
        assert_eq!(acct_row["tokens_completion_lifetime"].as_i64(), Some(12_000)); // 2k + 4k + 6k
        assert!((acct_row["cost_lifetime_usd"].as_f64().unwrap() - 0.21).abs() < 1e-6); // 0.06 + 0.03 + 0.12
        // by_member in account
        let acct_members = acct_row["by_member"].as_object().unwrap();
        assert!(acct_members.contains_key("user_alex"));
        assert!(acct_members.contains_key("user_jordan"));
        // by_project in account
        let acct_projects = acct_row["by_project"].as_object().unwrap();
        assert!(acct_projects.contains_key("proj_alpha"));
        assert!(acct_projects.contains_key("proj_beta"));

        // 5. Verify Database Row Persistence
        assert!(db.get_usage_row("project_usage", "proj_alpha").is_some());
        assert!(db.get_usage_row("org_usage", "org_marketing").is_some());
        assert!(db.get_usage_row("user_usage", "user_alex").is_some());
        assert!(db.get_usage_row("account_usage", "total").is_some());
    }
}

