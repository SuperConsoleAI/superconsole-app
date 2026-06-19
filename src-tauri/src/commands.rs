// Cross-CLI slash commands.
//
// A command is a markdown file with YAML frontmatter (`slash`, `description`).
// Three sources, resolved together:
//   - project:  `.superconsole/commands/*.md` (committed, editable, CLI-native)
//   - claude:   `.claude/commands/*.md` (read-only, surfaced for discoverability)
//   - global:   `<app_data_dir>/commands/*.md` (account-scoped, machine-local;
//               works in every project — mirrors the global skill library)
//
// On send, native chat expands a matching `/slash` message into the command
// body before calling the model (the displayed bubble stays the short slash).

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::db::Db;

const COMMANDS_DIR: &str = ".superconsole/commands";

#[derive(Debug, Clone, Serialize)]
pub struct SlashCommand {
    pub name: String,
    pub slash: String,
    pub description: String,
    pub file_path: String,
    /// "superconsole" | "claude" | "global"
    pub source: String,
}

// --- name + path safety ---

fn sanitize_name(name: &str) -> Result<String, String> {
    let slug = name.trim().to_lowercase().replace(' ', "-");
    if slug.is_empty()
        || !slug
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Command name must be alphanumeric (dashes/underscores allowed)".into());
    }
    Ok(slug)
}

fn normalize_slash(name: &str, slash: &str) -> String {
    let s = slash.trim();
    let s = if s.is_empty() { name } else { s };
    let s = s.trim_start_matches('/');
    format!("/{}", s)
}

fn project_dir(ws_path: &str) -> PathBuf {
    Path::new(ws_path).join(COMMANDS_DIR)
}

fn claude_dir(ws_path: &str) -> PathBuf {
    Path::new(ws_path).join(".claude").join("commands")
}

fn global_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("commands");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

// --- frontmatter ---

struct Parsed {
    slash: String,
    description: String,
    body: String,
}

fn parse(name: &str, content: &str) -> Parsed {
    let mut slash = String::new();
    let mut description = String::new();
    let mut body = content.trim().to_string();

    let trimmed = content.trim_start();
    if let Some(rest) = trimmed.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            let fm = &rest[..end];
            body = rest[end + 4..].trim().to_string();
            for line in fm.lines() {
                let Some((k, v)) = line.split_once(':') else {
                    continue;
                };
                match k.trim().to_lowercase().as_str() {
                    "slash" => slash = v.trim().to_string(),
                    "description" => description = v.trim().to_string(),
                    _ => {}
                }
            }
        }
    }
    Parsed {
        slash: normalize_slash(name, &slash),
        description,
        body,
    }
}

fn serialize(name: &str, slash: &str, description: &str, content: &str) -> String {
    format!(
        "---\nname: {}\nslash: {}\ndescription: {}\n---\n\n{}\n",
        name,
        normalize_slash(name, slash),
        description,
        content.trim()
    )
}

fn scan_dir(dir: &Path, source: &str, rel_prefix: &str) -> Vec<SlashCommand> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        let p = parse(name, &content);
        out.push(SlashCommand {
            name: name.to_string(),
            slash: p.slash,
            description: p.description,
            file_path: format!("{}/{}.md", rel_prefix, name),
            source: source.to_string(),
        });
    }
    out
}

// --- aggregation ---

/// All commands available in a workspace: project + claude + global, deduped by
/// slash with precedence project > global > claude.
pub fn all(app: &AppHandle, ws_path: &str) -> Vec<SlashCommand> {
    let mut out: Vec<SlashCommand> = Vec::new();
    let mut push = |cmds: Vec<SlashCommand>| {
        for c in cmds {
            if !out.iter().any(|e| e.slash == c.slash) {
                out.push(c);
            }
        }
    };
    push(scan_dir(&project_dir(ws_path), "superconsole", COMMANDS_DIR));
    if let Ok(dir) = global_dir(app) {
        push(scan_dir(&dir, "global", "commands"));
    }
    push(scan_dir(&claude_dir(ws_path), "claude", ".claude/commands"));
    out.sort_by(|a, b| a.slash.cmp(&b.slash));
    out
}

/// Resolve a `/slash` (optionally with trailing args) to the command body for
/// the model. Returns the body with any extra args appended. Project and global
/// sources only — claude commands are read-only references.
pub fn resolve(app: &AppHandle, ws_path: &str, message: &str) -> Option<String> {
    let trimmed = message.trim();
    if !trimmed.starts_with('/') {
        return None;
    }
    let (head, rest) = match trimmed.split_once(char::is_whitespace) {
        Some((h, r)) => (h, r.trim()),
        None => (trimmed, ""),
    };
    let slash = head.to_string();

    let dirs: Vec<(PathBuf, &str)> = {
        let mut v = vec![(project_dir(ws_path), "superconsole")];
        if let Ok(g) = global_dir(app) {
            v.push((g, "global"));
        }
        v
    };
    for (dir, _) in dirs {
        for cmd in scan_dir(&dir, "", "") {
            if cmd.slash == slash {
                let content =
                    std::fs::read_to_string(dir.join(format!("{}.md", cmd.name))).ok()?;
                let body = parse(&cmd.name, &content).body;
                return Some(if rest.is_empty() {
                    body
                } else {
                    format!("{}\n\n{}", body, rest)
                });
            }
        }
    }
    None
}

// --- project commands ---

#[tauri::command]
pub fn list_commands(app: AppHandle, workspace_id: i64) -> Result<Vec<SlashCommand>, String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    Ok(all(&app, &ws.path))
}

#[tauri::command]
pub fn read_command(app: AppHandle, workspace_id: i64, slash: String) -> Result<String, String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    resolve(&app, &ws.path, &slash).ok_or_else(|| format!("Command '{}' not found", slash))
}

#[tauri::command]
pub fn write_command(
    app: AppHandle,
    workspace_id: i64,
    name: String,
    slash: String,
    description: String,
    content: String,
) -> Result<(), String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    let slug = sanitize_name(&name)?;
    std::fs::create_dir_all(project_dir(&ws.path)).map_err(|e| e.to_string())?;
    let md = serialize(&slug, &slash, &description, &content);
    std::fs::write(project_dir(&ws.path).join(format!("{}.md", slug)), md)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_command(app: AppHandle, workspace_id: i64, name: String) -> Result<(), String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    let slug = sanitize_name(&name)?;
    let file = project_dir(&ws.path).join(format!("{}.md", slug));
    if file.exists() {
        std::fs::remove_file(&file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// --- global (account-scoped, machine-local) commands ---

#[tauri::command]
pub fn list_global_commands(app: AppHandle) -> Result<Vec<SlashCommand>, String> {
    Ok(scan_dir(&global_dir(&app)?, "global", "commands"))
}

#[tauri::command]
pub fn read_global_command(app: AppHandle, name: String) -> Result<String, String> {
    let slug = sanitize_name(&name)?;
    std::fs::read_to_string(global_dir(&app)?.join(format!("{}.md", slug)))
        .map_err(|_| format!("Command '{}' not found", slug))
}

#[tauri::command]
pub fn write_global_command(
    app: AppHandle,
    name: String,
    slash: String,
    description: String,
    content: String,
) -> Result<(), String> {
    let slug = sanitize_name(&name)?;
    let md = serialize(&slug, &slash, &description, &content);
    std::fs::write(global_dir(&app)?.join(format!("{}.md", slug)), md).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_global_command(app: AppHandle, name: String) -> Result<(), String> {
    let slug = sanitize_name(&name)?;
    let file = global_dir(&app)?.join(format!("{}.md", slug));
    if file.exists() {
        std::fs::remove_file(&file).map_err(|e| e.to_string())?;
    }
    Ok(())
}
