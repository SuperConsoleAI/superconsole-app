// On-demand project context files (`.superconsole/context/*.md`).
//
// Static reference the user maintains: brand, voice, style-guide, audience, etc.
// NOT auto-injected into every session — only the file names are surfaced to
// the agent (system prompt + MCP `context_list`); content is fetched on demand
// via `context_read`/`context_search`. Project-scoped, file-only, committed to
// git. No SQLite, no cloud: any CLI can read the folder natively.

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::db::Db;

const CONTEXT_DIR: &str = ".superconsole/context";

#[derive(Debug, Clone, Serialize)]
pub struct ContextFile {
    pub name: String,
    pub slug: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub modified_at: String,
}

// --- name + path safety ---

fn slugify(name: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in name.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    let s = out.trim_matches('-').to_string();
    if s.is_empty() {
        "context".into()
    } else {
        s.chars().take(60).collect()
    }
}

fn context_dir(ws_path: &str) -> PathBuf {
    Path::new(ws_path).join(CONTEXT_DIR)
}

fn context_file(ws_path: &str, slug: &str) -> PathBuf {
    context_dir(ws_path).join(format!("{}.md", slug))
}

fn rel_path(slug: &str) -> String {
    format!("{}/{}.md", CONTEXT_DIR, slug)
}

// --- file-based core helpers (no AppHandle), shared with the MCP tool layer ---

pub fn scan(ws_path: &str) -> Vec<ContextFile> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(context_dir(ws_path)) else {
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
        let meta = entry.metadata().ok();
        let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_at = meta
            .and_then(|m| m.modified().ok())
            .map(|t| {
                let dt: chrono::DateTime<chrono::Utc> = t.into();
                dt.format("%Y-%m-%dT%H:%M:%SZ").to_string()
            })
            .unwrap_or_default();
        out.push(ContextFile {
            slug: name.to_string(),
            name: name.replace(['-', '_'], " "),
            file_path: rel_path(name),
            size_bytes,
            modified_at,
        });
    }
    out.sort_by(|a, b| a.slug.to_lowercase().cmp(&b.slug.to_lowercase()));
    out
}

/// Context file slugs for a workspace (used by the chat system prompt).
pub fn scan_for(app: &AppHandle, workspace_id: i64) -> Vec<String> {
    let Ok(ws) = app.state::<Db>().get_workspace(workspace_id) else {
        return Vec::new();
    };
    scan(&ws.path).into_iter().map(|f| f.slug).collect()
}

pub fn read_body(ws_path: &str, slug: &str) -> Option<String> {
    std::fs::read_to_string(context_file(ws_path, slug)).ok()
}

/// Grep across all context files; returns `(slug, matching line)` pairs.
pub fn search(ws_path: &str, query: &str) -> Vec<(String, String)> {
    let q = query.trim().to_lowercase();
    let mut out = Vec::new();
    for f in scan(ws_path) {
        let Some(content) = read_body(ws_path, &f.slug) else {
            continue;
        };
        if q.is_empty() {
            out.push((f.slug.clone(), content.lines().take(1).collect()));
            continue;
        }
        for line in content.lines() {
            if line.to_lowercase().contains(&q) {
                out.push((f.slug.clone(), line.trim().to_string()));
            }
        }
    }
    out
}

// --- commands ---

#[tauri::command]
pub fn list_context_files(app: AppHandle, workspace_id: i64) -> Result<Vec<ContextFile>, String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    Ok(scan(&ws.path))
}

#[tauri::command]
pub fn read_context_file(
    app: AppHandle,
    workspace_id: i64,
    slug: String,
) -> Result<String, String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    let slug = slugify(&slug);
    read_body(&ws.path, &slug).ok_or_else(|| format!("Context file '{}' not found", slug))
}

#[tauri::command]
pub fn write_context_file(
    app: AppHandle,
    workspace_id: i64,
    slug: String,
    content: String,
) -> Result<(), String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    let slug = slugify(&slug);
    std::fs::create_dir_all(context_dir(&ws.path)).map_err(|e| e.to_string())?;
    std::fs::write(context_file(&ws.path, &slug), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_context_file(app: AppHandle, workspace_id: i64, slug: String) -> Result<(), String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    let slug = slugify(&slug);
    let file = context_file(&ws.path, &slug);
    if file.exists() {
        std::fs::remove_file(&file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// On first use, copy any well-known project files into `.superconsole/context/`
/// so the user has a starting set. Never overwrites existing context files.
#[tauri::command]
pub fn seed_context_files(app: AppHandle, workspace_id: i64) -> Result<Vec<String>, String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    let existing: std::collections::HashSet<String> =
        scan(&ws.path).into_iter().map(|f| f.slug).collect();

    let candidates = [
        "README.md",
        "CLAUDE.md",
        "brand-voice.md",
        "AGENTS.md",
        "about.md",
    ];
    std::fs::create_dir_all(context_dir(&ws.path)).map_err(|e| e.to_string())?;

    let mut seeded = Vec::new();
    for name in candidates {
        let src = Path::new(&ws.path).join(name);
        let Ok(content) = std::fs::read_to_string(&src) else {
            continue;
        };
        if content.trim().is_empty() {
            continue;
        }
        let slug = slugify(name.trim_end_matches(".md"));
        if existing.contains(&slug) || seeded.iter().any(|s: &String| s == &slug) {
            continue;
        }
        std::fs::write(context_file(&ws.path, &slug), content).map_err(|e| e.to_string())?;
        seeded.push(slug);
    }
    Ok(seeded)
}
