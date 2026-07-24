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
    // Anthropic
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
        model: "claude-3-5-haiku",
        provider: "anthropic",
        prompt_per_1m: 0.80,
        cached_per_1m: 0.08,
        completion_per_1m: 4.0,
        reasoning_per_1m: 4.0,
    },
    ModelPricing {
        model: "claude-opus-4",
        provider: "anthropic",
        prompt_per_1m: 15.0,
        cached_per_1m: 1.50,
        completion_per_1m: 75.0,
        reasoning_per_1m: 75.0,
    },
    // OpenAI
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
    // Google
    ModelPricing {
        model: "gemini-2.0-flash",
        provider: "google",
        prompt_per_1m: 0.10,
        cached_per_1m: 0.025,
        completion_per_1m: 0.40,
        reasoning_per_1m: 0.40,
    },
    ModelPricing {
        model: "gemini-2.5-pro",
        provider: "google",
        prompt_per_1m: 1.25,
        cached_per_1m: 0.31,
        completion_per_1m: 10.0,
        reasoning_per_1m: 10.0,
    },
    ModelPricing {
        model: "gemini-1.5-pro",
        provider: "google",
        prompt_per_1m: 1.25,
        cached_per_1m: 0.31,
        completion_per_1m: 5.0,
        reasoning_per_1m: 5.0,
    },
];

/// Best-effort prefix match on model name (+ provider when given). Returns the
/// per-1M rates; falls back to a mid-range default when unknown.
fn pricing_for(model: &str, provider: &str) -> (f64, f64, f64, f64) {
    let m = model.to_lowercase();
    let p = provider.to_lowercase();
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
    // Optional cost: "($0.142)".
    let cost = lower.find("($").and_then(|i| {
        let rest = &lower[i + 2..];
        let end = rest.find(')')?;
        rest[..end].trim().parse::<f64>().ok()
    });
    Some((prompt, completion, cost))
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
        "account" => {
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
    for table in ["project_usage", "org_usage", "account_usage"] {
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

async fn write_cloud_row(
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

/// Push an event's delta to the shared Turso totals (project -> org -> account)
/// and mirror locally. Marks the event synced only if every level succeeded.
pub async fn push_event_to_cloud(app: &AppHandle, ev: &UsageEvent) {
    let Ok(cfg) = cloud::turso_config() else {
        return;
    };
    let client = reqwest::Client::new();
    if ensure_usage_tables(&client, &cfg).await.is_err() {
        return;
    }
    let mut ok = true;
    if !ev.project_id.is_empty() {
        ok &= push_one(
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
        ok &= push_one(app, &client, &cfg, "org_usage", &org, ev, "org", None).await;
    }
    if let Some(uid) = ev.user_id.clone() {
        ok &= push_one(
            app,
            &client,
            &cfg,
            "account_usage",
            &uid,
            ev,
            "account",
            None,
        )
        .await;
    }
    if ok {
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
    }
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        push_event_to_cloud(&app2, &ev).await;
    });
}
