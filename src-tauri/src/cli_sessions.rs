use chrono::{DateTime, Utc};
use serde::Serialize;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(Serialize)]
pub struct CliSession {
    pub id: String,
    pub cli: String,
    pub workspace_path: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub modified_at: String,
    pub message_count: u64,
    pub title: Option<String>,
    pub preview: Option<String>,
}

#[derive(Serialize)]
pub struct CliSessionMessage {
    pub role: String,
    pub content: String,
    pub timestamp: Option<String>,
    pub model: Option<String>,
}

fn iso(t: SystemTime) -> String {
    let dt: DateTime<Utc> = t.into();
    dt.to_rfc3339()
}

/// Encode a workspace absolute path the way Claude Code names its project
/// directories: every non-alphanumeric character becomes `-`.
fn claude_encode(path: &str) -> String {
    path.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

/// Droid names its session dirs by replacing only `/` with `-` (dots kept),
/// e.g. `/Users/x/superconsole` -> `-Users-x-superconsole`.
fn droid_encode(path: &str) -> String {
    path.replace('/', "-")
}

/// Grok names session dirs by replacing `/` with `%2F`.
fn grok_encode(path: &str) -> String {
    path.replace('/', "%2F")
}

/// Roots we are allowed to read CLI session content from.
fn allowed_roots(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join(".claude"),
        home.join(".factory"),
        home.join(".antigravity"),
        home.join(".gemini"),
        home.join(".codex"),
        home.join(".grok"),
        home.join(".xai"),
        home.join(".warp"),
        home.join(".cursor"),
        home.join(".opencode"),
        home.join(".superconsole"),
    ]
}

fn is_allowed(home: &Path, target: &Path) -> bool {
    let canon = target
        .canonicalize()
        .unwrap_or_else(|_| target.to_path_buf());
    allowed_roots(home).iter().any(|root| {
        let r = root.canonicalize().unwrap_or_else(|_| root.clone());
        canon.starts_with(&r)
    })
}

fn count_lines(path: &Path) -> u64 {
    match File::open(path) {
        Ok(f) => BufReader::new(f)
            .lines()
            .filter(|l| l.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false))
            .count() as u64,
        Err(_) => 0,
    }
}

/// Resolve the on-disk session directory for a workspace + CLI, if it exists.
fn session_dir(home: &Path, workspace_path: &str, cli: &str) -> Option<PathBuf> {
    match cli {
        "claude" => {
            let base = home.join(".claude").join("projects");
            let direct = base.join(claude_encode(workspace_path));
            if direct.is_dir() {
                return Some(direct);
            }
            let want = claude_encode(workspace_path);
            std::fs::read_dir(&base).ok()?.flatten().find_map(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                if name == want && e.path().is_dir() {
                    Some(e.path())
                } else {
                    None
                }
            })
        }
        "droid" => {
            let dir = home
                .join(".factory")
                .join("sessions")
                .join(droid_encode(workspace_path));
            if dir.is_dir() {
                Some(dir)
            } else {
                None
            }
        }
        "cursor" | "cursor-agent" => {
            let dir = home.join(".cursor").join("sessions");
            if dir.is_dir() {
                Some(dir)
            } else {
                None
            }
        }
        "warp" | "warp-agent" => {
            let dir = home.join(".warp").join("sessions");
            if dir.is_dir() {
                Some(dir)
            } else {
                None
            }
        }
        "opencode" => {
            let dir = home.join(".opencode").join("sessions");
            if dir.is_dir() {
                Some(dir)
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Recursively collect `.jsonl` files under a directory.
fn collect_jsonl(dir: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(rd) = std::fs::read_dir(dir) {
        for entry in rd.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_jsonl(&path, out);
            } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                out.push(path);
            }
        }
    }
}

/// Read the first non-empty line of a file and parse it as JSON.
fn first_json_line(path: &Path) -> Option<serde_json::Value> {
    let file = File::open(path).ok()?;
    for line in BufReader::new(file).lines() {
        let line = line.ok()?;
        if line.trim().is_empty() {
            continue;
        }
        return serde_json::from_str::<serde_json::Value>(&line).ok();
    }
    None
}

/// Codex sessions live in `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.
fn list_codex_sessions(home: &Path, workspace_path: &str) -> Result<Vec<CliSession>, String> {
    let base = home.join(".codex").join("sessions");
    if !base.is_dir() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    collect_jsonl(&base, &mut files);

    let mut out: Vec<CliSession> = files
        .into_iter()
        .filter_map(|path| {
            let meta_line = first_json_line(&path)?;
            let payload = meta_line.get("payload").unwrap_or(&meta_line);
            let cwd = payload.get("cwd").and_then(|c| c.as_str())?;
            if cwd != workspace_path {
                return None;
            }
            let id = payload
                .get("id")
                .and_then(|i| i.as_str())
                .map(|s| s.to_string())
                .or_else(|| {
                    let stem = path.file_stem()?.to_str()?;
                    let parts: Vec<&str> = stem.split('-').collect();
                    if parts.len() >= 5 {
                        Some(parts[parts.len() - 5..].join("-"))
                    } else {
                        None
                    }
                })?;
            let fs_meta = std::fs::metadata(&path).ok()?;
            let modified = fs_meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            Some(CliSession {
                id,
                cli: "codex".to_string(),
                workspace_path: workspace_path.to_string(),
                file_path: path.to_string_lossy().to_string(),
                size_bytes: fs_meta.len(),
                modified_at: iso(modified),
                message_count: count_lines(&path),
                title: None,
                preview: None,
            })
        })
        .collect();
    out.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(out)
}

/// Antigravity sessions live under ~/.gemini/antigravity-cli/brain/<uuid>/.system_generated/logs/transcript.jsonl
fn list_antigravity_sessions(home: &Path, workspace_path: &str) -> Result<Vec<CliSession>, String> {
    let mut out: Vec<CliSession> = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    // 1. Check conversation metadata index files (strictly match workspace)
    for metadata_path in [
        home.join(".gemini").join("antigravity-cli").join("cache").join("conversation_metadata.json"),
        home.join(".gemini").join("antigravity-ide").join("cache").join("conversation_metadata.json"),
    ] {
        if let Ok(content) = std::fs::read_to_string(&metadata_path) {
            if let Ok(map) = serde_json::from_str::<serde_json::Value>(&content) {
                let target = map.get("conversations").unwrap_or(&map);
                if let Some(convs) = target.as_object() {
                    for (id, val) in convs {
                    if seen_ids.contains(id) {
                        continue;
                    }
                    let summary = val.get("summary").unwrap_or(val);
                    let uris = summary.get("WorkspaceURIs").and_then(|u| u.as_array());
                    let matches_workspace = match uris {
                        Some(arr) if !arr.is_empty() => arr.iter().any(|u| {
                            u.as_str().map(|s| {
                                s == workspace_path
                                    || s.ends_with(workspace_path)
                                    || s == &format!("file://{}", workspace_path)
                            }).unwrap_or(false)
                        }),
                        _ => false, // Only match if explicitly belonging to this workspace
                    };
                    if !matches_workspace {
                        continue;
                    }

                    let title = summary.get("Title").and_then(|t| t.as_str()).filter(|t| !t.trim().is_empty()).map(|s| s.to_string());
                    let preview = summary.get("Preview").and_then(|p| p.as_str()).filter(|p| !p.trim().is_empty()).map(|s| s.to_string());

                    let candidates = [
                        home.join(".gemini").join("antigravity-cli").join("brain").join(id).join(".system_generated").join("logs").join("transcript.jsonl"),
                        home.join(".gemini").join("antigravity-ide").join("brain").join(id).join(".system_generated").join("logs").join("transcript.jsonl"),
                        home.join(".gemini").join("antigravity-cli").join("brain").join(id).join(".system_generated").join("logs").join("transcript_full.jsonl"),
                        home.join(".gemini").join("antigravity-ide").join("brain").join(id).join(".system_generated").join("logs").join("transcript_full.jsonl"),
                    ];
                    if let Some(p) = candidates.into_iter().find(|p| p.exists()) {
                        let meta = std::fs::metadata(&p).ok();
                        let modified = meta.as_ref().and_then(|m| m.modified().ok()).unwrap_or(SystemTime::UNIX_EPOCH);
                        seen_ids.insert(id.clone());
                        out.push(CliSession {
                            id: id.clone(),
                            cli: "antigravity".to_string(),
                            workspace_path: workspace_path.to_string(),
                            file_path: p.to_string_lossy().to_string(),
                            size_bytes: meta.map(|m| m.len()).unwrap_or(0),
                            modified_at: iso(modified),
                            message_count: count_lines(&p),
                            title,
                            preview,
                        });
                    }
                }
            }
        }
    }
}

    // 2. Check history.jsonl for any sessions explicitly executed in this workspace
    for hist_path in [
        home.join(".gemini").join("antigravity-cli").join("history.jsonl"),
        home.join(".gemini").join("antigravity-ide").join("history.jsonl"),
    ] {
        if let Ok(file) = File::open(&hist_path) {
            for line in BufReader::new(file).lines().flatten() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
                    if let Some(ws) = v.get("workspace").and_then(|w| w.as_str()) {
                        if ws == workspace_path || ws.ends_with(workspace_path) {
                            if let Some(id) = v.get("conversationId").and_then(|c| c.as_str()) {
                                if !seen_ids.contains(id) {
                                    let candidates = [
                                        home.join(".gemini").join("antigravity-cli").join("brain").join(id).join(".system_generated").join("logs").join("transcript.jsonl"),
                                        home.join(".gemini").join("antigravity-ide").join("brain").join(id).join(".system_generated").join("logs").join("transcript.jsonl"),
                                    ];
                                    if let Some(p) = candidates.into_iter().find(|p| p.exists()) {
                                        let meta = std::fs::metadata(&p).ok();
                                        let modified = meta.as_ref().and_then(|m| m.modified().ok()).unwrap_or(SystemTime::UNIX_EPOCH);
                                        seen_ids.insert(id.to_string());
                                        out.push(CliSession {
                                            id: id.to_string(),
                                            cli: "antigravity".to_string(),
                                            workspace_path: workspace_path.to_string(),
                                            file_path: p.to_string_lossy().to_string(),
                                            size_bytes: meta.map(|m| m.len()).unwrap_or(0),
                                            modified_at: iso(modified),
                                            message_count: count_lines(&p),
                                            title: None,
                                            preview: v.get("display").and_then(|d| d.as_str()).map(|s| s.to_string()),
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Check last_conversations.json
    for last_path in [
        home.join(".gemini").join("antigravity-cli").join("cache").join("last_conversations.json"),
        home.join(".gemini").join("antigravity-ide").join("cache").join("last_conversations.json"),
    ] {
        if let Ok(content) = std::fs::read_to_string(&last_path) {
            if let Ok(map) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(id) = map.get(workspace_path).and_then(|c| c.as_str()) {
                    if !seen_ids.contains(id) {
                        let candidates = [
                            home.join(".gemini").join("antigravity-cli").join("brain").join(id).join(".system_generated").join("logs").join("transcript.jsonl"),
                            home.join(".gemini").join("antigravity-ide").join("brain").join(id).join(".system_generated").join("logs").join("transcript.jsonl"),
                        ];
                        if let Some(p) = candidates.into_iter().find(|p| p.exists()) {
                            let meta = std::fs::metadata(&p).ok();
                            let modified = meta.as_ref().and_then(|m| m.modified().ok()).unwrap_or(SystemTime::UNIX_EPOCH);
                            seen_ids.insert(id.to_string());
                            out.push(CliSession {
                                id: id.to_string(),
                                cli: "antigravity".to_string(),
                                workspace_path: workspace_path.to_string(),
                                file_path: p.to_string_lossy().to_string(),
                                size_bytes: meta.map(|m| m.len()).unwrap_or(0),
                                modified_at: iso(modified),
                                message_count: count_lines(&p),
                                title: None,
                                preview: None,
                            });
                        }
                    }
                }
            }
        }
    }

    out.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(out)
}

/// Grok Build sessions live under ~/.grok/sessions/<encoded_workspace_path>/<session_id>/chat_history.jsonl
fn list_grok_sessions(home: &Path, workspace_path: &str) -> Result<Vec<CliSession>, String> {
    let base = home.join(".grok").join("sessions");
    if !base.is_dir() {
        return Ok(Vec::new());
    }

    let encoded = grok_encode(workspace_path);
    let claude_enc = claude_encode(workspace_path);
    let mut target_dirs = vec![base.join(&encoded)];
    if encoded != claude_enc {
        target_dirs.push(base.join(&claude_enc));
    }

    let mut out: Vec<CliSession> = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    for dir in target_dirs {
        if !dir.is_dir() {
            continue;
        }
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for entry in rd.flatten() {
                let p = entry.path();
                if !p.is_dir() {
                    continue;
                }
                let session_id = match p.file_name().and_then(|n| n.to_str()) {
                    Some(s) if !s.starts_with('.') => s.to_string(),
                    _ => continue,
                };
                if seen_ids.contains(&session_id) {
                    continue;
                }

                // Check summary.json for title / preview if available
                let mut title = None;
                let mut preview = None;
                let summary_path = p.join("summary.json");
                if summary_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&summary_path) {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                            title = v.get("title").and_then(|t| t.as_str()).map(|s| s.to_string());
                            preview = v.get("preview").and_then(|pr| pr.as_str()).map(|s| s.to_string());
                        }
                    }
                }

                let history_file = p.join("chat_history.jsonl");
                let (file_path, size_bytes, modified_at, message_count) = if history_file.exists() {
                    let meta = std::fs::metadata(&history_file).ok();
                    let modified = meta.as_ref().and_then(|m| m.modified().ok()).unwrap_or(SystemTime::UNIX_EPOCH);
                    (
                        history_file.to_string_lossy().to_string(),
                        meta.map(|m| m.len()).unwrap_or(0),
                        iso(modified),
                        count_lines(&history_file),
                    )
                } else {
                    let meta = entry.metadata().ok();
                    let modified = meta.as_ref().and_then(|m| m.modified().ok()).unwrap_or(SystemTime::UNIX_EPOCH);
                    (
                        p.to_string_lossy().to_string(),
                        meta.map(|m| m.len()).unwrap_or(0),
                        iso(modified),
                        0,
                    )
                };
                seen_ids.insert(session_id.clone());
                out.push(CliSession {
                    id: session_id,
                    cli: "grok".to_string(),
                    workspace_path: workspace_path.to_string(),
                    file_path,
                    size_bytes,
                    modified_at,
                    message_count,
                    title,
                    preview,
                });
            }
        }
    }
    out.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(out)
}

pub fn list_sessions(
    home: &Path,
    workspace_path: &str,
    cli: &str,
) -> Result<Vec<CliSession>, String> {
    if cli == "codex" {
        return list_codex_sessions(home, workspace_path);
    }
    if cli == "antigravity" {
        return list_antigravity_sessions(home, workspace_path);
    }
    if cli == "grok" || cli == "grok-build" || cli == "xai" || cli == "x-ai" {
        return list_grok_sessions(home, workspace_path);
    }
    let dir = match session_dir(home, workspace_path, cli) {
        Some(d) => d,
        None => return Ok(Vec::new()),
    };
    let mut out: Vec<CliSession> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                return None;
            }
            let meta = entry.metadata().ok()?;
            let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            let id = path.file_stem()?.to_string_lossy().to_string();
            Some(CliSession {
                id,
                cli: cli.to_string(),
                workspace_path: workspace_path.to_string(),
                file_path: path.to_string_lossy().to_string(),
                size_bytes: meta.len(),
                modified_at: iso(modified),
                message_count: count_lines(&path),
                title: None,
                preview: None,
            })
        })
        .collect();
    out.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(out)
}

fn value_to_text(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => {
            arr.iter().map(value_to_text).collect::<Vec<_>>().join("\n")
        }
        _ => v.to_string(),
    }
}

fn clean_xml_tag(s: &str, tag: &str) -> String {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    if let Some(start) = s.find(&open) {
        let after = &s[start + open.len()..];
        if let Some(end) = after.find(&close) {
            return after[..end].trim().to_string();
        }
    }
    s.trim().to_string()
}

/// Flatten an Antigravity transcript line into zero or more messages.
fn flatten_antigravity_line(v: &serde_json::Value, out: &mut Vec<CliSessionMessage>) {
    let typ = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
    let source = v.get("source").and_then(|s| s.as_str()).unwrap_or("");
    let ts = v.get("created_at").and_then(|t| t.as_str()).map(|s| s.to_string());
    let raw_content = v.get("content").and_then(|c| c.as_str()).unwrap_or("");

    if typ == "USER_INPUT" || source == "USER_EXPLICIT" {
        let clean = clean_xml_tag(raw_content, "USER_REQUEST");
        if !clean.is_empty() {
            out.push(CliSessionMessage {
                role: "user".to_string(),
                content: clean,
                timestamp: ts,
                model: None,
            });
        }
    } else if typ == "PLANNER_RESPONSE" || source == "MODEL" {
        if !raw_content.trim().is_empty() {
            out.push(CliSessionMessage {
                role: "assistant".to_string(),
                content: raw_content.to_string(),
                timestamp: ts,
                model: None,
            });
        }
    }
}

/// Flatten a Grok Build chat_history line into zero or more messages.
fn flatten_grok_line(v: &serde_json::Value, out: &mut Vec<CliSessionMessage>) {
    let typ = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
    let model = v.get("model_id").and_then(|m| m.as_str()).map(|s| s.to_string());

    if typ == "user" {
        let reason = v.get("synthetic_reason").and_then(|r| r.as_str()).unwrap_or("");
        if reason == "system_reminder" {
            return;
        }
        if let Some(blocks) = v.get("content").and_then(|c| c.as_array()) {
            for b in blocks {
                if let Some(text) = b.get("text").and_then(|t| t.as_str()) {
                    let clean = clean_xml_tag(text, "user_query");
                    if !clean.is_empty() {
                        out.push(CliSessionMessage {
                            role: "user".to_string(),
                            content: clean,
                            timestamp: None,
                            model: None,
                        });
                    }
                }
            }
        }
    } else if typ == "assistant" {
        if let Some(content_str) = v.get("content").and_then(|c| c.as_str()) {
            if !content_str.trim().is_empty() {
                out.push(CliSessionMessage {
                    role: "assistant".to_string(),
                    content: content_str.to_string(),
                    timestamp: None,
                    model,
                });
            }
        } else if let Some(blocks) = v.get("content").and_then(|c| c.as_array()) {
            for b in blocks {
                if let Some(text) = b.get("text").and_then(|t| t.as_str()) {
                    if !text.trim().is_empty() {
                        out.push(CliSessionMessage {
                            role: "assistant".to_string(),
                            content: text.to_string(),
                            timestamp: None,
                            model: model.clone(),
                        });
                    }
                }
            }
        }
    }
}

/// Flatten a Claude JSONL line into zero or more displayable messages.
fn flatten_claude_line(v: &serde_json::Value, out: &mut Vec<CliSessionMessage>) {
    let typ = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
    if typ != "user" && typ != "assistant" {
        return;
    }
    let msg = match v.get("message") {
        Some(m) => m,
        None => return,
    };
    let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or(typ);
    let model = msg
        .get("model")
        .and_then(|m| m.as_str())
        .map(|s| s.to_string());
    let ts = v
        .get("timestamp")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string());

    match msg.get("content") {
        Some(serde_json::Value::String(s)) => {
            if !s.trim().is_empty() {
                out.push(CliSessionMessage {
                    role: role.to_string(),
                    content: s.clone(),
                    timestamp: ts,
                    model,
                });
            }
        }
        Some(serde_json::Value::Array(blocks)) => {
            for block in blocks {
                let btype = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match btype {
                    "text" => {
                        let text = block.get("text").and_then(|t| t.as_str()).unwrap_or("");
                        if !text.trim().is_empty() {
                            out.push(CliSessionMessage {
                                role: role.to_string(),
                                content: text.to_string(),
                                timestamp: ts.clone(),
                                model: model.clone(),
                            });
                        }
                    }
                    "tool_use" => {
                        let name = block.get("name").and_then(|n| n.as_str()).unwrap_or("tool");
                        let input = block.get("input").map(value_to_text).unwrap_or_default();
                        out.push(CliSessionMessage {
                            role: "tool_use".to_string(),
                            content: format!("{}\n{}", name, input),
                            timestamp: ts.clone(),
                            model: None,
                        });
                    }
                    "tool_result" => {
                        let content = block.get("content").map(value_to_text).unwrap_or_default();
                        out.push(CliSessionMessage {
                            role: "tool_result".to_string(),
                            content,
                            timestamp: ts.clone(),
                            model: None,
                        });
                    }
                    _ => {}
                }
            }
        }
        _ => {}
    }
}

pub fn read_session(
    home: &Path,
    file_path: &str,
    cli: &str,
) -> Result<Vec<CliSessionMessage>, String> {
    let path = Path::new(file_path);
    if !is_allowed(home, path) {
        return Err("Path outside of allowed CLI session directories".into());
    }
    let file = File::open(path).map_err(|e| format!("Cannot read session: {}", e))?;
    let reader = BufReader::new(file);

    let mut out: Vec<CliSessionMessage> = Vec::new();
    let mut parsed_any = false;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
            parsed_any = true;
            if cli == "antigravity" || file_path.contains("transcript") {
                flatten_antigravity_line(&v, &mut out);
            } else if cli == "grok" || cli == "grok-build" || cli == "xai" || file_path.contains("chat_history") {
                flatten_grok_line(&v, &mut out);
            } else {
                flatten_claude_line(&v, &mut out);
            }
        }
    }

    if parsed_any && !out.is_empty() {
        return Ok(out);
    }

    // Fallback: return raw file content as a single message.
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(vec![CliSessionMessage {
        role: "raw".to_string(),
        content: raw,
        timestamp: None,
        model: None,
    }])
}

