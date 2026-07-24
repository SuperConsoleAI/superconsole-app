// Phase 20: Wiki — user-curated, structured project knowledge. Distinct from
// memory (agent-learned, rolling): wiki is permanent reference the user wants
// the agent to always be able to look up.
//
// Content lives in workspace files (`.superconsole/wiki/<slug>.md`, each with
// YAML frontmatter) plus an auto-maintained `_index.md` (slug + one-line
// summary per page) — the Karpathy index pattern: the agent reads the small
// index, then fetches only the page(s) it needs. Local SQLite (`wiki_pages`)
// holds a metadata index. Turso (`wiki_index`) stores FULL content (wiki is
// structured + predictable size) so teammates and fresh devices get it without
// pulling git.
//
// Agent-side automations (wiki_suggest -> inbox, LLM auto-seed reformatting) are
// the Phase 16 MCP layer; here we ship the deterministic primitives.

use crate::cloud::{self, cell_opt, cell_text, rows};
use crate::db::{CachedWiki, Db};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use ulid::Ulid;

const WIKI_DIR: &str = ".superconsole/wiki";
const INDEX_FILE: &str = "_index.md";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WikiPage {
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub updated: String,
    pub body: String,
    /// "file" (on disk in this workspace) or "cloud" (synced from another
    /// device / teammate; full content is available from the cloud mirror).
    pub source: String,
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
        "page".into()
    } else {
        s.chars().take(60).collect()
    }
}

fn today() -> String {
    chrono::Utc::now().format("%Y-%m-%d").to_string()
}

fn wiki_dir(ws_path: &str) -> PathBuf {
    Path::new(ws_path).join(WIKI_DIR)
}

fn page_file(ws_path: &str, slug: &str) -> PathBuf {
    wiki_dir(ws_path).join(format!("{}.md", slug))
}

fn rel_path(slug: &str) -> String {
    format!("{}/{}.md", WIKI_DIR, slug)
}

// --- frontmatter parse / serialize ---

fn one_line(text: &str) -> String {
    text.lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty() && !l.starts_with('#'))
        .map(|l| l.chars().take(160).collect())
        .unwrap_or_default()
}

fn parse_tags(value: &str) -> Vec<String> {
    value
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .split(',')
        .map(|t| t.trim().trim_matches('"').trim_matches('\'').to_string())
        .filter(|t| !t.is_empty())
        .collect()
}

fn parse_page(slug_fallback: &str, content: &str) -> WikiPage {
    let mut slug = slug_fallback.to_string();
    let mut title = String::new();
    let mut summary = String::new();
    let mut tags = Vec::new();
    let mut updated = String::new();
    let mut body = content.trim().to_string();

    if let Some(rest) = content.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            let fm = &rest[..end];
            body = rest[end + 4..].trim().to_string();
            for line in fm.lines() {
                let Some((k, v)) = line.split_once(':') else {
                    continue;
                };
                let key = k.trim().to_lowercase();
                let val = v.trim().to_string();
                match key.as_str() {
                    "slug" => slug = val,
                    "title" => title = val,
                    "summary" => summary = val,
                    "tags" => tags = parse_tags(&val),
                    "updated" => updated = val,
                    _ => {}
                }
            }
        }
    }
    if title.is_empty() {
        title = slug_fallback.replace('-', " ");
    }
    if summary.is_empty() {
        summary = one_line(&body);
    }
    WikiPage {
        slug,
        title,
        summary,
        tags,
        updated,
        body,
        source: "file".into(),
    }
}

fn serialize_page(p: &WikiPage) -> String {
    let updated = if p.updated.is_empty() {
        today()
    } else {
        p.updated.clone()
    };
    let tags = p
        .tags
        .iter()
        .map(|t| t.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "---\nslug: {}\ntitle: {}\nsummary: {}\ntags: [{}]\nupdated: {}\n---\n\n{}\n",
        p.slug,
        p.title,
        p.summary,
        tags,
        updated,
        p.body.trim()
    )
}

fn scan_pages(ws_path: &str) -> Vec<WikiPage> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(wiki_dir(ws_path)) else {
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
        if name == "_index" {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(&path) {
            out.push(parse_page(name, &content));
        }
    }
    out.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    out
}

// --- file-based core helpers (no AppHandle), shared with the MCP tool layer ---

pub fn pages(ws_path: &str) -> Vec<WikiPage> {
    scan_pages(ws_path)
}

pub fn page_body(ws_path: &str, slug: &str) -> Option<String> {
    std::fs::read_to_string(page_file(ws_path, slug)).ok()
}

// --- _index.md + SQLite index maintenance ---

fn rebuild_index_file(ws_path: &str, pages: &[WikiPage]) -> Result<(), String> {
    std::fs::create_dir_all(wiki_dir(ws_path)).map_err(|e| e.to_string())?;
    let mut out = String::from(
        "# Wiki index\n\nRead this index first, then fetch only the page(s) you need.\n\n",
    );
    for p in pages {
        out.push_str(&format!("- [{}]({}.md) — {}\n", p.title, p.slug, p.summary));
    }
    std::fs::write(wiki_dir(ws_path).join(INDEX_FILE), out).map_err(|e| e.to_string())
}

fn reindex(db: &Db, workspace_id: i64, pages: &[WikiPage]) {
    for p in pages {
        let _ = db.upsert_wiki_page(
            workspace_id,
            &p.slug,
            &p.title,
            &p.summary,
            &p.tags.join(","),
            &rel_path(&p.slug),
        );
    }
    let live: std::collections::HashSet<String> = pages.iter().map(|p| p.slug.clone()).collect();
    for row in db.list_wiki_pages(workspace_id) {
        if !live.contains(&row.slug) {
            let _ = db.delete_wiki_page(workspace_id, &row.slug);
        }
    }
}

/// Rebuild `_index.md` + the SQLite index from the on-disk pages.
fn resync_local(db: &Db, workspace_id: i64, ws_path: &str) -> Result<Vec<WikiPage>, String> {
    let pages = scan_pages(ws_path);
    rebuild_index_file(ws_path, &pages)?;
    reindex(db, workspace_id, &pages);
    Ok(pages)
}

// --- commands ---

#[tauri::command]
pub fn list_wiki(app: AppHandle, workspace_id: i64) -> Result<Vec<WikiPage>, String> {
    let db = app.state::<Db>();
    let ws = db.get_workspace(workspace_id)?;
    let mut pages = resync_local(&db, workspace_id, &ws.path)?;

    if let Some(pid) = &ws.project_id {
        for c in db.get_cached_wiki(pid) {
            if !pages.iter().any(|p| p.slug == c.slug) {
                pages.push(WikiPage {
                    slug: c.slug,
                    title: c.title,
                    summary: c.summary,
                    tags: c
                        .tags
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect(),
                    updated: String::new(),
                    body: c.content,
                    source: "cloud".into(),
                });
            }
        }
    }
    Ok(pages)
}

/// The `wiki_read(slug)` primitive: the full page content on demand.
#[tauri::command]
pub fn read_wiki(app: AppHandle, workspace_id: i64, slug: String) -> Result<String, String> {
    let db = app.state::<Db>();
    let ws = db.get_workspace(workspace_id)?;
    if let Some(content) = std::fs::read_to_string(page_file(&ws.path, &slug)).ok() {
        return Ok(content);
    }
    if let Some(pid) = &ws.project_id {
        if let Some(c) = db.get_cached_wiki(pid).into_iter().find(|c| c.slug == slug) {
            return Ok(c.content);
        }
    }
    Err(format!("Wiki page '{}' not found", slug))
}

/// The `wiki_search(query)` primitive: grep over pages, return matches only.
#[tauri::command]
pub fn search_wiki(
    app: AppHandle,
    workspace_id: i64,
    query: String,
) -> Result<Vec<WikiPage>, String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    let q = query.trim().to_lowercase();
    let pages = scan_pages(&ws.path);
    if q.is_empty() {
        return Ok(pages);
    }
    Ok(pages
        .into_iter()
        .filter(|p| {
            p.title.to_lowercase().contains(&q)
                || p.summary.to_lowercase().contains(&q)
                || p.body.to_lowercase().contains(&q)
                || p.tags.iter().any(|t| t.to_lowercase().contains(&q))
        })
        .collect())
}

#[tauri::command]
pub async fn write_wiki(
    app: AppHandle,
    workspace_id: i64,
    slug: Option<String>,
    title: String,
    summary: String,
    tags: Vec<String>,
    body: String,
) -> Result<WikiPage, String> {
    if title.trim().is_empty() {
        return Err("Title is required".into());
    }
    let (ws_path, project_id) = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id)?;
        (ws.path, ws.project_id)
    };
    let slug = slug
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| slugify(&title));
    let clean_tags: Vec<String> = tags
        .into_iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();
    let page = WikiPage {
        slug: slug.clone(),
        title: title.trim().to_string(),
        summary: if summary.trim().is_empty() {
            one_line(&body)
        } else {
            summary.trim().to_string()
        },
        tags: clean_tags,
        updated: today(),
        body: body.trim().to_string(),
        source: "file".into(),
    };
    std::fs::create_dir_all(wiki_dir(&ws_path)).map_err(|e| e.to_string())?;
    std::fs::write(page_file(&ws_path, &slug), serialize_page(&page)).map_err(|e| e.to_string())?;
    {
        let db = app.state::<Db>();
        resync_local(&db, workspace_id, &ws_path)?;
    }
    push_wiki_to_cloud(
        &app,
        project_id.as_deref(),
        &page.slug,
        &page.title,
        &page.summary,
        &page.tags.join(","),
        &serialize_page(&page),
    )
    .await;
    Ok(page)
}

#[tauri::command]
pub async fn delete_wiki(app: AppHandle, workspace_id: i64, slug: String) -> Result<(), String> {
    let (ws_path, project_id) = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id)?;
        (ws.path, ws.project_id)
    };
    let file = page_file(&ws_path, &slug);
    if file.exists() {
        std::fs::remove_file(&file).map_err(|e| e.to_string())?;
    }
    {
        let db = app.state::<Db>();
        let _ = resync_local(&db, workspace_id, &ws_path);
    }
    delete_wiki_from_cloud(&app, project_id.as_deref(), &slug).await;
    Ok(())
}

/// Deterministic seed: turn existing context files (README, CLAUDE.md,
/// brand-voice, docs/*.md) into wiki pages. Content is copied, not reformatted
/// (LLM reformatting is the Phase 16 agent's job). Skips pages that exist.
#[tauri::command]
pub async fn seed_wiki_from_files(
    app: AppHandle,
    workspace_id: i64,
) -> Result<Vec<WikiPage>, String> {
    let (ws_path, project_id) = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id)?;
        (ws.path, ws.project_id)
    };
    let existing: std::collections::HashSet<String> =
        scan_pages(&ws_path).into_iter().map(|p| p.slug).collect();

    let mut candidates: Vec<(String, PathBuf)> = Vec::new();
    for name in ["README.md", "CLAUDE.md", "brand-voice.md", "AGENTS.md"] {
        candidates.push((
            name.trim_end_matches(".md").to_string(),
            Path::new(&ws_path).join(name),
        ));
    }
    if let Ok(entries) = std::fs::read_dir(Path::new(&ws_path).join("docs")) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    candidates.push((stem.to_string(), path));
                }
            }
        }
    }

    let mut created = Vec::new();
    for (raw_title, path) in candidates {
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        if content.trim().is_empty() {
            continue;
        }
        let title = raw_title.replace(['-', '_'], " ");
        let slug = slugify(&title);
        if existing.contains(&slug) || created.iter().any(|p: &WikiPage| p.slug == slug) {
            continue;
        }
        let page = WikiPage {
            slug: slug.clone(),
            title,
            summary: one_line(&content),
            tags: vec!["seeded".into()],
            updated: today(),
            body: content.trim().to_string(),
            source: "file".into(),
        };
        std::fs::create_dir_all(wiki_dir(&ws_path)).map_err(|e| e.to_string())?;
        std::fs::write(page_file(&ws_path, &slug), serialize_page(&page))
            .map_err(|e| e.to_string())?;
        created.push(page);
    }

    let pages = {
        let db = app.state::<Db>();
        resync_local(&db, workspace_id, &ws_path)?
    };
    for p in &created {
        push_wiki_to_cloud(
            &app,
            project_id.as_deref(),
            &p.slug,
            &p.title,
            &p.summary,
            &p.tags.join(","),
            &serialize_page(p),
        )
        .await;
    }
    Ok(pages)
}

// --- runtime: system-prompt index (never full dump) ---

/// The wiki `_index` for the chat system prompt: page titles + one-line
/// summaries. The agent reads pages on demand via wiki_read / wiki_search.
pub fn wiki_context(app: &AppHandle, workspace_id: i64) -> String {
    let db = app.state::<Db>();
    let Ok(ws) = db.get_workspace(workspace_id) else {
        return String::new();
    };
    let mut pages = scan_pages(&ws.path);
    if pages.is_empty() {
        if let Some(pid) = &ws.project_id {
            for c in db.get_cached_wiki(pid) {
                pages.push(WikiPage {
                    slug: c.slug,
                    title: c.title,
                    summary: c.summary,
                    tags: Vec::new(),
                    updated: String::new(),
                    body: String::new(),
                    source: "cloud".into(),
                });
            }
        }
    }
    if pages.is_empty() {
        return String::new();
    }
    let list = pages
        .iter()
        .map(|p| format!("- {} ({}): {}", p.title, p.slug, p.summary))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "# Wiki (index)\n\nUser-curated reference for this project. Only titles + summaries are \
         listed; read a page on demand (wiki_read) to load its full content.\n\n{}",
        list
    )
}

// --- Turso sync (full content; wiki is structured + predictable size) ---

pub async fn ensure_wiki_index_table(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
) -> Result<(), String> {
    cloud::turso_execute(
        client,
        cfg,
        "CREATE TABLE IF NOT EXISTS wiki_index (\
            id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, slug TEXT NOT NULL, \
            title TEXT, summary TEXT, tags TEXT, content TEXT, \
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
        vec![],
    )
    .await?;
    cloud::turso_execute(
        client,
        cfg,
        "CREATE UNIQUE INDEX IF NOT EXISTS wiki_index_unq ON wiki_index (project_id, slug)",
        vec![],
    )
    .await?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn push_wiki_to_cloud(
    app: &AppHandle,
    project_id: Option<&str>,
    slug: &str,
    title: &str,
    summary: &str,
    tags: &str,
    content: &str,
) {
    let Some(project_id) = project_id else { return };
    let Ok(cfg) = cloud::turso_config() else {
        return;
    };
    let client = reqwest::Client::new();
    if ensure_wiki_index_table(&client, &cfg).await.is_err() {
        return;
    }
    let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let result = cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO wiki_index (id, project_id, slug, title, summary, tags, content, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(project_id, slug) DO UPDATE SET \
           title = excluded.title, summary = excluded.summary, tags = excluded.tags, \
           content = excluded.content, updated_at = excluded.updated_at",
        vec![
            Some(Ulid::new().to_string()),
            Some(project_id.to_string()),
            Some(slug.to_string()),
            Some(title.to_string()),
            Some(summary.to_string()),
            Some(tags.to_string()),
            Some(content.to_string()),
            Some(ts),
        ],
    )
    .await;
    if result.is_ok() {
        crate::sync_manager::sync_on_update(app, "project", project_id).await;
    }
}

async fn delete_wiki_from_cloud(app: &AppHandle, project_id: Option<&str>, slug: &str) {
    let Some(project_id) = project_id else { return };
    let Ok(cfg) = cloud::turso_config() else {
        return;
    };
    let client = reqwest::Client::new();
    if ensure_wiki_index_table(&client, &cfg).await.is_err() {
        return;
    }
    let result = cloud::turso_execute(
        &client,
        &cfg,
        "DELETE FROM wiki_index WHERE project_id = ? AND slug = ?",
        vec![Some(project_id.to_string()), Some(slug.to_string())],
    )
    .await;
    if result.is_ok() {
        crate::sync_manager::sync_on_update(app, "project", project_id).await;
    }
}

/// Read wiki pages (full content) from Turso (used by the sync layer).
pub async fn fetch_cloud_wiki(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
    project_id: &str,
) -> Vec<CachedWiki> {
    if ensure_wiki_index_table(client, cfg).await.is_err() {
        return Vec::new();
    }
    let Ok(result) = cloud::turso_execute(
        client,
        cfg,
        "SELECT slug, title, summary, tags, content FROM wiki_index WHERE project_id = ?",
        vec![Some(project_id.to_string())],
    )
    .await
    else {
        return Vec::new();
    };
    rows(&result)
        .iter()
        .map(|row| CachedWiki {
            slug: cell_text(row, 0),
            title: cell_opt(row, 1).unwrap_or_default(),
            summary: cell_opt(row, 2).unwrap_or_default(),
            tags: cell_opt(row, 3).unwrap_or_default(),
            content: cell_opt(row, 4).unwrap_or_default(),
        })
        .collect()
}
