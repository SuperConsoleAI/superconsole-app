// Phase 19: Memory — persistent, compressed knowledge per project (and shared
// org facts). Less is more: small, grep-able markdown entries, not transcripts.
//
// Content lives in workspace files (`.superconsole/memory/<category>.md`) so any
// CLI reads it natively and it travels via git. Local SQLite (`memory_entries`)
// holds a metadata index only; Turso (`project_memory_index`) holds metadata +
// one-line summaries for cross-device restore — never full content (avoids DB
// bloat). Org memory is small shared facts with no workspace file, so its
// content is stored in Turso (`org_memory_index`) and gated to owners/admins.
//
// LLM-driven automations (auto-populate, "improve brain", session-end writes,
// inbox extraction) are intentionally NOT here: they belong to the agent via
// the Phase 16 MCP tools `memory_read` / `memory_write`, which build on the
// deterministic primitives below.

use crate::cloud::{self, cell_opt, cell_text, rows};
use crate::db::{CachedMemory, CachedOrgMemory, Db};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use ulid::Ulid;

const MEMORY_DIR: &str = ".superconsole/memory";
pub const MEMORY_CATEGORIES: &[&str] = &["preferences", "decisions", "facts", "patterns", "recent"];
const RECENT_LIMIT: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub category: String,
    pub slug: String,
    pub title: String,
    pub date: String,
    pub body: String,
    pub tags: Vec<String>,
    pub summary: String,
    /// "file" (on disk in this workspace) or "cloud" (synced from another
    /// device; full content arrives when the repo is pulled).
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrgMemoryEntry {
    pub slug: String,
    pub title: String,
    pub body: String,
    pub tags: Vec<String>,
}

// --- name + path safety ---

fn slugify(title: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in title.trim().to_lowercase().chars() {
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
        "entry".into()
    } else {
        s.chars().take(60).collect()
    }
}

fn valid_category(category: &str) -> Result<(), String> {
    if MEMORY_CATEGORIES.contains(&category) {
        Ok(())
    } else {
        Err(format!("Unknown memory category '{}'", category))
    }
}

fn today() -> String {
    chrono::Utc::now().format("%Y-%m-%d").to_string()
}

fn memory_dir(ws_path: &str) -> PathBuf {
    Path::new(ws_path).join(MEMORY_DIR)
}

fn category_file(ws_path: &str, category: &str) -> PathBuf {
    memory_dir(ws_path).join(format!("{}.md", category))
}

fn rel_path(category: &str) -> String {
    format!("{}/{}.md", MEMORY_DIR, category)
}

// --- markdown parse / serialize ---

fn one_line_summary(body: &str) -> String {
    body.lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .map(|l| l.chars().take(160).collect())
        .unwrap_or_default()
}

fn parse_tags(line: &str) -> Vec<String> {
    let rest = line
        .trim_start_matches(|c: char| c != ':')
        .trim_start_matches(':');
    rest.split(|c: char| c.is_whitespace() || c == ',')
        .map(|t| t.trim().trim_start_matches('#').to_string())
        .filter(|t| !t.is_empty())
        .collect()
}

/// Parse a category file into entries. Entries start at a `## ` heading whose
/// text is optionally `[YYYY-MM-DD] Title`. A `Tags:` line in the body is
/// lifted into the entry's tags.
fn parse_file(category: &str, content: &str) -> Vec<MemoryEntry> {
    let mut entries = Vec::new();
    let mut cur: Option<(String, String, Vec<String>, Vec<String>)> = None; // title, date, tags, body lines

    let flush = |entries: &mut Vec<MemoryEntry>,
                 cur: Option<(String, String, Vec<String>, Vec<String>)>| {
        if let Some((title, date, tags, body_lines)) = cur {
            let body = body_lines.join("\n").trim().to_string();
            entries.push(MemoryEntry {
                category: category.to_string(),
                slug: slugify(&title),
                summary: one_line_summary(&body),
                title,
                date,
                tags,
                body,
                source: "file".into(),
            });
        }
    };

    for line in content.lines() {
        if let Some(heading) = line.strip_prefix("## ") {
            flush(&mut entries, cur.take());
            let h = heading.trim();
            let (date, title) = if let Some(rest) = h.strip_prefix('[') {
                if let Some((d, t)) = rest.split_once(']') {
                    (d.trim().to_string(), t.trim().to_string())
                } else {
                    (String::new(), h.to_string())
                }
            } else {
                (String::new(), h.to_string())
            };
            cur = Some((title, date, Vec::new(), Vec::new()));
        } else if let Some((_, _, tags, body)) = cur.as_mut() {
            if line.trim_start().to_lowercase().starts_with("tags:") {
                *tags = parse_tags(line);
            } else {
                body.push(line.to_string());
            }
        }
    }
    flush(&mut entries, cur.take());
    entries
}

fn serialize_entry(e: &MemoryEntry) -> String {
    let date = if e.date.is_empty() {
        today()
    } else {
        e.date.clone()
    };
    let mut out = format!("## [{}] {}\n", date, e.title);
    if !e.body.trim().is_empty() {
        out.push_str(e.body.trim());
        out.push('\n');
    }
    if !e.tags.is_empty() {
        let tags = e
            .tags
            .iter()
            .map(|t| format!("#{}", t))
            .collect::<Vec<_>>()
            .join(" ");
        out.push_str(&format!("Tags: {}\n", tags));
    }
    out
}

fn serialize_file(entries: &[MemoryEntry]) -> String {
    entries
        .iter()
        .map(serialize_entry)
        .collect::<Vec<_>>()
        .join("\n")
}

fn read_category(ws_path: &str, category: &str) -> Vec<MemoryEntry> {
    match std::fs::read_to_string(category_file(ws_path, category)) {
        Ok(content) => parse_file(category, &content),
        Err(_) => Vec::new(),
    }
}

fn write_category(ws_path: &str, category: &str, entries: &[MemoryEntry]) -> Result<(), String> {
    std::fs::create_dir_all(memory_dir(ws_path)).map_err(|e| e.to_string())?;
    std::fs::write(category_file(ws_path, category), serialize_file(entries))
        .map_err(|e| e.to_string())
}

// --- index reconciliation ---

fn reindex(db: &Db, workspace_id: i64, entries: &[MemoryEntry]) {
    for e in entries {
        let _ = db.upsert_memory_entry(
            workspace_id,
            &e.category,
            &e.slug,
            &e.title,
            &e.summary,
            &e.tags.join(","),
            &rel_path(&e.category),
        );
    }
    let live: std::collections::HashSet<(String, String)> = entries
        .iter()
        .map(|e| (e.category.clone(), e.slug.clone()))
        .collect();
    for row in db.list_memory_entries(workspace_id) {
        if !live.contains(&(row.category.clone(), row.slug.clone())) {
            let _ = db.delete_memory_entry(workspace_id, &row.category, &row.slug);
        }
    }
}

fn all_entries(ws_path: &str) -> Vec<MemoryEntry> {
    let mut out = Vec::new();
    for cat in MEMORY_CATEGORIES {
        out.extend(read_category(ws_path, cat));
    }
    out
}

// --- file-based core helpers (no AppHandle), shared with the MCP tool layer ---

pub fn read_all(ws_path: &str) -> Vec<MemoryEntry> {
    all_entries(ws_path)
}

pub fn search_files(ws_path: &str, query: &str) -> Vec<MemoryEntry> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return all_entries(ws_path);
    }
    all_entries(ws_path)
        .into_iter()
        .filter(|e| {
            e.title.to_lowercase().contains(&q)
                || e.body.to_lowercase().contains(&q)
                || e.tags.iter().any(|t| t.to_lowercase().contains(&q))
        })
        .collect()
}

/// File-only upsert used by the MCP tool layer (no cache reindex or cloud push).
pub fn upsert_file(
    ws_path: &str,
    category: &str,
    title: &str,
    body: &str,
    tags: Vec<String>,
) -> Result<MemoryEntry, String> {
    valid_category(category)?;
    if title.trim().is_empty() {
        return Err("Title is required".into());
    }
    let slug = slugify(title);
    let entry = MemoryEntry {
        category: category.to_string(),
        slug: slug.clone(),
        title: title.trim().to_string(),
        date: today(),
        summary: one_line_summary(body),
        body: body.trim().to_string(),
        tags: tags
            .into_iter()
            .map(|t| t.trim().trim_start_matches('#').to_string())
            .filter(|t| !t.is_empty())
            .collect(),
        source: "file".into(),
    };
    let mut entries = read_category(ws_path, category);
    entries.retain(|e| e.slug != slug);
    entries.push(entry.clone());
    if category == "recent" && entries.len() > RECENT_LIMIT {
        let drop = entries.len() - RECENT_LIMIT;
        entries.drain(0..drop);
    }
    write_category(ws_path, category, &entries)?;
    Ok(entry)
}

// --- project commands ---

#[tauri::command]
pub fn list_memory(app: AppHandle, workspace_id: i64) -> Result<Vec<MemoryEntry>, String> {
    let db = app.state::<Db>();
    let ws = db.get_workspace(workspace_id)?;
    let mut entries = all_entries(&ws.path);
    reindex(&db, workspace_id, &entries);

    // Surface entries synced from another device that aren't on disk yet (their
    // full content arrives when the workspace repo is pulled).
    if let Some(pid) = &ws.project_id {
        for c in db.get_cached_memory(pid) {
            let exists = entries
                .iter()
                .any(|e| e.category == c.category && e.slug == c.slug);
            if !exists {
                entries.push(MemoryEntry {
                    category: c.category,
                    slug: c.slug,
                    title: c.title,
                    date: String::new(),
                    body: c.summary.clone(),
                    summary: c.summary,
                    tags: c
                        .tags
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect(),
                    source: "cloud".into(),
                });
            }
        }
    }
    Ok(entries)
}

/// The `memory_read(query)` primitive: grep over entries, return matches only.
#[tauri::command]
pub fn search_memory(
    app: AppHandle,
    workspace_id: i64,
    query: String,
) -> Result<Vec<MemoryEntry>, String> {
    let ws_path = app.state::<Db>().get_workspace(workspace_id)?.path;
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Ok(all_entries(&ws_path));
    }
    Ok(all_entries(&ws_path)
        .into_iter()
        .filter(|e| {
            e.title.to_lowercase().contains(&q)
                || e.body.to_lowercase().contains(&q)
                || e.tags.iter().any(|t| t.to_lowercase().contains(&q))
        })
        .collect())
}

/// The `memory_write(content, tags)` primitive. Upserts by slug within a
/// category (de-duplicated), keeps `recent` trimmed to a rolling window.
#[tauri::command]
pub async fn write_memory(
    app: AppHandle,
    workspace_id: i64,
    category: String,
    title: String,
    body: String,
    tags: Vec<String>,
) -> Result<MemoryEntry, String> {
    valid_category(&category)?;
    if title.trim().is_empty() {
        return Err("Title is required".into());
    }
    let (ws_path, project_id) = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id)?;
        (ws.path, ws.project_id)
    };
    let slug = slugify(&title);
    let entry = MemoryEntry {
        category: category.clone(),
        slug: slug.clone(),
        title: title.trim().to_string(),
        date: today(),
        summary: one_line_summary(&body),
        body: body.trim().to_string(),
        tags: tags
            .into_iter()
            .map(|t| t.trim().trim_start_matches('#').to_string())
            .filter(|t| !t.is_empty())
            .collect(),
        source: "file".into(),
    };

    let mut entries = read_category(&ws_path, &category);
    entries.retain(|e| e.slug != slug);
    entries.push(entry.clone());
    if category == "recent" && entries.len() > RECENT_LIMIT {
        let drop = entries.len() - RECENT_LIMIT;
        entries.drain(0..drop);
    }
    write_category(&ws_path, &category, &entries)?;
    reindex(&app.state::<Db>(), workspace_id, &all_entries(&ws_path));

    push_memory_to_cloud(
        &app,
        project_id.as_deref(),
        &category,
        &slug,
        &entry.title,
        &entry.summary,
        &entry.tags.join(","),
    )
    .await;
    Ok(entry)
}

#[tauri::command]
pub async fn delete_memory(
    app: AppHandle,
    workspace_id: i64,
    category: String,
    slug: String,
) -> Result<(), String> {
    valid_category(&category)?;
    let (ws_path, project_id) = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id)?;
        (ws.path, ws.project_id)
    };
    let mut entries = read_category(&ws_path, &category);
    entries.retain(|e| e.slug != slug);
    write_category(&ws_path, &category, &entries)?;
    app.state::<Db>()
        .delete_memory_entry(workspace_id, &category, &slug)?;
    delete_memory_from_cloud(&app, project_id.as_deref(), &category, &slug).await;
    Ok(())
}

#[tauri::command]
pub async fn wipe_memory(app: AppHandle, workspace_id: i64) -> Result<(), String> {
    let (ws_path, project_id) = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id)?;
        (ws.path, ws.project_id)
    };
    let dir = memory_dir(&ws_path);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    for cat in MEMORY_CATEGORIES {
        let _ = app.state::<Db>().delete_memory_category(workspace_id, cat);
    }
    if let (Some(pid), Ok(cfg)) = (project_id, cloud::turso_config()) {
        let client = reqwest::Client::new();
        if ensure_memory_index_table(&client, &cfg).await.is_ok() {
            let _ = cloud::turso_execute(
                &client,
                &cfg,
                "DELETE FROM project_memory_index WHERE project_id = ?",
                vec![Some(pid.clone())],
            )
            .await;
            crate::sync_manager::sync_on_update(&app, "project", &pid).await;
        }
    }
    Ok(())
}

// --- org memory (shared facts; owner/admin write, everyone reads) ---

fn cached_user_id(db: &Db) -> Option<String> {
    let json = db.get_cloud_identity()?;
    let v: serde_json::Value = serde_json::from_str(&json).ok()?;
    v["user"]["id"].as_str().map(|s| s.to_string())
}

async fn require_org_manager(
    app: &AppHandle,
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
    org_id: &str,
) -> Result<(), String> {
    let user_id = {
        let db = app.state::<Db>();
        cached_user_id(&db).ok_or("Not signed in")?
    };
    let res = cloud::turso_execute(
        client,
        cfg,
        "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
        vec![Some(org_id.to_string()), Some(user_id)],
    )
    .await?;
    match rows(&res).first().map(|r| cell_text(r, 0)) {
        Some(role) if role == "owner" || role == "admin" => Ok(()),
        Some(_) => Err("Only owners and admins can edit org memory".into()),
        None => Err("Not a member of this organization".into()),
    }
}

#[tauri::command]
pub fn list_org_memory(app: AppHandle, org_id: String) -> Result<Vec<OrgMemoryEntry>, String> {
    Ok(app
        .state::<Db>()
        .get_cached_org_memory(&org_id)
        .into_iter()
        .map(|m| OrgMemoryEntry {
            slug: m.slug,
            title: m.title,
            body: m.body,
            tags: m
                .tags
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
        })
        .collect())
}

#[tauri::command]
pub async fn write_org_memory(
    app: AppHandle,
    org_id: String,
    title: String,
    body: String,
    tags: Vec<String>,
) -> Result<OrgMemoryEntry, String> {
    if title.trim().is_empty() {
        return Err("Title is required".into());
    }
    let cfg = cloud::turso_config().map_err(|_| "Cloud is not configured")?;
    let client = reqwest::Client::new();
    require_org_manager(&app, &client, &cfg, &org_id).await?;
    ensure_org_memory_table(&client, &cfg).await?;

    let slug = slugify(&title);
    let tag_csv = tags
        .iter()
        .map(|t| t.trim().trim_start_matches('#').to_string())
        .filter(|t| !t.is_empty())
        .collect::<Vec<_>>()
        .join(",");
    let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO org_memory_index (id, org_id, slug, title, body, tags, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(org_id, slug) DO UPDATE SET \
           title = excluded.title, body = excluded.body, tags = excluded.tags, \
           updated_at = excluded.updated_at",
        vec![
            Some(Ulid::new().to_string()),
            Some(org_id.clone()),
            Some(slug.clone()),
            Some(title.trim().to_string()),
            Some(body.trim().to_string()),
            Some(tag_csv.clone()),
            Some(ts),
        ],
    )
    .await?;
    crate::sync_manager::sync_on_update(&app, "org", &org_id).await;
    Ok(OrgMemoryEntry {
        slug,
        title: title.trim().to_string(),
        body: body.trim().to_string(),
        tags: tag_csv
            .split(',')
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
            .collect(),
    })
}

#[tauri::command]
pub async fn delete_org_memory(app: AppHandle, org_id: String, slug: String) -> Result<(), String> {
    let cfg = cloud::turso_config().map_err(|_| "Cloud is not configured")?;
    let client = reqwest::Client::new();
    require_org_manager(&app, &client, &cfg, &org_id).await?;
    ensure_org_memory_table(&client, &cfg).await?;
    cloud::turso_execute(
        &client,
        &cfg,
        "DELETE FROM org_memory_index WHERE org_id = ? AND slug = ?",
        vec![Some(org_id.clone()), Some(slug)],
    )
    .await?;
    crate::sync_manager::sync_on_update(&app, "org", &org_id).await;
    Ok(())
}

// --- runtime: system-prompt context (index only, never full dump) ---

/// A compact memory index for the chat system prompt: project entry titles by
/// category + org shared facts. Full content is fetched on demand via search.
pub fn memory_context(app: &AppHandle, workspace_id: i64) -> String {
    let db = app.state::<Db>();
    let Ok(ws) = db.get_workspace(workspace_id) else {
        return String::new();
    };
    let mut sections = Vec::new();

    let entries = all_entries(&ws.path);
    if !entries.is_empty() {
        let mut lines = Vec::new();
        for cat in MEMORY_CATEGORIES {
            let titles: Vec<String> = entries
                .iter()
                .filter(|e| &e.category == cat)
                .map(|e| format!("  - {}", e.title))
                .collect();
            if !titles.is_empty() {
                lines.push(format!("{}:\n{}", cat, titles.join("\n")));
            }
        }
        sections.push(format!(
            "# Project memory (index)\n\nLearned context for this project. Only titles are listed; \
             search memory (memory_read) to load the relevant entries on demand.\n\n{}",
            lines.join("\n")
        ));
    }

    if let Some(org_id) = ws
        .project_id
        .as_deref()
        .and_then(|pid| db.get_project_org(pid))
    {
        let org_mem = db.get_cached_org_memory(&org_id);
        if !org_mem.is_empty() {
            let facts: Vec<String> = org_mem
                .iter()
                .map(|m| {
                    if m.body.is_empty() {
                        format!("- {}", m.title)
                    } else {
                        format!("- {}: {}", m.title, m.body)
                    }
                })
                .collect();
            sections.push(format!(
                "# Organization facts\n\nShared facts every project in this org should know:\n\n{}",
                facts.join("\n")
            ));
        }
    }

    sections.join("\n\n---\n\n")
}

// --- Turso metadata sync (project) ---

pub async fn ensure_memory_index_table(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
) -> Result<(), String> {
    cloud::turso_execute(
        client,
        cfg,
        "CREATE TABLE IF NOT EXISTS project_memory_index (\
            id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, category TEXT NOT NULL, \
            slug TEXT NOT NULL, title TEXT, summary TEXT, tags TEXT, \
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
        vec![],
    )
    .await?;
    cloud::turso_execute(
        client,
        cfg,
        "CREATE UNIQUE INDEX IF NOT EXISTS project_memory_index_unq \
         ON project_memory_index (project_id, category, slug)",
        vec![],
    )
    .await?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn push_memory_to_cloud(
    app: &AppHandle,
    project_id: Option<&str>,
    category: &str,
    slug: &str,
    title: &str,
    summary: &str,
    tags: &str,
) {
    let Some(project_id) = project_id else { return };
    let Ok(cfg) = cloud::turso_config() else {
        return;
    };
    let client = reqwest::Client::new();
    if ensure_memory_index_table(&client, &cfg).await.is_err() {
        return;
    }
    let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let result = cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO project_memory_index (id, project_id, category, slug, title, summary, tags, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(project_id, category, slug) DO UPDATE SET \
           title = excluded.title, summary = excluded.summary, tags = excluded.tags, \
           updated_at = excluded.updated_at",
        vec![
            Some(Ulid::new().to_string()),
            Some(project_id.to_string()),
            Some(category.to_string()),
            Some(slug.to_string()),
            Some(title.to_string()),
            Some(summary.to_string()),
            Some(tags.to_string()),
            Some(ts),
        ],
    )
    .await;
    if result.is_ok() {
        crate::sync_manager::sync_on_update(app, "project", project_id).await;
    }
}

async fn delete_memory_from_cloud(
    app: &AppHandle,
    project_id: Option<&str>,
    category: &str,
    slug: &str,
) {
    let Some(project_id) = project_id else { return };
    let Ok(cfg) = cloud::turso_config() else {
        return;
    };
    let client = reqwest::Client::new();
    if ensure_memory_index_table(&client, &cfg).await.is_err() {
        return;
    }
    let result = cloud::turso_execute(
        &client,
        &cfg,
        "DELETE FROM project_memory_index WHERE project_id = ? AND category = ? AND slug = ?",
        vec![
            Some(project_id.to_string()),
            Some(category.to_string()),
            Some(slug.to_string()),
        ],
    )
    .await;
    if result.is_ok() {
        crate::sync_manager::sync_on_update(app, "project", project_id).await;
    }
}

/// Read the project memory index from Turso (used by the sync layer).
/// Returns `(category, slug, title, summary, tags)`.
pub async fn fetch_cloud_memory(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
    project_id: &str,
) -> Vec<(String, String, String, String, String)> {
    if ensure_memory_index_table(client, cfg).await.is_err() {
        return Vec::new();
    }
    let Ok(result) = cloud::turso_execute(
        client,
        cfg,
        "SELECT category, slug, title, summary, tags FROM project_memory_index WHERE project_id = ?",
        vec![Some(project_id.to_string())],
    )
    .await
    else {
        return Vec::new();
    };
    rows(&result)
        .iter()
        .map(|row| {
            (
                cell_text(row, 0),
                cell_text(row, 1),
                cell_opt(row, 2).unwrap_or_default(),
                cell_opt(row, 3).unwrap_or_default(),
                cell_opt(row, 4).unwrap_or_default(),
            )
        })
        .collect()
}

pub fn cached_memory_from(
    rows: Vec<(String, String, String, String, String)>,
) -> Vec<CachedMemory> {
    rows.into_iter()
        .map(|(category, slug, title, summary, tags)| CachedMemory {
            category,
            slug,
            title,
            summary,
            tags,
        })
        .collect()
}

// --- Turso (org memory: shared facts, content included) ---

pub async fn ensure_org_memory_table(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
) -> Result<(), String> {
    cloud::turso_execute(
        client,
        cfg,
        "CREATE TABLE IF NOT EXISTS org_memory_index (\
            id TEXT PRIMARY KEY NOT NULL, org_id TEXT NOT NULL, slug TEXT NOT NULL, \
            title TEXT, body TEXT, tags TEXT, \
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
        vec![],
    )
    .await?;
    cloud::turso_execute(
        client,
        cfg,
        "CREATE UNIQUE INDEX IF NOT EXISTS org_memory_index_unq ON org_memory_index (org_id, slug)",
        vec![],
    )
    .await?;
    Ok(())
}

/// Read org memory from Turso (used by the sync layer).
pub async fn fetch_cloud_org_memory(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
    org_id: &str,
) -> Vec<CachedOrgMemory> {
    if ensure_org_memory_table(client, cfg).await.is_err() {
        return Vec::new();
    }
    let Ok(result) = cloud::turso_execute(
        client,
        cfg,
        "SELECT slug, title, body, tags FROM org_memory_index WHERE org_id = ?",
        vec![Some(org_id.to_string())],
    )
    .await
    else {
        return Vec::new();
    };
    rows(&result)
        .iter()
        .map(|row| CachedOrgMemory {
            slug: cell_text(row, 0),
            title: cell_opt(row, 1).unwrap_or_default(),
            body: cell_opt(row, 2).unwrap_or_default(),
            tags: cell_opt(row, 3).unwrap_or_default(),
        })
        .collect()
}
