// SuperConsole MCP / tool-call core.
//
// One ToolRegistry, two delivery surfaces:
//   - native chat (chat.rs) executes tool_use blocks directly
//   - the `superconsole mcp --session <token>` stdio server (mcp_server.rs)
//     exposes the same tools to Claude Code / Droid over JSON-RPC.
//
// Both build a `ToolCtx` (workspace + scope ids + paths) and call
// `execute(db, ctx, name, args)`. Connector credentials are decrypted from the
// local cache only and injected by the executor; the agent never sees them.

use crate::crypto;
use crate::db::Db;

/// Parse `/skill:` / `@skill:` / `/context:` / `@context:` / `/connector:` /
/// `@connector:` / `/agent:` / `@agent:` / `/wiki:` / `@wiki:` /
/// `/memory:` / `@memory:` tokens from text and return a single availability
/// hint line (or None). Both `/` and `@` prefixes are accepted for backward
/// compatibility during the transition; output is always `/kind:name` format.
/// Tokens are NOT expanded or fetched — the agent pulls each resource on
/// demand via MCP tools.
pub fn available_resources_hint(text: &str) -> Option<String> {
    // Each tuple: (prefix_to_scan, canonical_kind)
    // List both `/` and `@` variants so old messages still work.
    let patterns: &[(&str, &str)] = &[
        ("/skill:", "skill"),
        ("@skill:", "skill"),
        ("/context:", "context"),
        ("@context:", "context"),
        ("/connector:", "connector"),
        ("@connector:", "connector"),
        ("/agent:", "agent"),
        ("@agent:", "agent"),
        ("/wiki:", "wiki"),
        ("@wiki:", "wiki"),
        ("/memory:", "memory"),
        ("@memory:", "memory"),
    ];

    // Dedup by "kind:name" key so @skill:foo and /skill:foo collapse to one entry.
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut found: Vec<String> = Vec::new();

    for &(prefix, kind) in patterns {
        let mut rest = text;
        while let Some(idx) = rest.find(prefix) {
            let after = &rest[idx + prefix.len()..];
            let end = after
                .find(|c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '_'))
                .unwrap_or(after.len());
            if end > 0 {
                let key = format!("{}:{}", kind, &after[..end]);
                if seen.insert(key.clone()) {
                    // Emit the canonical /kind:name format going forward.
                    found.push(format!("/{}", key));
                }
            }
            rest = &after[end..];
        }
    }

    if found.is_empty() {
        return None;
    }
    Some(format!(
        "Available: {} — fetch with the matching MCP tools (skill_view, context_read, wiki_read, memory_read, connector tools, sc_list_agents) when needed.",
        found.join(", ")
    ))
}
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

const TOKEN_TTL_SECS: i64 = 60 * 60 * 24 * 30; // 30d buffer; config is regenerated per session.

/// Resolved session scope shared by both surfaces. Serialized into the session
/// token so the headless stdio server needs no Tauri AppHandle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCtx {
    pub workspace_id: i64,
    pub ws_path: String,
    pub db_path: String,
    pub user_id: Option<String>,
    pub project_id: Option<String>,
    pub org_id: Option<String>,
    #[serde(default)]
    pub exp: i64,
}

// --- session token (encrypted, reuses the connector/LLM AES key) ---

pub fn encode_session_token(ctx: &ToolCtx) -> Result<String, String> {
    let mut c = ctx.clone();
    c.exp = chrono::Utc::now().timestamp() + TOKEN_TTL_SECS;
    crypto::encrypt(&serde_json::to_string(&c).map_err(|e| e.to_string())?)
}

pub fn decode_session_token(token: &str) -> Result<ToolCtx, String> {
    let plain = crypto::decrypt(token)?;
    let ctx: ToolCtx = serde_json::from_str(&plain).map_err(|e| e.to_string())?;
    if ctx.exp != 0 && chrono::Utc::now().timestamp() > ctx.exp {
        return Err("session token expired".into());
    }
    Ok(ctx)
}

// --- canonical tool spec ---

#[derive(Debug, Clone)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub parameters: Value, // JSON Schema (object)
}

impl ToolSpec {
    fn new(name: &str, description: &str, parameters: Value) -> Self {
        ToolSpec {
            name: name.into(),
            description: description.into(),
            parameters,
        }
    }
    pub fn to_openai(&self) -> Value {
        json!({
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            }
        })
    }
    pub fn to_anthropic(&self) -> Value {
        json!({
            "name": self.name,
            "description": self.description,
            "input_schema": self.parameters,
        })
    }
    pub fn to_mcp(&self) -> Value {
        json!({
            "name": self.name,
            "description": self.description,
            "inputSchema": self.parameters,
        })
    }
}

fn obj(props: Value, required: &[&str]) -> Value {
    json!({
        "type": "object",
        "properties": props,
        "required": required,
    })
}

// --- catalog ---

/// Tools that are always present regardless of project state.
fn always_specs() -> Vec<ToolSpec> {
    vec![
        ToolSpec::new(
            "sc_list_available_tools",
            "List what is available in this SuperConsole project: connected connectors, active skills, and whether memory/wiki exist. Call this first to understand your capabilities.",
            obj(json!({}), &[]),
        ),
        ToolSpec::new(
            "sc_add_inbox_item",
            "Send output to the SuperConsole inbox for the user. Use requires_approval to pause for a human decision (human-in-the-loop).",
            obj(
                json!({
                    "title": {"type": "string", "description": "Short title"},
                    "content": {"type": "string", "description": "Body / output"},
                    "requires_approval": {"type": "boolean", "description": "Mark as awaiting user approval"}
                }),
                &["content"],
            ),
        ),
        ToolSpec::new(
            "sc_update_heartbeat",
            "Overwrite the project HEARTBEAT.md with the current state so other agents/sessions see fresh context.",
            obj(json!({"data": {"type": "string", "description": "Markdown state"}}), &["data"]),
        ),
        ToolSpec::new(
            "sc_list_agents",
            "List the file-defined agents in this project (.superconsole/agents): name, description, schedule, and triggers.",
            obj(json!({}), &[]),
        ),
        ToolSpec::new(
            "sc_log_usage",
            "Record token usage for a tracked sub-task (feeds usage monitoring).",
            obj(
                json!({
                    "tokens_in": {"type": "integer"},
                    "tokens_out": {"type": "integer"},
                    "model": {"type": "string"},
                    "provider": {"type": "string"}
                }),
                &[],
            ),
        ),
    ]
}

/// Skills / memory / wiki context tools (deferred, fetched on demand).
fn context_specs() -> Vec<ToolSpec> {
    vec![
        ToolSpec::new("skill_list", "List the skills active for this project (name + description).", obj(json!({}), &[])),
        ToolSpec::new(
            "skill_view",
            "Load the full content of one skill by name.",
            obj(json!({"name": {"type": "string"}}), &["name"]),
        ),
        ToolSpec::new(
            "memory_read",
            "Search project memory and return matching entries. Omit query to return all.",
            obj(json!({"query": {"type": "string"}}), &[]),
        ),
        ToolSpec::new("memory_list", "List all project memory entries.", obj(json!({}), &[])),
        ToolSpec::new(
            "memory_write",
            "Save new knowledge to project memory.",
            obj(
                json!({
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                    "category": {"type": "string", "enum": ["preferences", "decisions", "facts", "patterns", "recent"], "description": "Defaults to facts."},
                    "tags": {"type": "array", "items": {"type": "string"}}
                }),
                &["title", "content"],
            ),
        ),
        ToolSpec::new("wiki_list", "List all wiki pages for this project (slug + title + summary).", obj(json!({}), &[])),
        ToolSpec::new(
            "wiki_read",
            "Read one wiki page by slug.",
            obj(json!({"page": {"type": "string"}}), &["page"]),
        ),
        ToolSpec::new(
            "wiki_suggest",
            "Propose a new wiki page. Goes to the inbox for user approval.",
            obj(json!({"title": {"type": "string"}, "content": {"type": "string"}}), &["title", "content"]),
        ),
        ToolSpec::new(
            "context_list",
            "List the project's on-demand context files (brand, voice, style-guide, etc.) by slug. Fetch a file with context_read when relevant.",
            obj(json!({}), &[]),
        ),
        ToolSpec::new(
            "context_read",
            "Read one project context file by slug.",
            obj(json!({"slug": {"type": "string"}}), &["slug"]),
        ),
        ToolSpec::new(
            "context_search",
            "Search across the project context files and return matching lines.",
            obj(json!({"query": {"type": "string"}}), &["query"]),
        ),
    ]
}

/// The single generic credential-aware connector tool. Only present when at
/// least one connector is connected for this project's scopes.
fn connector_spec(services: &[String]) -> Option<ToolSpec> {
    if services.is_empty() {
        return None;
    }
    Some(ToolSpec::new(
        "connector_request",
        "Make an authenticated HTTP request to a connected service. SuperConsole injects the project's credentials and base URL; you never see them. Provide path relative to the service API root (or a full URL).",
        obj(
            json!({
                "service": {"type": "string", "enum": services, "description": "Connected service id"},
                "method": {"type": "string", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"], "description": "Defaults to GET"},
                "path": {"type": "string", "description": "API path, e.g. /repos/o/r/issues"},
                "query": {"type": "object", "description": "Query string params"},
                "headers": {"type": "object", "description": "Extra request headers"},
                "body": {"description": "JSON request body"}
            }),
            &["service", "path"],
        ),
    ))
}

/// Dedicated web-search tool, present only when the web_search connector is set.
fn web_search_spec() -> ToolSpec {
    ToolSpec::new(
        "web_search",
        "Search the web and return the top results (title, url, snippet) plus a short answer. Uses the project's connected web search provider.",
        obj(
            json!({
                "query": {"type": "string"},
                "max_results": {"type": "integer", "description": "Default 5, max 10"}
            }),
            &["query"],
        ),
    )
}

fn bridge_specs() -> Vec<ToolSpec> {
    vec![
        ToolSpec::new(
            "sc_search",
            "Search the catalog of available tools by keyword. Returns names + descriptions.",
            obj(
                json!({"query": {"type": "string"}, "limit": {"type": "integer"}}),
                &["query"],
            ),
        ),
        ToolSpec::new(
            "sc_describe",
            "Get the full input schema for one tool by name.",
            obj(json!({"name": {"type": "string"}}), &["name"]),
        ),
        ToolSpec::new(
            "sc_call",
            "Execute any available tool by name with the given arguments.",
            obj(
                json!({"name": {"type": "string"}, "arguments": {"type": "object"}}),
                &["name"],
            ),
        ),
    ]
}

/// The full catalog of concrete tools available for this project (no bridge).
pub fn full_catalog(db: &Db, ctx: &ToolCtx) -> Vec<ToolSpec> {
    let services = crate::connectors::connected_service_ids(
        db,
        ctx.user_id.as_deref(),
        ctx.org_id.as_deref(),
        ctx.project_id.as_deref(),
    );
    let mut out = always_specs();
    out.extend(context_specs());
    // web_search has a dedicated tool, so keep it out of the generic passthrough.
    let rest: Vec<String> = services
        .iter()
        .filter(|s| *s != "web_search")
        .cloned()
        .collect();
    if let Some(c) = connector_spec(&rest) {
        out.push(c);
    }
    if services.iter().any(|s| s == "web_search") {
        out.push(web_search_spec());
    }
    out
}

fn estimate_tokens(specs: &[ToolSpec]) -> usize {
    let chars: usize = specs
        .iter()
        .map(|s| s.name.len() + s.description.len() + s.parameters.to_string().len())
        .sum();
    chars / 4
}

/// Auto schema mode: expose the full catalog directly when its schemas are small
/// relative to the model context window; otherwise switch to the 3 bridge tools
/// (progressive disclosure) plus the always-loaded tools.
pub fn exposed_specs(db: &Db, ctx: &ToolCtx, context_window: usize) -> (Vec<ToolSpec>, bool) {
    let catalog = full_catalog(db, ctx);
    let threshold = (context_window as f64 * 0.10) as usize;
    if estimate_tokens(&catalog) < threshold {
        (catalog, false)
    } else {
        let mut out = always_specs();
        out.extend(bridge_specs());
        (out, true)
    }
}

/// BM25-lite keyword scoring (term overlap, length-normalized) over the catalog.
pub fn search_catalog(db: &Db, ctx: &ToolCtx, query: &str, limit: usize) -> Vec<Value> {
    let q: Vec<String> = query
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| t.len() > 1)
        .map(|t| t.to_string())
        .collect();
    let mut scored: Vec<(f64, &ToolSpec)> = Vec::new();
    let catalog = full_catalog(db, ctx);
    for spec in &catalog {
        let hay = format!("{} {}", spec.name, spec.description).to_lowercase();
        let len = hay.split_whitespace().count().max(1) as f64;
        let mut score = 0.0;
        for term in &q {
            if hay.contains(term) {
                score += 1.0 / (1.0 + (len / 12.0).ln().max(0.0));
            }
        }
        if score > 0.0 {
            scored.push((score, spec));
        }
    }
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored
        .into_iter()
        .take(limit.max(1))
        .map(|(s, spec)| json!({"name": spec.name, "description": spec.description, "score": s}))
        .collect()
}

fn describe(db: &Db, ctx: &ToolCtx, name: &str) -> Option<Value> {
    full_catalog(db, ctx)
        .into_iter()
        .find(|s| s.name == name)
        .map(|s| s.to_mcp())
}

// --- connector HTTP profiles (base URL + credential injection) ---

struct HttpProfile {
    base: String,
    headers: Vec<(String, String)>,
    query: Vec<(String, String)>,
}

fn f<'a>(fields: &'a HashMap<String, String>, k: &str) -> &'a str {
    fields.get(k).map(|s| s.as_str()).unwrap_or("")
}

fn http_profile(service: &str, fields: &HashMap<String, String>) -> Result<HttpProfile, String> {
    let bearer = |base: &str, key: &str| HttpProfile {
        base: base.into(),
        headers: vec![("Authorization".into(), format!("Bearer {}", key))],
        query: vec![],
    };
    Ok(match service {
        "github" => bearer("https://api.github.com", f(fields, "token")),
        "slack" => bearer("https://slack.com/api", f(fields, "bot_token")),
        "stripe" => bearer("https://api.stripe.com", f(fields, "api_key")),
        "beehiiv" => bearer("https://api.beehiiv.com", f(fields, "api_key")),
        "linear" => HttpProfile {
            base: "https://api.linear.app".into(),
            headers: vec![("Authorization".into(), f(fields, "api_key").into())],
            query: vec![],
        },
        "airtable" => bearer("https://api.airtable.com", f(fields, "api_key")),
        "notion" => HttpProfile {
            base: "https://api.notion.com".into(),
            headers: vec![
                (
                    "Authorization".into(),
                    format!("Bearer {}", f(fields, "api_key")),
                ),
                ("Notion-Version".into(), "2022-06-28".into()),
            ],
            query: vec![],
        },
        "telegram" => HttpProfile {
            base: format!("https://api.telegram.org/bot{}", f(fields, "bot_token")),
            headers: vec![],
            query: vec![],
        },
        "shopify" => HttpProfile {
            base: format!("https://{}/admin/api/2024-01", f(fields, "shop_domain")),
            headers: vec![("X-Shopify-Access-Token".into(), f(fields, "api_key").into())],
            query: vec![],
        },
        "supabase" => HttpProfile {
            base: f(fields, "url").trim_end_matches('/').into(),
            headers: vec![
                ("apikey".into(), f(fields, "service_role_key").into()),
                (
                    "Authorization".into(),
                    format!("Bearer {}", f(fields, "service_role_key")),
                ),
            ],
            query: vec![],
        },
        "turso" => HttpProfile {
            base: f(fields, "url").trim_end_matches('/').into(),
            headers: vec![(
                "Authorization".into(),
                format!("Bearer {}", f(fields, "auth_token")),
            )],
            query: vec![],
        },
        "buffer" => HttpProfile {
            base: "https://api.bufferapp.com".into(),
            headers: vec![],
            query: vec![("access_token".into(), f(fields, "access_token").into())],
        },
        "convertkit" => HttpProfile {
            base: "https://api.convertkit.com".into(),
            headers: vec![],
            query: vec![("api_key".into(), f(fields, "api_key").into())],
        },
        "gmail" => HttpProfile {
            base: "https://gmail.googleapis.com".into(),
            headers: vec![(
                "Authorization".into(),
                format!("Bearer {}", f(fields, "api_key")),
            )],
            query: vec![],
        },
        "google_drive" => HttpProfile {
            base: "https://www.googleapis.com/drive/v3".into(),
            headers: vec![(
                "Authorization".into(),
                format!("Bearer {}", f(fields, "api_key")),
            )],
            query: vec![],
        },
        "ga4" => HttpProfile {
            base: "https://www.google-analytics.com".into(),
            headers: vec![],
            query: vec![
                ("api_secret".into(), f(fields, "api_secret").into()),
                ("measurement_id".into(), f(fields, "measurement_id").into()),
            ],
        },
        other => return Err(format!("no HTTP profile for service '{}'", other)),
    })
}

async fn connector_request(db: &Db, ctx: &ToolCtx, args: &Value) -> Result<Value, String> {
    let service = args["service"].as_str().ok_or("service is required")?;
    let path = args["path"].as_str().ok_or("path is required")?;
    let method = args["method"].as_str().unwrap_or("GET").to_uppercase();

    let fields = crate::connectors::resolve_connector_fields(
        db,
        service,
        ctx.user_id.as_deref(),
        ctx.org_id.as_deref(),
        ctx.project_id.as_deref(),
    )
    .ok_or_else(|| format!("connector '{}' is not connected for this project", service))?;

    let profile = http_profile(service, &fields)?;
    let url = if path.starts_with("http://") || path.starts_with("https://") {
        path.to_string()
    } else {
        format!(
            "{}/{}",
            profile.base.trim_end_matches('/'),
            path.trim_start_matches('/')
        )
    };

    let client = reqwest::Client::new();
    let m = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    let mut req = client.request(m, &url);

    for (k, v) in &profile.headers {
        req = req.header(k.as_str(), v.as_str());
    }
    for (k, v) in &profile.query {
        req = req.query(&[(k.as_str(), v.as_str())]);
    }
    if let Some(extra) = args["headers"].as_object() {
        for (k, v) in extra {
            if let Some(s) = v.as_str() {
                req = req.header(k.as_str(), s);
            }
        }
    }
    if let Some(q) = args["query"].as_object() {
        let pairs: Vec<(String, String)> = q
            .iter()
            .map(|(k, v)| {
                (
                    k.clone(),
                    v.as_str()
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| v.to_string()),
                )
            })
            .collect();
        req = req.query(&pairs);
    }
    if !args["body"].is_null() {
        req = req.json(&args["body"]);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("request failed: {}", e))?;
    let status = resp.status().as_u16();
    let ok = resp.status().is_success();
    let text = resp.text().await.unwrap_or_default();
    let body: Value = serde_json::from_str(&text).unwrap_or_else(|_| {
        let t: String = text.chars().take(8000).collect();
        Value::String(t)
    });
    Ok(json!({"status": status, "ok": ok, "body": body}))
}

// --- execution ---

fn ok_text(v: impl Serialize) -> Result<Value, String> {
    serde_json::to_value(v).map_err(|e| e.to_string())
}

pub async fn execute(db: &Db, ctx: &ToolCtx, name: &str, args: Value) -> Result<Value, String> {
    let ws = ctx.ws_path.as_str();

    // Before-MCP hook — non-blocking, 10s timeout.
    // Exit code 1 from the hook aborts the tool (safety gate).
    let tool_input_json = serde_json::to_string(&args).unwrap_or_default();
    if !crate::hooks::run_before_mcp_hook(ws, name, &tool_input_json) {
        return Err(format!("Tool '{}' blocked by before-mcp hook", name));
    }

    match name {
        "sc_list_available_tools" => {
            let services = crate::connectors::connected_service_ids(
                db,
                ctx.user_id.as_deref(),
                ctx.org_id.as_deref(),
                ctx.project_id.as_deref(),
            );
            let skills: Vec<String> = crate::skills::workspace_skills(ws)
                .into_iter()
                .map(|s| s.name)
                .collect();
            let memory = crate::memory::read_all(ws).len();
            let wiki = crate::wiki::pages(ws).len();
            ok_text(json!({
                "connectors": services,
                "skills": skills,
                "memory_entries": memory,
                "wiki_pages": wiki,
            }))
        }
        "sc_add_inbox_item" => {
            let content = args["content"].as_str().ok_or("content is required")?;
            let title = args["title"].as_str().unwrap_or("Agent message");
            let approval = args["requires_approval"].as_bool().unwrap_or(false);
            let title = if approval {
                format!("[approval] {}", title)
            } else {
                title.to_string()
            };
            let id = db.add_inbox_item(ctx.workspace_id, None, &title, content)?;
            ok_text(json!({"inbox_id": id}))
        }
        "sc_update_heartbeat" => {
            let data = args["data"].as_str().ok_or("data is required")?;
            std::fs::write(std::path::Path::new(ws).join("HEARTBEAT.md"), data)
                .map_err(|e| e.to_string())?;
            ok_text(json!({"updated": true}))
        }
        "sc_list_agents" => {
            let agents = crate::agents::list_agents(ws);
            let list: Vec<Value> = agents
                .iter()
                .map(|a| {
                    json!({
                        "name": a.name,
                        "description": a.description,
                        "skills": a.skills,
                        "connectors": a.connectors,
                        "context": a.context,
                    })
                })
                .collect();
            ok_text(json!({ "agents": list }))
        }
        "sc_log_usage" => {
            let Some(project_id) = ctx.project_id.clone() else {
                return ok_text(json!({"logged": false, "reason": "no cloud project"}));
            };
            let tokens_prompt = args["tokens_in"].as_i64().unwrap_or(0);
            let tokens_completion = args["tokens_out"].as_i64().unwrap_or(0);
            let model = args["model"].as_str().unwrap_or("").to_string();
            let provider = args["provider"].as_str().unwrap_or("").to_string();
            let cost = crate::usage::estimate_cost(
                &model,
                &provider,
                tokens_prompt,
                0,
                tokens_completion,
                0,
            );
            let ev = crate::db::UsageEvent {
                project_id,
                org_id: ctx.org_id.clone(),
                user_id: ctx.user_id.clone(),
                model: if model.is_empty() { None } else { Some(model) },
                provider: if provider.is_empty() {
                    None
                } else {
                    Some(provider)
                },
                cli: Some("chat".to_string()),
                tokens_prompt,
                tokens_completion,
                cost_usd: cost,
                ..Default::default()
            };
            // The tool path has no AppHandle: persist locally now; the next
            // startup/update sync pushes the delta to the shared cloud totals.
            db.insert_usage_event(&crate::db::UsageEvent {
                id: ulid::Ulid::new().to_string(),
                ended_at: Some(chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()),
                ..ev
            })?;
            ok_text(json!({"logged": true}))
        }
        "skill_list" => {
            let skills: Vec<Value> = crate::skills::workspace_skills(ws)
                .into_iter()
                .map(|s| json!({"name": s.name, "description": s.description}))
                .collect();
            ok_text(skills)
        }
        "skill_view" => {
            let name = args["name"].as_str().ok_or("name is required")?;
            let body = crate::skills::workspace_skill_body(ws, name)
                .ok_or_else(|| format!("skill '{}' not found", name))?;
            ok_text(json!({"name": name, "content": body}))
        }
        "memory_read" => {
            let q = args["query"].as_str().unwrap_or("");
            ok_text(crate::memory::search_files(ws, q))
        }
        "memory_list" => ok_text(crate::memory::read_all(ws)),
        "memory_write" => {
            let title = args["title"].as_str().ok_or("title is required")?;
            let content = args["content"].as_str().ok_or("content is required")?;
            let category = args["category"].as_str().unwrap_or("facts");
            let tags: Vec<String> = args["tags"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|t| t.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            ok_text(crate::memory::upsert_file(
                ws, category, title, content, tags,
            )?)
        }
        "wiki_list" => {
            let pages: Vec<Value> = crate::wiki::pages(ws)
                .into_iter()
                .map(|p| json!({"slug": p.slug, "title": p.title, "summary": p.summary}))
                .collect();
            ok_text(pages)
        }
        "wiki_read" => {
            let page = args["page"].as_str().ok_or("page is required")?;
            let body = crate::wiki::page_body(ws, page)
                .ok_or_else(|| format!("wiki page '{}' not found", page))?;
            ok_text(json!({"page": page, "content": body}))
        }
        "wiki_suggest" => {
            let title = args["title"].as_str().ok_or("title is required")?;
            let content = args["content"].as_str().ok_or("content is required")?;
            let id = db.add_inbox_item(
                ctx.workspace_id,
                None,
                &format!("[wiki suggestion] {}", title),
                content,
            )?;
            ok_text(json!({"inbox_id": id, "status": "pending_approval"}))
        }
        "context_list" => {
            let files: Vec<Value> = crate::context::scan(ws)
                .into_iter()
                .map(|f| json!({"slug": f.slug, "name": f.name, "size_bytes": f.size_bytes}))
                .collect();
            ok_text(files)
        }
        "context_read" => {
            let slug = args["slug"].as_str().ok_or("slug is required")?;
            let body = crate::context::read_body(ws, slug)
                .ok_or_else(|| format!("context file '{}' not found", slug))?;
            ok_text(json!({"slug": slug, "content": body}))
        }
        "context_search" => {
            let query = args["query"].as_str().unwrap_or("");
            let matches: Vec<Value> = crate::context::search(ws, query)
                .into_iter()
                .map(|(slug, line)| json!({"slug": slug, "line": line}))
                .collect();
            ok_text(matches)
        }
        "web_search" => {
            let query = args["query"].as_str().ok_or("query is required")?;
            let max = args["max_results"].as_u64().unwrap_or(5).min(10);
            let fields = crate::connectors::resolve_connector_fields(
                db,
                "web_search",
                ctx.user_id.as_deref(),
                ctx.org_id.as_deref(),
                ctx.project_id.as_deref(),
            )
            .ok_or("web search is not connected for this project")?;
            let client = reqwest::Client::new();
            let resp = client
                .post("https://api.tavily.com/search")
                .json(&json!({
                    "api_key": f(&fields, "api_key"),
                    "query": query,
                    "max_results": max
                }))
                .send()
                .await
                .map_err(|e| format!("request failed: {}", e))?;
            let v: Value = resp.json().await.map_err(|e| e.to_string())?;
            let results: Vec<Value> = v["results"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .map(|r| json!({"title": r["title"], "url": r["url"], "snippet": r["content"]}))
                        .collect()
                })
                .unwrap_or_default();
            ok_text(json!({"query": query, "answer": v["answer"], "results": results}))
        }
        "connector_request" => connector_request(db, ctx, &args).await,
        "sc_search" => {
            let query = args["query"].as_str().unwrap_or("");
            let limit = args["limit"].as_u64().unwrap_or(8) as usize;
            ok_text(search_catalog(db, ctx, query, limit))
        }
        "sc_describe" => {
            let name = args["name"].as_str().ok_or("name is required")?;
            describe(db, ctx, name).ok_or_else(|| format!("tool '{}' not found", name))
        }
        "sc_call" => {
            let inner = args["name"].as_str().ok_or("name is required")?.to_string();
            let inner_args = args.get("arguments").cloned().unwrap_or_else(|| json!({}));
            Box::pin(execute(db, ctx, &inner, inner_args)).await
        }
        other => Err(format!("unknown tool '{}'", other)),
    }
}

/// Rough per-model context window for auto schema mode.
pub fn context_window(model: &str) -> usize {
    let m = model.to_lowercase();
    if m.contains("claude") {
        200_000
    } else if m.contains("gpt-4o") || m.contains("o1") || m.contains("o3") {
        128_000
    } else if m.contains("gemini") {
        1_000_000
    } else {
        128_000
    }
}

/// Build a ToolCtx from a live Tauri app (native chat surface).
pub fn native_ctx(app: &tauri::AppHandle, workspace_id: i64) -> Option<ToolCtx> {
    use tauri::Manager;
    let db = app.state::<Db>();
    let ws = db.get_workspace(workspace_id).ok()?;
    let project_id = db.get_workspace_project_id(workspace_id);
    let org_id = project_id.as_deref().and_then(|p| db.get_project_org(p));
    let user_id = db
        .get_cloud_identity()
        .and_then(|j| serde_json::from_str::<Value>(&j).ok())
        .and_then(|v| v["user"]["id"].as_str().map(String::from));
    let db_path = app
        .path()
        .app_data_dir()
        .ok()
        .map(|d| d.join("superconsole.db").to_string_lossy().to_string())
        .unwrap_or_default();
    Some(ToolCtx {
        workspace_id,
        ws_path: ws.path,
        db_path,
        user_id,
        project_id,
        org_id,
        exp: 0,
    })
}

/// Merge the `superconsole` stdio server into an `mcpServers` config file
/// (Claude `.mcp.json`, Droid `.factory/mcp.json`), preserving any other
/// servers already present and refreshing our entry with a fresh token.
fn merge_mcp_servers(path: &std::path::Path, exe: &str, token: &str) -> Result<(), String> {
    merge_mcp_servers_trust(path, exe, token, false)
}

/// Same as `merge_mcp_servers` but with an optional `trust: true` flag
/// (Antigravity uses it to bypass per-tool approval prompts).
fn merge_mcp_servers_trust(
    path: &std::path::Path,
    exe: &str,
    token: &str,
    trust: bool,
) -> Result<(), String> {
    let mut root: Value = std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}));
    if !root.is_object() {
        root = json!({});
    }
    let obj = root.as_object_mut().unwrap();
    let servers = obj.entry("mcpServers").or_insert_with(|| json!({}));
    if !servers.is_object() {
        *servers = json!({});
    }
    let mut entry = json!({ "command": exe, "args": ["mcp", "--session", token], "env": {} });
    if trust {
        entry["trust"] = json!(true);
    }
    servers
        .as_object_mut()
        .unwrap()
        .insert("superconsole".into(), entry);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(
        path,
        serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

/// Pre-approve the project `.mcp.json` `superconsole` server for Claude Code so
/// no manual approval prompt appears (`.claude/settings.local.json`).
fn claude_preapprove(ws_path: &str) -> Result<(), String> {
    let dir = std::path::Path::new(ws_path).join(".claude");
    std::fs::create_dir_all(&dir).ok();
    let path = dir.join("settings.local.json");
    let mut settings: Value = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}));
    if !settings.is_object() {
        settings = json!({});
    }
    let obj = settings.as_object_mut().unwrap();
    let arr = obj
        .entry("enabledMcpjsonServers")
        .or_insert_with(|| json!([]));
    match arr.as_array_mut() {
        Some(list) => {
            if !list.iter().any(|v| v.as_str() == Some("superconsole")) {
                list.push(json!("superconsole"));
            }
        }
        None => *arr = json!(["superconsole"]),
    }
    std::fs::write(
        &path,
        serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

/// Append paths to `.git/info/exclude` so the generated, token-bearing config
/// files never get committed (without touching a tracked `.gitignore`).
fn git_exclude(ws_path: &str, entries: &[&str]) {
    let exclude = std::path::Path::new(ws_path)
        .join(".git")
        .join("info")
        .join("exclude");
    if !exclude.exists() {
        return;
    }
    if let Ok(cur) = std::fs::read_to_string(&exclude) {
        let mut body = cur.trim_end().to_string();
        let mut changed = false;
        for e in entries {
            if !cur.lines().any(|l| l.trim() == *e) {
                body.push_str(&format!("\n{}", e));
                changed = true;
            }
        }
        if changed {
            let _ = std::fs::write(&exclude, format!("{}\n", body));
        }
    }
}

/// Write the SuperConsole MCP server config for every supported CLI so sessions
/// launched from the app reach skills/memory/wiki/connector tools without a
/// manual approval prompt. Regenerated per session with a fresh token.
pub fn write_mcp_config(
    ctx: &ToolCtx,
    connector_mcps: &[crate::connectors::ConnectorMcp],
) -> Result<String, String> {
    let ws_path = ctx.ws_path.clone();
    let token = encode_session_token(ctx)?;
    let exe = std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "superconsole".into());

    // Claude Code: project-scoped .mcp.json + local pre-approval.
    let claude_path = std::path::Path::new(&ws_path).join(".mcp.json");
    merge_mcp_servers(&claude_path, &exe, &token)?;
    merge_connector_mcps(&claude_path, connector_mcps);
    let _ = claude_preapprove(&ws_path);

    // Factory Droid: project-scoped .factory/mcp.json (auto-loaded, no prompt).
    let droid_path = std::path::Path::new(&ws_path)
        .join(".factory")
        .join("mcp.json");
    let _ = merge_mcp_servers(&droid_path, &exe, &token);
    merge_connector_mcps(&droid_path, connector_mcps);

    git_exclude(
        &ws_path,
        &[
            ".mcp.json",
            ".claude/settings.local.json",
            ".factory/mcp.json",
        ],
    );
    Ok(claude_path.to_string_lossy().to_string())
}

/// Reconcile connector-bundled MCP servers into an `mcpServers` file: remove the
/// keys we manage, then add the currently-connected ones. Preserves the
/// `superconsole` entry and anything else already present.
fn merge_connector_mcps(path: &std::path::Path, mcps: &[crate::connectors::ConnectorMcp]) {
    let mut root: Value = std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}));
    if !root.is_object() {
        root = json!({});
    }
    let obj = root.as_object_mut().unwrap();
    let servers = obj.entry("mcpServers").or_insert_with(|| json!({}));
    if !servers.is_object() {
        *servers = json!({});
    }
    let map = servers.as_object_mut().unwrap();
    for key in crate::connectors::CONNECTOR_MCP_KEYS {
        map.remove(*key);
    }
    for m in mcps {
        let mut env = serde_json::Map::new();
        for (k, v) in &m.env {
            env.insert(k.clone(), json!(v));
        }
        map.insert(
            m.key.clone(),
            json!({ "command": m.command, "args": m.args, "env": Value::Object(env) }),
        );
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    if let Ok(s) = serde_json::to_string_pretty(&root) {
        let _ = std::fs::write(path, s);
    }
}

#[tauri::command]
pub fn ensure_mcp_config(app: tauri::AppHandle, workspace_id: i64) -> Result<String, String> {
    let ctx = native_ctx(&app, workspace_id).ok_or("workspace not found")?;
    let mcps = crate::connectors::workspace_connector_mcps(&app, workspace_id);
    write_mcp_config(&ctx, &mcps)
}

/// Codex only loads MCP servers from the global `~/.codex/config.toml` (no
/// project-scoped config). Upsert `[mcp_servers.superconsole]` there with a
/// lossless TOML round-trip so existing config/comments are preserved. Global
/// scope means the last-launched workspace wins on the embedded token.
pub fn write_codex_mcp_config(ctx: &ToolCtx) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|_| "no HOME".to_string())?;
    let path = std::path::Path::new(&home)
        .join(".codex")
        .join("config.toml");
    let token = encode_session_token(ctx)?;
    let exe = std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "superconsole".into());

    let content = std::fs::read_to_string(&path).unwrap_or_default();
    let mut doc = content
        .parse::<toml_edit::DocumentMut>()
        .map_err(|e| e.to_string())?;

    if !doc.contains_key("mcp_servers") {
        doc["mcp_servers"] = toml_edit::Item::Table(toml_edit::Table::new());
    }
    let mut server = toml_edit::Table::new();
    server["command"] = toml_edit::value(exe);
    let mut args = toml_edit::Array::new();
    args.push("mcp");
    args.push("--session");
    args.push(token);
    server["args"] = toml_edit::value(args);
    doc["mcp_servers"]["superconsole"] = toml_edit::Item::Table(server);

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&path, doc.to_string()).map_err(|e| e.to_string())
}

/// Antigravity (CLI + editor). Both read the `mcpServers` JSON shape and still
/// store config under `~/.gemini`: the CLI supports a project-scoped
/// `.gemini/settings.json` (with `trust: true` to auto-approve), and the editor
/// reads the global `~/.gemini/config/mcp_config.json`. Write both.
pub fn write_antigravity_mcp_config(ctx: &ToolCtx) -> Result<(), String> {
    let ws_path = ctx.ws_path.clone();
    let token = encode_session_token(ctx)?;
    let exe = std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "superconsole".into());

    // Antigravity CLI: project-scoped, trusted (no approval prompt).
    let project_path = std::path::Path::new(&ws_path)
        .join(".gemini")
        .join("settings.json");
    let _ = merge_mcp_servers_trust(&project_path, &exe, &token, true);
    git_exclude(&ws_path, &[".gemini/settings.json"]);

    // Antigravity editor: global config (last-launched workspace wins on token).
    if let Ok(home) = std::env::var("HOME") {
        let global_path = std::path::Path::new(&home)
            .join(".gemini")
            .join("config")
            .join("mcp_config.json");
        let _ = merge_mcp_servers_trust(&global_path, &exe, &token, true);
    }
    Ok(())
}

// Map a Map<String,Value> arguments object to a plain Value object.
pub fn args_object(v: Option<&Value>) -> Value {
    match v {
        Some(Value::Object(m)) => Value::Object(m.clone()),
        Some(Value::String(s)) => {
            serde_json::from_str(s).unwrap_or_else(|_| Value::Object(Map::new()))
        }
        _ => Value::Object(Map::new()),
    }
}
