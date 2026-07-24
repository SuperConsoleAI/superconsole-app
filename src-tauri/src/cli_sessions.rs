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

/// Roots we are allowed to read CLI session content from.
fn allowed_roots(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join(".claude"),
        home.join(".factory"),
        home.join(".antigravity"),
        home.join(".codex"),
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
            // Fallback: scan for a directory whose name matches the encoding.
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
        _ => None,
    }
}

/// Recursively collect `.jsonl` files under a directory (Codex sorts sessions
/// into YYYY/MM/DD folders rather than per-workspace).
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

/// Codex sessions live in `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` and
/// record their working directory in the first line; filter by that cwd.
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
            // Codex wraps the session meta under a `payload` object on newer
            // versions; accept either shape.
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
                    // Fallback: trailing UUID of `rollout-<ts>-<uuid>.jsonl`
                    // (the UUID is the last 5 hyphen-separated groups).
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
            })
        })
        .collect();
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

    if cli == "claude" {
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
                flatten_claude_line(&v, &mut out);
            }
        }
        if parsed_any {
            return Ok(out);
        }
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
