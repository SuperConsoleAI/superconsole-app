// Phase 18 — Skills (desktop).
//
// A skill is a markdown file with frontmatter living in the workspace at
// `.superconsole/skills/<name>.md`. Files are the source of truth: any CLI
// (Claude Code, Droid) reads them natively. Local SQLite holds an index only
// (the `active` flag + metadata for fast lookup); Turso holds metadata only
// (`project_skill_index`) so the set of skills is visible across devices.
// Skill *content* is never stored in a DB — only on disk, synced via git.
//
// At runtime active skills are surfaced two ways: their names+descriptions are
// injected into the native-chat system prompt, and each is exposed as a
// `/<name>` slash command whose body is fetched on demand (the skill_view
// pattern), never preloaded.

use crate::cloud::{self};
use crate::db::Db;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use ulid::Ulid;

const SKILLS_DIR: &str = ".superconsole/skills";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub scope: String,
    pub version: u32,
    pub auto: bool,
    pub active: bool,
    pub file_path: String,
    /// "superconsole" | "claude_command" | "agents_md" — where it was found.
    pub source: String,
    pub author: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibrarySkill {
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub category: String,
    pub author: String,
    pub body: String,
}

// --- machine-global library location ---

/// The machine-global skill library: `<app_data_dir>/skills`. This is the
/// single content store ("what the machine already has") and backs the
/// account scope. Org/project scopes reference these by name.
fn global_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("skills");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn global_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(global_dir(app)?.join(format!("{}.md", name)))
}

// --- name + path safety ---

fn sanitize_name(name: &str) -> Result<String, String> {
    let slug = name.trim().to_lowercase().replace(' ', "-");
    if slug.is_empty()
        || !slug
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Skill name must be alphanumeric (dashes/underscores allowed)".into());
    }
    Ok(slug)
}

fn skills_dir(ws_path: &str) -> PathBuf {
    Path::new(ws_path).join(SKILLS_DIR)
}

/// Flat layout (legacy): `.superconsole/skills/<name>.md`
fn skill_file(ws_path: &str, name: &str) -> PathBuf {
    skills_dir(ws_path).join(format!("{}.md", name))
}

/// Folder layout (current): `.superconsole/skills/<name>/SKILL.md`
fn skill_dir(ws_path: &str, name: &str) -> PathBuf {
    skills_dir(ws_path).join(name)
}
fn skill_file_v2(ws_path: &str, name: &str) -> PathBuf {
    skill_dir(ws_path, name).join("SKILL.md")
}

/// Resolve the actual skill file: folder layout preferred, flat as fallback.
pub fn resolve_skill_file(ws_path: &str, name: &str) -> Option<PathBuf> {
    let v2 = skill_file_v2(ws_path, name);
    if v2.exists() {
        return Some(v2);
    }
    let v1 = skill_file(ws_path, name);
    if v1.exists() {
        return Some(v1);
    }
    None
}

/// Same for the global library (`<app_data>/skills/`).
fn global_file_v2(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(global_dir(app)?.join(name).join("SKILL.md"))
}
fn resolve_global_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let v2 = global_file_v2(app, name)?;
    if v2.exists() {
        return Ok(v2);
    }
    let v1 = global_file(app, name)?;
    if v1.exists() {
        return Ok(v1);
    }
    Err(format!("'{}' is not in your global library", name))
}

// --- file-based core helpers (no AppHandle), shared with the MCP tool layer ---

pub fn workspace_skills(ws_path: &str) -> Vec<Skill> {
    scan_dir(ws_path)
}

pub fn workspace_skill_body(ws_path: &str, name: &str) -> Option<String> {
    std::fs::read_to_string(skill_file(ws_path, name)).ok()
}

// --- frontmatter ---

#[derive(Default)]
struct Frontmatter {
    description: String,
    tags: Vec<String>,
    scope: String,
    version: u32,
    auto: bool,
}

fn parse_frontmatter(content: &str) -> Frontmatter {
    let mut fm = Frontmatter {
        scope: "project".into(),
        version: 1,
        ..Default::default()
    };
    let trimmed = content.trim_start();
    let Some(rest) = trimmed.strip_prefix("---") else {
        return fm;
    };
    let Some(end) = rest.find("\n---") else {
        return fm;
    };
    for line in rest[..end].lines() {
        let line = line.trim();
        let Some((key, val)) = line.split_once(':') else {
            continue;
        };
        let val = val.trim();
        match key.trim() {
            "description" => fm.description = val.to_string(),
            "scope" => {
                if !val.is_empty() {
                    fm.scope = val.to_string();
                }
            }
            "version" => fm.version = val.parse().unwrap_or(1),
            "auto" => fm.auto = val == "true",
            "tags" => fm.tags = parse_tags(val),
            _ => {}
        }
    }
    fm
}

fn parse_tags(val: &str) -> Vec<String> {
    val.trim_matches(['[', ']'])
        .split(',')
        .map(|t| t.trim().trim_matches(['"', '\'']).to_string())
        .filter(|t| !t.is_empty())
        .collect()
}

fn build_skill_md(
    name: &str,
    description: &str,
    tags: &[String],
    scope: &str,
    body: &str,
) -> String {
    format!(
        "---\nname: {}\ndescription: {}\ntags: [{}]\nscope: {}\nversion: 1\n---\n\n{}\n",
        name,
        description,
        tags.join(", "),
        scope,
        body.trim()
    )
}

// --- scanning ---

fn scan_dir(ws_path: &str) -> Vec<Skill> {
    let dir = skills_dir(ws_path);
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        // ── Folder layout: <name>/SKILL.md ──────────────────────────────────
        if path.is_dir() {
            let skill_md = path.join("SKILL.md");
            if !skill_md.exists() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            let content = std::fs::read_to_string(&skill_md).unwrap_or_default();
            let fm = parse_frontmatter(&content);
            out.push(Skill {
                name: name.to_string(),
                description: fm.description,
                tags: fm.tags,
                scope: fm.scope,
                version: fm.version,
                auto: fm.auto,
                active: true,
                file_path: format!("{}/{}/SKILL.md", SKILLS_DIR, name),
                source: "superconsole".into(),
                author: String::new(),
            });
            continue;
        }
        // ── Flat layout (legacy): <name>.md ─────────────────────────────────
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        // Skip if a folder-layout version already exists (migration in progress)
        if skill_dir(ws_path, name).join("SKILL.md").exists() {
            continue;
        }
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        let fm = parse_frontmatter(&content);
        out.push(Skill {
            name: name.to_string(),
            description: fm.description,
            tags: fm.tags,
            scope: fm.scope,
            version: fm.version,
            auto: fm.auto,
            active: true,
            file_path: format!("{}/{}.md", SKILLS_DIR, name),
            source: "superconsole".into(),
            author: String::new(),
        });
    }
    out
}

/// Detect skills that exist in the repo but outside SuperConsole's folder:
/// `.claude/commands/*.md` and a top-level `AGENTS.md`. These are surfaced so
/// the user can choose to activate them; they are not auto-installed.
fn scan_detected(ws_path: &str) -> Vec<Skill> {
    let mut out = Vec::new();
    let cmds = Path::new(ws_path).join(".claude").join("commands");
    if let Ok(entries) = std::fs::read_dir(&cmds) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                out.push(Skill {
                    name: name.to_string(),
                    description: "Detected Claude Code command".into(),
                    tags: vec!["detected".into()],
                    scope: "project".into(),
                    version: 1,
                    auto: false,
                    active: false,
                    file_path: format!(".claude/commands/{}.md", name),
                    source: "claude_command".into(),
                    author: String::new(),
                });
            }
        }
    }
    if Path::new(ws_path).join("AGENTS.md").is_file() {
        out.push(Skill {
            name: "agents".into(),
            description: "Detected AGENTS.md instructions".into(),
            tags: vec!["detected".into()],
            scope: "project".into(),
            version: 1,
            auto: false,
            active: false,
            file_path: "AGENTS.md".into(),
            source: "agents_md".into(),
            author: String::new(),
        });
    }
    out
}

// --- commands ---

/// Returns the machine-global library skills as LibrarySkill entries.
/// The inline `library()` built-ins are the only source; community catalog
/// is fetched separately via `fetch_skill_catalog`.
#[tauri::command]
pub fn list_skill_library(app: AppHandle) -> Vec<LibrarySkill> {
    // Global library on disk — each installed skill becomes a LibrarySkill
    let disk: Vec<LibrarySkill> = scan_global_as_library(&app);
    if !disk.is_empty() {
        return disk;
    }
    // Nothing on disk yet — empty; user adds via catalog or import
    vec![]
}

/// Convert global library skills (from disk) into LibrarySkill entries.
/// Used by list_skill_library so there is one single source of truth.
fn scan_global_as_library(app: &AppHandle) -> Vec<LibrarySkill> {
    let Ok(dir) = global_dir(app) else {
        return vec![];
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return vec![];
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        // Folder layout: <name>/SKILL.md
        if path.is_dir() {
            let skill_md = path.join("SKILL.md");
            if !skill_md.exists() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            let content = std::fs::read_to_string(&skill_md).unwrap_or_default();
            let fm = parse_frontmatter(&content);
            let body = content
                .find("\n---")
                .and_then(|i| {
                    content[i + 4..]
                        .find("\n")
                        .map(|j| content[i + 4 + j..].trim().to_string())
                })
                .unwrap_or_default();
            out.push(LibrarySkill {
                name: name.to_string(),
                description: fm.description,
                tags: fm.tags,
                category: fm.scope.clone(),
                body,
                author: String::new(),
            });

            continue;
        }
        // Flat layout fallback
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if path
            .parent()
            .map(|p| p.join(name).join("SKILL.md").exists())
            .unwrap_or(false)
        {
            continue;
        }
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        let fm = parse_frontmatter(&content);
        let body = content
            .find("\n---")
            .and_then(|i| {
                content[i + 4..]
                    .find("\n")
                    .map(|j| content[i + 4 + j..].trim().to_string())
            })
            .unwrap_or_default();
        out.push(LibrarySkill {
            name: name.to_string(),
            description: fm.description,
            tags: fm.tags,
            category: fm.scope.clone(),
            body,
            author: String::new(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

// --- project scope: references to global-library skills ---

/// Project skills, deduped by name with precedence
/// `workspace file > project reference > org reference > global library`:
///   1. workspace files in `.superconsole/skills/` (committed, CLI-native)
///   2. local reference index rows
///   3. cloud references synced from other devices
/// References resolve their description/tags against the machine-global library.
#[tauri::command]
pub fn list_skills(app: AppHandle, workspace_id: i64) -> Result<Vec<Skill>, String> {
    let db = app.state::<Db>();
    let ws_path = db.get_workspace(workspace_id)?.path;
    let lib = scan_global(&app);
    let project_id = db.get_workspace_project_id(workspace_id);
    let index = db.list_skill_index(workspace_id);

    let mut out: Vec<Skill> = Vec::new();

    // 1. Workspace files (highest precedence). Persist an index row so the
    //    active flag survives and syncs; overlay the stored active flag.
    for mut s in scan_dir(&ws_path) {
        if let Some(row) = index.iter().find(|r| r.name == s.name) {
            s.active = row.active;
            s.author = row.author.clone();
        } else {
            let _ = db.upsert_skill_index(
                workspace_id,
                &s.name,
                &s.description,
                &s.tags.join(","),
                &s.file_path,
                "project",
                s.auto,
                s.version,
                "superconsole",
                true,
                "",
            );
            s.active = true;
        }
        out.push(s);
    }

    // 2. + 3. References (skip names already provided by a workspace file).
    let mut push_ref = |name: String, active: bool, tags_csv: String, author: String| {
        if out.iter().any(|s| s.name == name) {
            return;
        }
        let g = lib.iter().find(|s| s.name == name);
        let tags = match g {
            Some(g) => g.tags.clone(),
            None => tags_csv
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
        };
        out.push(Skill {
            description: g.map(|s| s.description.clone()).unwrap_or_default(),
            tags,
            scope: "project".into(),
            version: g.map(|s| s.version).unwrap_or(1),
            auto: g.map(|s| s.auto).unwrap_or(false),
            active,
            file_path: format!("skills/{}.md", name),
            source: if g.is_some() {
                "global".into()
            } else {
                "cloud".into()
            },
            author,
            name,
        });
    };

    for r in &index {
        if r.scope == "project" {
            push_ref(r.name.clone(), r.active, r.tags.clone(), r.author.clone());
        }
    }
    if let Some(pid) = &project_id {
        for c in db.get_cached_skills(pid) {
            push_ref(c.skill_name, c.active, c.tags, String::new());
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Skills detected in the repo (`.claude/commands/*.md`, `AGENTS.md`) that are
/// not yet in the global library. The UI can import these into the library.
#[tauri::command]
pub fn scan_detected_skills(app: AppHandle, workspace_id: i64) -> Result<Vec<Skill>, String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    let lib: Vec<String> = scan_global(&app).into_iter().map(|s| s.name).collect();
    Ok(scan_detected(&ws.path)
        .into_iter()
        .filter(|d| !lib.iter().any(|n| n == &d.name))
        .collect())
}

/// Read a workspace-relative file (used to import a detected skill's content
/// into the global library). Path is sandboxed to the workspace.
#[tauri::command]
pub fn read_workspace_skill(
    app: AppHandle,
    workspace_id: i64,
    file_path: String,
) -> Result<String, String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    let rel = Path::new(&file_path);
    if rel.components().any(|c| {
        matches!(
            c,
            std::path::Component::ParentDir
                | std::path::Component::RootDir
                | std::path::Component::Prefix(_)
        )
    }) {
        return Err("Invalid path".into());
    }
    std::fs::read_to_string(Path::new(&ws.path).join(rel)).map_err(|e| e.to_string())
}

/// Attach a global-library skill to a project by copying its content into the
/// repo (`.superconsole/skills/<name>.md`). Project skills are always editable,
/// committable workspace files so the user/agent can improve them per-project
/// without mutating the shared global copy.
#[tauri::command]
pub async fn attach_skill_to_project(
    app: AppHandle,
    workspace_id: i64,
    name: String,
) -> Result<Skill, String> {
    materialize_skill_to_workspace(app, workspace_id, name).await
}

/// Detach a project skill: deletes the workspace file (and reference). Never
/// touches the machine-global library copy.
#[tauri::command]
pub async fn detach_skill_from_project(
    app: AppHandle,
    workspace_id: i64,
    name: String,
) -> Result<(), String> {
    delete_skill(app, workspace_id, name).await
}

#[tauri::command]
pub async fn set_skill_active(
    app: AppHandle,
    workspace_id: i64,
    name: String,
    active: bool,
) -> Result<(), String> {
    let slug = sanitize_name(&name)?;
    let (project_id, tags) = {
        let db = app.state::<Db>();
        db.set_skill_active(workspace_id, &slug, active)?;
        let tags = db
            .list_skill_index(workspace_id)
            .into_iter()
            .find(|r| r.name == slug)
            .map(|r| r.tags)
            .unwrap_or_default();
        (db.get_workspace_project_id(workspace_id), tags)
    };
    let tag_vec: Vec<String> = tags
        .split(',')
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .collect();
    push_skill_to_cloud(
        &app,
        project_id.as_deref(),
        &slug,
        &tag_vec,
        "project",
        active,
        None,
        "",
    )
    .await;
    Ok(())
}

/// Create a new project skill as a committable workspace file
/// (`.superconsole/skills/<name>/SKILL.md`).
#[tauri::command]
pub async fn create_skill(
    app: AppHandle,
    workspace_id: i64,
    name: String,
    description: String,
    tags: Vec<String>,
    body: String,
) -> Result<Skill, String> {
    let slug = sanitize_name(&name)?;
    let (ws_path, project_id) = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id)?;
        (ws.path, ws.project_id)
    };
    // Reject if already present in either layout
    if skill_file_v2(&ws_path, &slug).exists() || skill_file(&ws_path, &slug).exists() {
        return Err(format!("Skill '{}' already exists in this project", slug));
    }
    // Write to folder layout
    let dest_dir = skill_dir(&ws_path, &slug);
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let md = build_skill_md(&slug, &description, &tags, "project", &body);
    std::fs::write(skill_file_v2(&ws_path, &slug), &md).map_err(|e| e.to_string())?;
    let file_path = format!("{}/{}/SKILL.md", SKILLS_DIR, slug);
    app.state::<Db>().upsert_skill_index(
        workspace_id,
        &slug,
        &description,
        &tags.join(","),
        &file_path,
        "project",
        false,
        1,
        "superconsole",
        true,
        "",
    )?;
    push_skill_to_cloud(
        &app,
        project_id.as_deref(),
        &slug,
        &tags,
        "project",
        true,
        None,
        "",
    )
    .await;
    Ok(Skill {
        name: slug.clone(),
        description,
        tags,
        scope: "project".into(),
        version: 1,
        auto: false,
        active: true,
        file_path,
        source: "superconsole".into(),
        author: String::new(),
    })
}

/// Edit a project workspace-file skill's content (folder or flat layout).
#[tauri::command]
pub async fn update_skill(
    app: AppHandle,
    workspace_id: i64,
    name: String,
    content: String,
) -> Result<Skill, String> {
    let slug = sanitize_name(&name)?;
    let (ws_path, project_id) = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id)?;
        (ws.path, ws.project_id)
    };
    let file = resolve_skill_file(&ws_path, &slug)
        .ok_or_else(|| format!("'{}' is not a workspace skill in this project", slug))?;
    std::fs::write(&file, &content).map_err(|e| e.to_string())?;
    let fm = parse_frontmatter(&content);
    let active = app
        .state::<Db>()
        .get_skill_active(workspace_id, &slug)
        .unwrap_or(true);
    let skill = index_skill(
        &app,
        workspace_id,
        &slug,
        &fm.description,
        &fm.tags,
        "project",
        fm.auto,
        fm.version,
    )?;
    app.state::<Db>()
        .set_skill_active(workspace_id, &slug, active)?;
    push_skill_to_cloud(
        &app,
        project_id.as_deref(),
        &slug,
        &fm.tags,
        "project",
        active,
        None,
        "",
    )
    .await;
    Ok(Skill { active, ..skill })
}

/// Remove a project skill. Deletes the workspace file (flat or folder) if present.
#[tauri::command]
pub async fn delete_skill(app: AppHandle, workspace_id: i64, name: String) -> Result<(), String> {
    let slug = sanitize_name(&name)?;
    let (ws_path, project_id) = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id)?;
        (ws.path, ws.project_id)
    };
    // Remove folder layout first
    let dir = skill_dir(&ws_path, &slug);
    if dir.join("SKILL.md").exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    } else {
        let flat = skill_file(&ws_path, &slug);
        if flat.exists() {
            std::fs::remove_file(&flat).map_err(|e| e.to_string())?;
        }
    }
    app.state::<Db>().delete_skill_index(workspace_id, &slug)?;
    delete_skill_from_cloud(&app, project_id.as_deref(), &slug).await;
    Ok(())
}

/// Materialize a global-library skill into the workspace as a committable file
/// at `.superconsole/skills/<name>/SKILL.md`.
#[tauri::command]
pub async fn materialize_skill_to_workspace(
    app: AppHandle,
    workspace_id: i64,
    name: String,
) -> Result<Skill, String> {
    let slug = sanitize_name(&name)?;
    let content = std::fs::read_to_string(resolve_global_file(&app, &slug)?)
        .map_err(|_| format!("'{}' is not in your global library", slug))?;
    let (ws_path, project_id) = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id)?;
        (ws.path, ws.project_id)
    };
    if skill_file_v2(&ws_path, &slug).exists() || skill_file(&ws_path, &slug).exists() {
        return Err(format!("Skill '{}' is already in this project", slug));
    }
    let dest_dir = skill_dir(&ws_path, &slug);
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    std::fs::write(skill_file_v2(&ws_path, &slug), &content).map_err(|e| e.to_string())?;
    let fm = parse_frontmatter(&content);
    let file_path = format!("{}/{}/SKILL.md", SKILLS_DIR, slug);
    let (author, catalog_id) = {
        let lib = library();
        if let Some(entry) = lib.iter().find(|l| l.name == slug) {
            (entry.author.clone(), None::<String>)
        } else {
            (String::new(), None::<String>)
        }
    };
    app.state::<Db>().upsert_skill_index(
        workspace_id,
        &slug,
        &fm.description,
        &fm.tags.join(","),
        &file_path,
        "project",
        fm.auto,
        fm.version,
        "superconsole",
        true,
        &author,
    )?;
    push_skill_to_cloud(
        &app,
        project_id.as_deref(),
        &slug,
        &fm.tags,
        "project",
        true,
        catalog_id.as_deref(),
        &author,
    )
    .await;
    Ok(Skill {
        name: slug.clone(),
        description: fm.description,
        tags: fm.tags,
        scope: "project".into(),
        version: fm.version,
        auto: fm.auto,
        active: true,
        file_path,
        source: "superconsole".into(),
        author: author.clone(),
    })
}

// --- account scope: machine-global library ---

fn scan_global(app: &AppHandle) -> Vec<Skill> {
    let Ok(dir) = global_dir(app) else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        // Folder layout: <name>/SKILL.md
        if path.is_dir() {
            let skill_md = path.join("SKILL.md");
            if !skill_md.exists() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            let content = std::fs::read_to_string(&skill_md).unwrap_or_default();
            let fm = parse_frontmatter(&content);
            out.push(Skill {
                name: name.to_string(),
                description: fm.description,
                tags: fm.tags,
                scope: "account".into(),
                version: fm.version,
                auto: fm.auto,
                active: true,
                file_path: format!("skills/{}/SKILL.md", name),
                source: "global".into(),
                author: String::new(),
            });
            continue;
        }
        // Flat layout fallback
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if path
            .parent()
            .map(|p| p.join(name).join("SKILL.md").exists())
            .unwrap_or(false)
        {
            continue;
        }
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        let fm = parse_frontmatter(&content);
        out.push(Skill {
            name: name.to_string(),
            description: fm.description,
            tags: fm.tags,
            scope: "account".into(),
            version: fm.version,
            auto: fm.auto,
            active: true,
            file_path: format!("skills/{}.md", name),
            source: "global".into(),
            author: String::new(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

#[tauri::command]
pub fn list_global_skills(app: AppHandle) -> Result<Vec<Skill>, String> {
    Ok(scan_global(&app))
}

#[tauri::command]
pub fn get_global_skill(app: AppHandle, name: String) -> Result<String, String> {
    let slug = sanitize_name(&name)?;
    let file = resolve_global_file(&app, &slug)?;
    std::fs::read_to_string(file).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_global_skill(
    app: AppHandle,
    name: String,
    description: String,
    tags: Vec<String>,
    body: String,
) -> Result<Skill, String> {
    let slug = sanitize_name(&name)?;
    // Reject if already present in either layout
    if global_file_v2(&app, &slug)?.exists() || global_file(&app, &slug)?.exists() {
        return Err(format!("Skill '{}' already exists in your library", slug));
    }
    // Write folder layout
    let dest_dir = global_dir(&app)?.join(&slug);
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let md = build_skill_md(&slug, &description, &tags, "account", &body);
    std::fs::write(dest_dir.join("SKILL.md"), md).map_err(|e| e.to_string())?;
    Ok(Skill {
        name: slug.clone(),
        description,
        tags,
        scope: "account".into(),
        version: 1,
        auto: false,
        active: true,
        file_path: format!("skills/{}/SKILL.md", slug),
        source: "global".into(),
        author: String::new(),
    })
}

#[tauri::command]
pub fn update_global_skill(app: AppHandle, name: String, content: String) -> Result<(), String> {
    let slug = sanitize_name(&name)?;
    let file = global_file(&app, &slug)?;
    if !file.exists() {
        return Err(format!("Skill '{}' not found", slug));
    }
    std::fs::write(&file, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_global_skill(app: AppHandle, name: String) -> Result<(), String> {
    let slug = sanitize_name(&name)?;
    let file = global_file(&app, &slug)?;
    if file.exists() {
        std::fs::remove_file(&file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn install_library_skill_global(app: AppHandle, name: String) -> Result<Skill, String> {
    let entry = library()
        .into_iter()
        .find(|l| l.name == name)
        .ok_or_else(|| format!("'{}' is not in the library", name))?;
    create_global_skill(app, entry.name, entry.description, entry.tags, entry.body)
}

#[tauri::command]
pub async fn import_global_skill_from_url(
    app: AppHandle,
    url: String,
    name: Option<String>,
) -> Result<Skill, String> {
    let content = fetch_skill_url(&url).await?;
    let fm = parse_frontmatter(&content);
    let derived = url
        .rsplit('/')
        .next()
        .map(|s| s.trim_end_matches(".md"))
        .unwrap_or("imported-skill");
    let slug = sanitize_name(&name.unwrap_or_else(|| derived.to_string()))?;
    let file = global_file(&app, &slug)?;
    if file.exists() {
        return Err(format!("Skill '{}' already exists in your library", slug));
    }
    std::fs::write(&file, &content).map_err(|e| e.to_string())?;
    Ok(Skill {
        name: slug.clone(),
        description: fm.description,
        tags: fm.tags,
        scope: "account".into(),
        version: fm.version,
        auto: fm.auto,
        active: true,
        file_path: format!("skills/{}.md", slug),
        source: "global".into(),
        author: String::new(),
    })
}

// --- org scope: references to global-library skills (Turso metadata) ---

/// Org-attached skills, read from the local mirror cache. `installed` marks
/// whether this machine has the referenced skill in its global library.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrgSkillView {
    pub name: String,
    pub tags: Vec<String>,
    pub in_library: bool,
    pub skill_catalog_id: Option<String>,
    pub author: String,
}

#[tauri::command]
pub fn list_org_skills(app: AppHandle, org_id: String) -> Result<Vec<OrgSkillView>, String> {
    let db = app.state::<Db>();
    let lib: Vec<String> = scan_global(&app).into_iter().map(|s| s.name).collect();
    Ok(db
        .get_cached_org_skills(&org_id)
        .into_iter()
        .map(|c| OrgSkillView {
            in_library: lib.iter().any(|n| n == &c.skill_name),
            tags: c
                .tags
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            name: c.skill_name,
            skill_catalog_id: c.skill_catalog_id,
            author: c.author,
        })
        .collect())
}

#[tauri::command]
pub async fn attach_org_skill(app: AppHandle, org_id: String, name: String) -> Result<(), String> {
    let slug = sanitize_name(&name)?;
    let tags: Vec<String> = scan_global(&app)
        .into_iter()
        .find(|s| s.name == slug)
        .map(|s| s.tags)
        .unwrap_or_default();
    push_org_skill_to_cloud(&app, &org_id, &slug, &tags, true).await;
    Ok(())
}

#[tauri::command]
pub async fn detach_org_skill(app: AppHandle, org_id: String, name: String) -> Result<(), String> {
    let slug = sanitize_name(&name)?;
    push_org_skill_to_cloud(&app, &org_id, &slug, &[], false).await;
    Ok(())
}

// --- helpers ---

async fn fetch_skill_url(url: &str) -> Result<String, String> {
    let raw = github_raw(url);
    let client = reqwest::Client::new();
    let resp = client
        .get(&raw)
        .header("User-Agent", "SuperConsole")
        .send()
        .await
        .map_err(|e| format!("fetch failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("fetch failed: {}", resp.status()));
    }
    resp.text().await.map_err(|e| e.to_string())
}

#[allow(dead_code)]
fn write_skill_file(
    ws_path: &str,
    slug: &str,
    description: &str,
    tags: &[String],
    scope: &str,
    body: &str,
) -> Result<(), String> {
    std::fs::create_dir_all(skills_dir(ws_path)).map_err(|e| e.to_string())?;
    let md = build_skill_md(slug, description, tags, scope, body);
    std::fs::write(skill_file(ws_path, slug), md).map_err(|e| e.to_string())
}

#[allow(clippy::too_many_arguments)]
fn index_skill(
    app: &AppHandle,
    workspace_id: i64,
    slug: &str,
    description: &str,
    tags: &[String],
    scope: &str,
    auto: bool,
    version: u32,
) -> Result<Skill, String> {
    let file_path = format!("{}/{}.md", SKILLS_DIR, slug);
    app.state::<Db>().upsert_skill_index(
        workspace_id,
        slug,
        description,
        &tags.join(","),
        &file_path,
        scope,
        auto,
        version,
        "superconsole",
        true,
        "",
    )?;
    Ok(Skill {
        name: slug.to_string(),
        description: description.to_string(),
        tags: tags.to_vec(),
        scope: scope.to_string(),
        version,
        auto,
        active: true,
        file_path,
        source: "superconsole".into(),
        author: String::new(),
    })
}

fn github_raw(url: &str) -> String {
    // github.com/owner/repo/blob/branch/path -> raw.githubusercontent.com/...
    if let Some(rest) = url.strip_prefix("https://github.com/") {
        if let Some((repo_path, file)) = rest.split_once("/blob/") {
            return format!("https://raw.githubusercontent.com/{}/{}", repo_path, file);
        }
    }
    url.to_string()
}

// --- runtime: system-prompt names + slash-command exposure ---

/// `(name, description)` for skills available to the agent in this workspace.
/// Merges, with later sources overriding earlier ones by name:
///   1. account (machine-global library — always available)
///   2. org references attached to the workspace's org
///   3. project references active in the workspace
///   4. project workspace files (.superconsole/skills/, highest precedence)
/// Used by chat.rs (system prompt) and lib.rs (slash-command list). Reads local
/// files + the local cache only; never hits the network.
pub fn active_skills(app: &AppHandle, workspace_id: i64) -> Vec<(String, String)> {
    let mut merged: Vec<(String, String)> = Vec::new();
    let mut upsert = |name: String, desc: String| {
        if let Some(slot) = merged.iter_mut().find(|(n, _)| n == &name) {
            slot.1 = desc;
        } else {
            merged.push((name, desc));
        }
    };

    for s in scan_global(app) {
        upsert(s.name, s.description);
    }

    let db = app.state::<Db>();
    if let Some(project_id) = db.get_workspace_project_id(workspace_id) {
        if let Some(org_id) = db.get_project_org(&project_id) {
            let lib = scan_global(app);
            for c in db.get_cached_org_skills(&org_id) {
                let desc = lib
                    .iter()
                    .find(|s| s.name == c.skill_name)
                    .map(|s| s.description.clone())
                    .unwrap_or_default();
                upsert(c.skill_name, desc);
            }
        }
    }

    for r in db
        .list_skill_index(workspace_id)
        .into_iter()
        .filter(|r| r.active)
    {
        upsert(r.name, r.description);
    }

    // Workspace files have the highest precedence and are always CLI-visible;
    // include any not toggled inactive (default active when no index row).
    if let Ok(ws) = db.get_workspace(workspace_id) {
        for s in scan_dir(&ws.path) {
            if db.get_skill_active(workspace_id, &s.name).unwrap_or(true) {
                upsert(s.name, s.description);
            }
        }
    }

    merged
}

// --- Turso metadata sync (best-effort; never blocks the UI on the network) ---

#[allow(dead_code)]
pub async fn ensure_skill_index_table(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
) -> Result<(), String> {
    cloud::turso_execute(
        client,
        cfg,
        "CREATE TABLE IF NOT EXISTS project_skill_index (\
            id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, skill_name TEXT NOT NULL, \
            tags TEXT, scope TEXT NOT NULL DEFAULT 'project', active INTEGER NOT NULL DEFAULT 1, \
            skill_catalog_id TEXT, author TEXT NOT NULL DEFAULT '', \
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
        vec![],
    )
    .await?;
    cloud::turso_execute(
        client,
        cfg,
        "CREATE UNIQUE INDEX IF NOT EXISTS project_skill_index_unq \
         ON project_skill_index (project_id, skill_name)",
        vec![],
    )
    .await?;
    let _ = cloud::turso_execute(
        client,
        cfg,
        "ALTER TABLE project_skill_index ADD COLUMN skill_catalog_id TEXT",
        vec![],
    )
    .await;
    let _ = cloud::turso_execute(
        client,
        cfg,
        "ALTER TABLE project_skill_index ADD COLUMN author TEXT NOT NULL DEFAULT ''",
        vec![],
    )
    .await;
    let _ = cloud::turso_execute(
        client,
        cfg,
        "ALTER TABLE project_skill_index ADD COLUMN skill_catalog_id TEXT",
        vec![],
    )
    .await;
    let _ = cloud::turso_execute(
        client,
        cfg,
        "ALTER TABLE project_skill_index ADD COLUMN author TEXT NOT NULL DEFAULT ''",
        vec![],
    )
    .await;
    Ok(())
}

// Mirrors connectors.rs: write to Turso, then sync_on_update to refresh the
// local cache. No-op (offline-safe) when the workspace has no cloud project.
#[allow(dead_code)]
pub async fn push_skill_to_cloud(
    _app: &AppHandle,
    _project_id: Option<&str>,
    _skill_name: &str,
    _tags: &[String],
    _scope: &str,
    _active: bool,
    _skill_catalog_id: Option<&str>,
    _author: &str,
) {
    // Skills are stored 100% locally on user machine (no cloud index table sync)
}

#[allow(dead_code)]
async fn delete_skill_from_cloud(_app: &AppHandle, _project_id: Option<&str>, _skill_name: &str) {
    // Skills are stored 100% locally on user machine (no cloud index table sync)
}

/// Read cloud skill metadata for a project. Returns empty list as skills are local-only.
#[allow(dead_code)]
pub async fn fetch_cloud_skills(
    _client: &reqwest::Client,
    _cfg: &cloud::TursoConfig,
    _project_id: &str,
) -> Vec<(String, String, String, bool)> {
    Vec::new()
}

// --- org references (Turso metadata) ---

#[allow(dead_code)]
pub async fn ensure_org_skill_table(
    _client: &reqwest::Client,
    _cfg: &cloud::TursoConfig,
) -> Result<(), String> {
    Ok(())
}

#[allow(dead_code)]
async fn push_org_skill_to_cloud(
    _app: &AppHandle,
    _org_id: &str,
    _skill_name: &str,
    _tags: &[String],
    _attach: bool,
) {
    // Skills are stored 100% locally on user machine (no cloud index table sync)
}

/// Read org skill references from Turso (used by the sync layer).
#[allow(dead_code)]
pub async fn fetch_cloud_org_skills(
    _client: &reqwest::Client,
    _cfg: &cloud::TursoConfig,
    _org_id: &str,
) -> Vec<(String, String, Option<String>, String)> {
    Vec::new()
}

// --- built-in library (ships with the app) ---

fn lib(name: &str, description: &str, category: &str, tags: &[&str], body: &str) -> LibrarySkill {
    LibrarySkill {
        name: name.into(),
        description: description.into(),
        category: category.into(),
        tags: tags.iter().map(|s| s.to_string()).collect(),
        body: body.trim().to_string(),
        author: String::new(),
    }
}

fn library() -> Vec<LibrarySkill> {
    vec![
        // Content
        lib("write-blog-post", "Write an SEO-optimized blog post in the brand voice", "content", &["content", "seo", "writing"],
            "## Instructions\nWrite a blog post in the brand voice (check memory/wiki).\nAlways include: title, meta description, 3-5 headings, a CTA.\n\n## Output\nMarkdown with frontmatter. Add to inbox for approval before publishing."),
        lib("social-post-writer", "Draft platform-ready social posts", "content", &["content", "social"],
            "## Instructions\nWrite short social posts for the requested platform.\nMatch tone to the audience; one idea per post; include relevant hashtags.\n\n## Output\nNumbered list of posts, each with suggested platform."),
        lib("newsletter-draft", "Draft a newsletter issue", "content", &["content", "email"],
            "## Instructions\nDraft a newsletter: subject line, preview text, intro, 2-4 sections, CTA.\nKeep it scannable. Use the brand voice.\n\n## Output\nMarkdown, ready for the email tool. Add to inbox for approval."),
        lib("email-writer", "Write a clear, on-brand email", "content", &["content", "email"],
            "## Instructions\nWrite an email for the stated purpose and recipient.\nClear subject, concise body, single clear ask.\n\n## Output\nSubject + body."),
        lib("product-description", "Write a persuasive product description", "content", &["content", "ecommerce"],
            "## Instructions\nWrite a product description: hook, key benefits, specs, CTA.\nFocus on benefits over features.\n\n## Output\nMarkdown."),
        lib("press-release", "Draft a press release", "content", &["content", "pr"],
            "## Instructions\nWrite a press release: headline, dateline, lead paragraph, quotes, boilerplate.\nNeutral, factual tone.\n\n## Output\nMarkdown."),
        // Research
        lib("competitor-scan", "Scan and summarize competitors", "research", &["research", "competitive"],
            "## Instructions\nIdentify key competitors and summarize positioning, pricing, strengths, gaps.\nUse connected tools/web where available.\n\n## Output\nTable + 3 takeaways. Add to inbox."),
        lib("market-research", "Research a market or niche", "research", &["research", "market"],
            "## Instructions\nSummarize market size, trends, segments, and opportunities for the topic.\nCite sources where possible.\n\n## Output\nBrief with sources."),
        lib("seo-keyword-research", "Find target keywords", "research", &["research", "seo"],
            "## Instructions\nProduce a keyword list for the topic: term, intent, rough difficulty, priority.\n\n## Output\nTable sorted by priority."),
        lib("summarize-document", "Summarize a long document", "research", &["research", "summary"],
            "## Instructions\nSummarize the provided document into key points and action items.\nPreserve critical facts and numbers.\n\n## Output\nBullet summary + actions."),
        lib("web-research", "Research a topic on the web", "research", &["research", "web"],
            "## Instructions\nResearch the topic, synthesize findings, and note uncertainty.\nPrefer primary sources.\n\n## Output\nBrief with linked sources."),
        // Dev
        lib("code-review", "Review a code change for bugs and quality", "dev", &["dev", "review"],
            "## Instructions\nReview the diff for correctness, security, and clarity.\nFlag high-confidence issues only; suggest concrete fixes.\n\n## Output\nFindings grouped by severity."),
        lib("write-tests", "Write tests for given code", "dev", &["dev", "testing"],
            "## Instructions\nWrite focused tests covering happy path and key edge cases.\nMatch the project's existing test framework and style.\n\n## Output\nTest file(s)."),
        lib("debug-helper", "Diagnose a bug systematically", "dev", &["dev", "debugging"],
            "## Instructions\nReproduce, isolate, and explain the root cause. Propose a minimal fix.\nDo not guess; reason from evidence.\n\n## Output\nRoot cause + fix."),
        lib("api-documentation", "Document an API", "dev", &["dev", "docs"],
            "## Instructions\nDocument endpoints: method, path, params, request/response, errors, examples.\n\n## Output\nMarkdown reference."),
        lib("refactor-suggestion", "Suggest safe refactors", "dev", &["dev", "refactor"],
            "## Instructions\nIdentify refactors that improve clarity without changing behavior.\nKeep changes small and reversible.\n\n## Output\nPrioritized suggestions."),
        // Ops
        lib("weekly-report", "Produce a weekly status report", "ops", &["ops", "reporting"],
            "## Instructions\nSummarize the week: done, in progress, blockers, next week.\nPull from memory/recent actions where available.\n\n## Output\nMarkdown report. Add to inbox."),
        lib("meeting-notes", "Turn raw notes into clean minutes", "ops", &["ops", "notes"],
            "## Instructions\nStructure notes into decisions, action items (owner + due), and discussion.\n\n## Output\nMarkdown minutes."),
        lib("task-breakdown", "Break a goal into actionable tasks", "ops", &["ops", "planning"],
            "## Instructions\nDecompose the goal into sequenced, concrete tasks with rough effort.\n\n## Output\nOrdered task list."),
        lib("project-status", "Summarize current project status", "ops", &["ops", "reporting"],
            "## Instructions\nSummarize health, milestones, risks, and next steps for the project.\n\n## Output\nStatus brief."),
        lib("ceo-brief-template", "Daily CEO brief", "ops", &["ops", "executive"],
            "## Instructions\nProduce a tight daily brief: top priorities, metrics, decisions needed, risks.\nKeep under 200 words.\n\n## Output\nMarkdown brief. Add to inbox."),
    ]
}

// ── Phase C: one-time flat → folder layout migration ─────────────────────────

/// Move all flat `.superconsole/skills/<name>.md` files to
/// `.superconsole/skills/<name>/SKILL.md`.  Only runs when the old file exists
/// and the new directory does not.  Called from `db.rs::init` for each workspace,
/// and also exposed as a Tauri command so it can be triggered on demand.
#[allow(dead_code)]
pub fn migrate_skill_layout_for_workspace(ws_path: &str) {
    let dir = skills_dir(ws_path);
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() || path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let new_dir = skill_dir(ws_path, stem);
        let new_file = new_dir.join("SKILL.md");
        if new_file.exists() {
            continue;
        } // already migrated
        if std::fs::create_dir_all(&new_dir).is_err() {
            continue;
        }
        let _ = std::fs::copy(&path, &new_file);
        // Leave the old file in place (read by fallback) until user confirms migration.
    }
}

// ── Phase C: install from GitHub URL ─────────────────────────────────────────

/// Parse a GitHub tree URL into raw-file base URL.
///
/// Input:  `https://github.com/owner/repo/tree/branch/folder`
/// Output: `https://raw.githubusercontent.com/owner/repo/branch/folder`
fn github_tree_to_raw_base(url: &str) -> Option<String> {
    // Handle blob URL (single file): already covered by existing github_raw()
    let rest = url.strip_prefix("https://github.com/")?;
    // rest = "owner/repo/tree/branch/path/to/folder"
    let parts: Vec<&str> = rest.splitn(4, '/').collect();
    if parts.len() < 4 {
        return None;
    }
    let (owner, repo, kind, remainder) = (parts[0], parts[1], parts[2], parts[3]);
    if kind != "tree" {
        return None;
    }
    Some(format!(
        "https://raw.githubusercontent.com/{}/{}/{}",
        owner, repo, remainder
    ))
}

/// Fetch `SKILL.md` (preferred) or `<name>.md` (fallback) from a GitHub folder URL.
async fn fetch_skill_from_folder_url(url: &str) -> Result<(String, String), String> {
    let client = reqwest::Client::new();

    if let Some(base) = github_tree_to_raw_base(url) {
        // folder_name is the last segment of the tree URL
        let folder_name = url.rsplit('/').next().unwrap_or("skill");

        // Try SKILL.md first
        for filename in &["SKILL.md", &format!("{}.md", folder_name)] {
            let raw = format!("{}/{}", base, filename);
            if let Ok(resp) = client
                .get(&raw)
                .header("User-Agent", "SuperConsole")
                .send()
                .await
            {
                if resp.status().is_success() {
                    let content = resp.text().await.map_err(|e| e.to_string())?;
                    return Ok((content, folder_name.to_string()));
                }
            }
        }
        return Err(format!(
            "Could not find SKILL.md or {}.md in {}",
            folder_name, url
        ));
    }

    // Fallback: treat as a direct file URL (blob or raw)
    let content = fetch_skill_url(url).await?;
    let name = url
        .rsplit('/')
        .next()
        .map(|s| s.trim_end_matches(".md").to_string())
        .unwrap_or_else(|| "imported-skill".to_string());
    Ok((content, name))
}

/// Fetch optional README.md from the same folder for catalog submission.
#[allow(dead_code)]
async fn fetch_readme_from_folder_url(url: &str) -> String {
    let Some(base) = github_tree_to_raw_base(url) else {
        return String::new();
    };
    let client = reqwest::Client::new();
    let raw = format!("{}/README.md", base);
    client
        .get(&raw)
        .header("User-Agent", "SuperConsole")
        .send()
        .await
        .ok()
        .and_then(|r| {
            if r.status().is_success() {
                Some(r)
            } else {
                None
            }
        })
        .and_then(|r| tokio::runtime::Handle::current().block_on(r.text()).ok())
        .unwrap_or_default()
}

/// Install a skill from a GitHub folder URL.
///
/// - `scope = "global"` → `<app_data>/skills/<name>/SKILL.md` (machine library)
/// - `scope = "project"` → `<workspace>/.superconsole/skills/<name>/SKILL.md`
///
/// URL format: `https://github.com/owner/repo/tree/branch/folder-name`
#[tauri::command]
pub async fn install_skill_from_github_url(
    app: AppHandle,
    url: String,
    name: Option<String>,
    scope: String, // "global" | "project"
    workspace_id: Option<i64>,
) -> Result<Skill, String> {
    let (content, derived_name) = fetch_skill_from_folder_url(&url).await?;
    let slug = sanitize_name(&name.unwrap_or(derived_name))?;
    let fm = parse_frontmatter(&content);

    match scope.as_str() {
        "project" => {
            let ws_id = workspace_id.ok_or("workspace_id required for project scope")?;
            let (ws_path, project_id) = {
                let db = app.state::<Db>();
                let ws = db.get_workspace(ws_id)?;
                (ws.path, ws.project_id)
            };
            let dest_dir = skill_dir(&ws_path, &slug);
            let dest_file = skill_file_v2(&ws_path, &slug);
            if dest_file.exists() {
                return Err(format!("Skill '{}' already exists in this project", slug));
            }
            std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
            std::fs::write(&dest_file, &content).map_err(|e| e.to_string())?;
            let skill = index_skill(
                &app,
                ws_id,
                &slug,
                &fm.description,
                &fm.tags,
                "project",
                fm.auto,
                fm.version,
            )?;
            push_skill_to_cloud(
                &app,
                project_id.as_deref(),
                &slug,
                &fm.tags,
                "project",
                true,
                None,
                "",
            )
            .await;
            Ok(skill)
        }
        _ => {
            // "global" (default)
            let dest_dir = global_dir(&app)?.join(&slug);
            let dest_file = dest_dir.join("SKILL.md");
            if dest_file.exists() {
                return Err(format!("Skill '{}' already exists in your library", slug));
            }
            std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
            std::fs::write(&dest_file, &content).map_err(|e| e.to_string())?;
            Ok(Skill {
                name: slug.clone(),
                description: fm.description,
                tags: fm.tags,
                scope: "account".into(),
                version: fm.version,
                auto: fm.auto,
                active: true,
                file_path: format!("skills/{}/SKILL.md", slug),
                source: "global".into(),
                author: String::new(),
            })
        }
    }
}

// ── Phase C: Turso skill_catalog (global public catalog) ─────────────────────

pub async fn ensure_skill_catalog_table(
    client: &reqwest::Client,
    cfg: &cloud::TursoConfig,
) -> Result<(), String> {
    cloud::turso_execute(
        client,
        cfg,
        "CREATE TABLE IF NOT EXISTS skill_catalog (\
            id TEXT PRIMARY KEY NOT NULL, \
            name TEXT NOT NULL UNIQUE, \
            description TEXT NOT NULL DEFAULT '', \
            category TEXT NOT NULL DEFAULT '', \
            tags TEXT NOT NULL DEFAULT '', \
            github_url TEXT NOT NULL, \
            readme TEXT NOT NULL DEFAULT '', \
            author TEXT NOT NULL DEFAULT '', \
            stars INTEGER NOT NULL DEFAULT 0, \
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
        vec![],
    )
    .await
    .map(|_| ())
}

/// Fetch the community skill catalog from Turso and cache it locally.
#[tauri::command]
pub async fn fetch_skill_catalog(
    app: AppHandle,
) -> Result<Vec<crate::db::CatalogSkillEntry>, String> {
    let Ok(cfg) = cloud::turso_config() else {
        // Offline: return local cache
        return Ok(app.state::<Db>().list_skill_catalog_cache());
    };
    let client = reqwest::Client::new();
    if ensure_skill_catalog_table(&client, &cfg).await.is_err() {
        return Ok(app.state::<Db>().list_skill_catalog_cache());
    }
    let result = cloud::turso_execute(
        &client,
        &cfg,
        "SELECT id, name, description, category, tags, github_url, readme, author, stars, \
                created_at FROM skill_catalog ORDER BY name",
        vec![],
    )
    .await
    .map_err(|e| e.to_string())?;

    use crate::cloud::{cell_opt, cell_text, rows};
    let now = chrono::Utc::now().to_rfc3339();
    let db = app.state::<Db>();
    let _ = db.clear_skill_catalog_cache();

    let entries: Vec<crate::db::CatalogSkillEntry> = rows(&result)
        .iter()
        .map(|row| {
            let entry = crate::db::CatalogSkillEntry {
                id: cell_text(row, 0),
                name: cell_text(row, 1),
                description: cell_opt(row, 2).unwrap_or_default(),
                category: cell_opt(row, 3).unwrap_or_default(),
                tags: cell_opt(row, 4).unwrap_or_default(),
                github_url: cell_text(row, 5),
                readme: cell_opt(row, 6).unwrap_or_default(),
                author: cell_opt(row, 7).unwrap_or_default(),
                stars: cell_opt(row, 8).and_then(|v| v.parse().ok()).unwrap_or(0),
                synced_at: now.clone(),
            };
            let _ = db.upsert_skill_catalog_cache(&entry);
            entry
        })
        .collect();
    Ok(entries)
}

/// Submit a skill to the global community catalog.
#[tauri::command]
pub async fn submit_to_skill_catalog(
    _app: AppHandle,
    name: String,
    description: String,
    category: String,
    tags: Vec<String>,
    github_url: String,
    readme: String,
    author: String,
) -> Result<crate::db::CatalogSkillEntry, String> {
    let slug = sanitize_name(&name)?;
    let Ok(cfg) = cloud::turso_config() else {
        return Err("Cloud connection required to submit to catalog".into());
    };
    let client = reqwest::Client::new();
    ensure_skill_catalog_table(&client, &cfg).await?;
    let id = Ulid::new().to_string();
    let tags_csv = tags.join(",");
    cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO skill_catalog (id, name, description, category, tags, github_url, readme, author) \
         VALUES (?,?,?,?,?,?,?,?) \
         ON CONFLICT(name) DO UPDATE SET \
           description=excluded.description, category=excluded.category, \
           tags=excluded.tags, github_url=excluded.github_url, \
           readme=excluded.readme, author=excluded.author",
        vec![
            Some(id.clone()),
            Some(slug.clone()),
            Some(description.clone()),
            Some(category.clone()),
            Some(tags_csv.clone()),
            Some(github_url.clone()),
            Some(readme.clone()),
            Some(author.clone()),
        ],
    )
    .await?;
    Ok(crate::db::CatalogSkillEntry {
        id,
        name: slug,
        description,
        category,
        tags: tags_csv,
        github_url,
        readme,
        author,
        stars: 0,
        synced_at: chrono::Utc::now().to_rfc3339(),
    })
}
