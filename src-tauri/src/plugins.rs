// Phase Plugins — Plugin marketplace and installation.
//
// A plugin is a bundle that installs one or more of:
//   - Skills   → .superconsole/skills/<name>.md
//   - Commands → .superconsole/commands/<slash>.md
//   - Hooks    → .superconsole/hooks/<event>.sh
//   - MCP      → entries in the workspace .mcp.json
//   - Connectors → triggers the connector setup flow (no silent key storage)
//
// Installs are recorded in `workspace_plugins` (local SQLite) so the
// marketplace can show what's installed. The plugin metadata lives in
// `plugins_cache` (local mirror of the Turso `plugins` table).
//
// install_plugin_from_url detects the plugin manifest (superconsole.json /
// plugin.json at root of the repo) and runs the same install path.

use crate::db::{Db, PluginCacheEntry, WorkspacePlugin};
use serde::{Deserialize, Serialize};

use tauri::{AppHandle, Manager};

// ── Public types ──────────────────────────────────────────────────────────────

/// ConnectorAuth describes what a plugin needs from the user for each
/// connector. Stored as JSON in plugins_cache.connector_auth.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorAuth {
    pub service: String,
    pub auth_type: String,          // "api_key" | "oauth"
    pub key_fields: Vec<String>,    // e.g. ["NOTION_KEY"]
    pub oauth_url: Option<String>,
}

/// Returned by list_plugins_catalog / search.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginListItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub icon_url: Option<String>,
    pub category: String,
    pub featured: bool,
    pub installed: bool,
    pub skill_count: usize,
    pub mcp_count: usize,
    pub hook_count: usize,
    pub skill_ids: String,
    pub mcp_ids: String,
    pub command_ids: String,
    pub github_url: Option<String>,
    pub docs_url: Option<String>,
    pub connector_auth: Vec<ConnectorAuth>,
}

/// Manifest embedded in a GitHub repo root for install-from-URL.
#[derive(Debug, Clone, Deserialize)]
struct PluginManifest {
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub version: Option<String>,
    pub category: Option<String>,
    pub skills_url: Option<String>,
    pub commands_url: Option<String>,
    pub hooks_url: Option<String>,
    pub connector_auth: Option<Vec<ConnectorAuth>>,
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// List all available plugins from local cache, enriched with installed flag.
#[tauri::command]
pub async fn list_plugins_catalog(
    app: tauri::AppHandle,
    scope: String,
    scope_id: String,
    category: Option<String>,
) -> Result<Vec<PluginListItem>, String> {
    let db = app.state::<Db>();
    let Ok(cfg) = crate::cloud::turso_config() else {
        let all = db.list_plugins_cache(category.as_deref());
        let installed: std::collections::HashSet<String> = db
            .list_installed_plugins(&scope, &scope_id)
            .into_iter()
            .map(|p| p.plugin_id)
            .collect();
        return Ok(all.into_iter().map(|e| to_list_item(e, &installed)).collect());
    };
    let client = reqwest::Client::new();
    let result = crate::cloud::turso_execute(
        &client,
        &cfg,
        "SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured FROM plugins ORDER BY name",
        vec![],
    ).await;
    
    if let Ok(res) = result {
        use crate::cloud::{cell_text, cell_opt, rows};
        let now = chrono::Utc::now().to_rfc3339();
        let entries: Vec<crate::db::PluginCacheEntry> = rows(&res).iter().map(|row| crate::db::PluginCacheEntry {
            id: cell_text(row, 0),
            name: cell_text(row, 1),
            description: cell_text(row, 2),
            author: cell_text(row, 3),
            version: cell_text(row, 4),
            icon_url: cell_opt(row, 5),
            docs_url: cell_opt(row, 6),
            github_url: cell_opt(row, 7),
            category: cell_text(row, 8),
            scope: cell_text(row, 9),
            skill_ids: cell_text(row, 10),
            agent_ids: "[]".into(),
            mcp_ids: cell_text(row, 11),
            command_ids: cell_text(row, 12),
            hook_ids: cell_text(row, 13),
            connector_ids: cell_text(row, 14),
            skills_url: cell_opt(row, 15),
            commands_url: cell_opt(row, 16),
            hooks_url: cell_opt(row, 17),
            mcp_url: cell_opt(row, 18),
            connector_auth: cell_text(row, 19),
            featured: cell_text(row, 20) == "1",
            synced_at: now.clone(),
        }).collect();
        
        for e in &entries { let _ = db.upsert_plugin_cache(e); }
    }
    
    let all = db.list_plugins_cache(category.as_deref());
    let installed: std::collections::HashSet<String> = db
        .list_installed_plugins(&scope, &scope_id)
        .into_iter()
        .map(|p| p.plugin_id)
        .collect();
    Ok(all.into_iter().map(|e| to_list_item(e, &installed)).collect())
}

/// Search plugins by keyword.
#[tauri::command]
pub fn search_plugins_catalog(
    db: tauri::State<Db>,
    scope: String,
    scope_id: String,
    query: String,
) -> Vec<PluginListItem> {
    let all = db.search_plugins_cache(&query);
    let installed: std::collections::HashSet<String> = db
        .list_installed_plugins(&scope, &scope_id)
        .into_iter()
        .map(|p| p.plugin_id)
        .collect();
    all.into_iter().map(|e| to_list_item(e, &installed)).collect()
}

/// Get a single plugin by id.
#[tauri::command]
pub fn get_plugin(
    db: tauri::State<Db>,
    scope: String,
    scope_id: String,
    plugin_id: String,
) -> Result<PluginListItem, String> {
    let entry = db
        .get_plugin_cache(&plugin_id)
        .ok_or_else(|| format!("Plugin '{}' not found in catalog", plugin_id))?;
    let installed = std::collections::HashSet::from([plugin_id.clone()].into_iter()
        .filter(|id| db.is_plugin_installed(&scope, &scope_id, id))
        .collect::<std::collections::HashSet<_>>());
    Ok(to_list_item(entry, &installed))
}

/// Install a plugin into a workspace.
/// Fetches skill/command/hook content from GitHub URLs and writes to disk.
/// MCP entries are added to .mcp.json if install_command is present.
/// Connectors are NOT silently configured; the UI shows a "requires auth" notice.
#[tauri::command]
pub async fn install_plugin(
    app: AppHandle,
    scope: String,
    scope_id: String,
    plugin_id: String,
) -> Result<String, String> {
    let (ws_path, entry) = {
        let db = app.state::<Db>();
        let ws_path = if scope == "project" {
            let wid = scope_id.parse::<i64>().map_err(|_| "Invalid project ID".to_string())?;
            db.get_workspace(wid)?.path
        } else {
            app.path().app_data_dir().unwrap().to_string_lossy().to_string()
        };
        let entry = db
            .get_plugin_cache(&plugin_id)
            .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?;
        (ws_path, entry)
    };

    do_install_plugin(&app, &scope, &scope_id, &ws_path, &entry).await?;

    Ok(format!("Plugin '{}' installed successfully", entry.name))
}

/// Uninstall a plugin (removes DB record; skill/hook files left intact for safety).
#[tauri::command]
pub fn uninstall_plugin(
    db: tauri::State<Db>,
    scope: String,
    scope_id: String,
    plugin_id: String,
) -> Result<(), String> {
    db.remove_installed_plugin(&scope, &scope_id, &plugin_id)
}

/// List plugins installed in a workspace.
#[tauri::command]
pub fn list_installed_plugins(
    db: tauri::State<Db>,
    scope: String,
    scope_id: String,
) -> Vec<WorkspacePlugin> {
    db.list_installed_plugins(&scope, &scope_id)
}

/// Install a plugin from a raw GitHub URL.
/// Detects a superconsole.json / plugin.json manifest at repo root.
#[tauri::command]
pub async fn install_plugin_from_url(
    app: AppHandle,
    scope: String,
    scope_id: String,
    github_url: String,
) -> Result<String, String> {
    let ws_path = {
        let db = app.state::<Db>();
        if scope == "project" {
            let wid = scope_id.parse::<i64>().map_err(|_| "Invalid project ID".to_string())?;
            db.get_workspace(wid)?.path
        } else {
            app.path().app_data_dir().unwrap().to_string_lossy().to_string()
        }
    };

    // Build raw manifest URL from the GitHub repo URL.
    // Accept: https://github.com/owner/repo/tree/branch/path  or
    //         https://github.com/owner/repo
    let raw_base = github_url_to_raw_base(&github_url)?;

    // Try superconsole.json, then plugin.json.
    let manifest: PluginManifest = {
        let client = reqwest::Client::new();
        let mut found = None;
        for candidate in ["superconsole.json", "plugin.json"] {
            let url = format!("{}/{}", raw_base.trim_end_matches('/'), candidate);
            if let Ok(resp) = client.get(&url).send().await {
                if resp.status().is_success() {
                    if let Ok(text) = resp.text().await {
                        if let Ok(m) = serde_json::from_str::<PluginManifest>(&text) {
                            found = Some(m);
                            break;
                        }
                    }
                }
            }
        }
        found.ok_or_else(|| {
            "No superconsole.json or plugin.json found at repository root".to_string()
        })?
    };

    // Build an ephemeral PluginCacheEntry from the manifest.
    let now = chrono::Utc::now().to_rfc3339();
    let plugin_id = ulid::Ulid::new().to_string();
    let entry = PluginCacheEntry {
        id: plugin_id.clone(),
        name: manifest.name.clone(),
        description: manifest.description.unwrap_or_default(),
        author: manifest.author.unwrap_or_default(),
        version: manifest.version.unwrap_or_else(|| "1.0.0".into()),
        icon_url: None,
        docs_url: None,
        github_url: Some(github_url.clone()),
        category: manifest.category.unwrap_or_else(|| "community".into()),
        scope: "project".into(),
        skill_ids: "[]".into(),
        agent_ids: "[]".into(),
        mcp_ids: "[]".into(),
        command_ids: "[]".into(),
        hook_ids: "[]".into(),
        connector_ids: "[]".into(),
        skills_url: manifest.skills_url.or_else(|| {
            // Auto-detect: check if skills/ directory exists in raw base
            Some(format!("{}/skills", raw_base.trim_end_matches('/')))
        }),
        commands_url: manifest.commands_url.or_else(|| {
            Some(format!("{}/commands", raw_base.trim_end_matches('/')))
        }),
        hooks_url: manifest.hooks_url.or_else(|| {
            Some(format!("{}/hooks", raw_base.trim_end_matches('/')))
        }),
        mcp_url: Some("[]".to_string()),
        connector_auth: serde_json::to_string(&manifest.connector_auth.unwrap_or_default())
            .unwrap_or_else(|_| "[]".into()),
        featured: false,
        synced_at: now,
    };

    // Cache it locally so the record is visible.
    {
        let db = app.state::<Db>();
        let _ = db.upsert_plugin_cache(&entry);
    }

    do_install_plugin(&app, &scope, &scope_id, &ws_path, &entry).await?;

    Ok(format!("Plugin '{}' installed from {}", manifest.name, github_url))
}

// ── Catalog read commands ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_connector_catalog(app: tauri::AppHandle) -> Result<Vec<crate::db::ConnectorCatalogEntry>, String> {
    let Ok(cfg) = crate::cloud::turso_config() else {
        return Ok(app.state::<crate::db::Db>().list_connector_catalog());
    };
    let client = reqwest::Client::new();
    let result = crate::cloud::turso_execute(
        &client,
        &cfg,
        "SELECT id, name, description, category, auth_type, oauth_url, api_key_fields, docs_url, icon_url, scope, created_at FROM connector_catalog ORDER BY name",
        vec![],
    ).await;
    if let Ok(res) = result {
        use crate::cloud::{cell_text, cell_opt, rows};
        let now = chrono::Utc::now().to_rfc3339();
        let entries: Vec<crate::db::ConnectorCatalogEntry> = rows(&res).iter().map(|row| crate::db::ConnectorCatalogEntry {
            id: cell_text(row, 0),
            name: cell_text(row, 1),
            description: cell_text(row, 2),
            category: cell_text(row, 3),
            auth_type: cell_text(row, 4),
            oauth_url: cell_opt(row, 5),
            api_key_fields: cell_text(row, 6),
            docs_url: cell_opt(row, 7),
            icon_url: cell_opt(row, 8),
            scope: cell_text(row, 9),
            install_count: 0,
            created_at: None,
            synced_at: Some(now.clone()),
        }).collect();
        let db = app.state::<crate::db::Db>();
        for e in &entries { let _ = db.upsert_connector_catalog(e); }
        return Ok(entries);
    }
    Ok(app.state::<crate::db::Db>().list_connector_catalog())
}

#[tauri::command]
pub async fn list_mcp_catalog(app: tauri::AppHandle) -> Result<Vec<crate::db::McpCatalogEntry>, String> {
    let Ok(cfg) = crate::cloud::turso_config() else {
        return Ok(app.state::<crate::db::Db>().list_mcp_catalog(None));
    };
    let client = reqwest::Client::new();
    let result = crate::cloud::turso_execute(
        &client,
        &cfg,
        "SELECT id, name, description, author, category, type, url, command, args, env, required_env_vars, github_url, icon_url, docs_url, install_count, created_at FROM mcp_catalog ORDER BY name",
        vec![],
    ).await;
    if let Ok(res) = result {

        let entries: Vec<crate::db::McpCatalogEntry> = crate::cloud::rows(&res).iter().map(|row| crate::db::McpCatalogEntry {
            id: crate::cloud::cell_text(row, 0),
            name: crate::cloud::cell_text(row, 1),
            description: crate::cloud::cell_text(row, 2),
            author: crate::cloud::cell_text(row, 3),
            category: crate::cloud::cell_text(row, 4),
            r#type: crate::cloud::cell_text(row, 5),
            url: crate::cloud::cell_opt(row, 6),
            command: crate::cloud::cell_opt(row, 7),
            args: crate::cloud::cell_text(row, 8),
            env: crate::cloud::cell_text(row, 9),
            required_env_vars: crate::cloud::cell_text(row, 10),
            github_url: crate::cloud::cell_opt(row, 11),
            icon_url: crate::cloud::cell_opt(row, 12),
            docs_url: crate::cloud::cell_opt(row, 13),
            install_count: crate::cloud::cell_text(row, 14).parse().unwrap_or(0),
            created_at: Some(crate::cloud::cell_text(row, 15)),
            synced_at: Some(chrono::Utc::now().to_rfc3339()),
        }).collect();
        let db = app.state::<crate::db::Db>();
        for e in &entries { let _ = db.upsert_mcp_catalog(e); }
        return Ok(entries);
    }
    Ok(app.state::<crate::db::Db>().list_mcp_catalog(None))
}

#[tauri::command]
pub async fn list_commands_catalog(app: tauri::AppHandle) -> Result<Vec<crate::db::CommandsCatalogEntry>, String> {
    let Ok(cfg) = crate::cloud::turso_config() else {
        return Ok(app.state::<crate::db::Db>().list_commands_catalog());
    };
    let client = reqwest::Client::new();
    let result = crate::cloud::turso_execute(
        &client,
        &cfg,
        "SELECT id, name, slash, description, author, category, github_url, content, icon_url, created_at FROM commands_catalog ORDER BY name",
        vec![],
    ).await;
    if let Ok(res) = result {
        use crate::cloud::{cell_text, cell_opt, rows};
        let now = chrono::Utc::now().to_rfc3339();
        let entries: Vec<crate::db::CommandsCatalogEntry> = rows(&res).iter().map(|row| crate::db::CommandsCatalogEntry {
            id: cell_text(row, 0),
            name: cell_text(row, 1),
            slash: cell_text(row, 2),
            description: cell_text(row, 3),
            author: cell_text(row, 4),
            category: cell_text(row, 5),
            github_url: cell_text(row, 6),
            content: cell_opt(row, 7),
            icon_url: cell_opt(row, 8),
            install_count: 0,
            created_at: None,
            synced_at: Some(now.clone()),
        }).collect();
        let db = app.state::<crate::db::Db>();
        for e in &entries { let _ = db.upsert_commands_catalog(e); }
        return Ok(entries);
    }
    Ok(app.state::<crate::db::Db>().list_commands_catalog())
}

#[tauri::command]
pub async fn list_hooks_catalog_cmd(
    app: tauri::AppHandle,
    hook_type: Option<String>,
) -> Result<Vec<crate::db::HooksCatalogEntry>, String> {
    let Ok(cfg) = crate::cloud::turso_config() else {
        return Ok(app.state::<crate::db::Db>().list_hooks_catalog(hook_type.as_deref()));
    };
    let client = reqwest::Client::new();
    let result = crate::cloud::turso_execute(
        &client,
        &cfg,
        "SELECT id, name, description, author, hook_type, github_url, content, icon_url FROM hooks_catalog ORDER BY name",
        vec![],
    ).await;
    if let Ok(res) = result {
        use crate::cloud::{cell_text, cell_opt, rows};
        let now = chrono::Utc::now().to_rfc3339();
        let entries: Vec<crate::db::HooksCatalogEntry> = rows(&res).iter().map(|row| crate::db::HooksCatalogEntry {
            id: cell_text(row, 0),
            name: cell_text(row, 1),
            description: cell_text(row, 2),
            author: cell_text(row, 3),
            hook_type: cell_text(row, 4),
            github_url: cell_text(row, 5),
            content: cell_opt(row, 6),
            icon_url: cell_opt(row, 7),
            install_count: 0,
            created_at: None,
            synced_at: Some(now.clone()),
        }).collect();
        let db = app.state::<crate::db::Db>();
        for e in &entries { let _ = db.upsert_hooks_catalog(e); }
        return Ok(entries);
    }
    Ok(app.state::<crate::db::Db>().list_hooks_catalog(hook_type.as_deref()))
}

// ── Internal helpers ──────────────────────────────────────────────────────────

fn to_list_item(
    e: PluginCacheEntry,
    installed: &std::collections::HashSet<String>,
) -> PluginListItem {
    let skill_arr: Vec<serde_json::Value> = serde_json::from_str(&e.skill_ids).unwrap_or_default();
    let mcp_arr: Vec<serde_json::Value> = serde_json::from_str(&e.mcp_ids).unwrap_or_default();
    let hook_arr: Vec<serde_json::Value> = serde_json::from_str(&e.hook_ids).unwrap_or_default();
    let connector_auth: Vec<ConnectorAuth> =
        serde_json::from_str(&e.connector_auth).unwrap_or_default();
    PluginListItem {
        installed: installed.contains(&e.id),
        id: e.id,
        name: e.name,
        description: e.description,
        author: e.author,
        version: e.version,
        icon_url: e.icon_url,
        category: e.category,
        featured: e.featured,
        skill_count: skill_arr.len(),
        mcp_count: mcp_arr.len(),
        hook_count: hook_arr.len(),
        skill_ids: e.skill_ids,
        mcp_ids: e.mcp_ids,
        command_ids: e.command_ids,
        github_url: e.github_url,
        docs_url: e.docs_url,
        connector_auth,
    }
}

/// Core installation logic shared by install_plugin and install_plugin_from_url.
async fn do_install_plugin(
    app: &AppHandle,
    scope: &str,
    scope_id: &str,
    ws_path: &str,
    entry: &PluginCacheEntry,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let db = app.state::<Db>();

    // ── 1. Install skills ────────────────────────────────────────────────────
    let skills: Vec<serde_json::Value> = serde_json::from_str(entry.skills_url.as_deref().unwrap_or("[]")).unwrap_or_default();
    for skill in skills {
        if let (Some(slug), Some(github_url)) = (skill.get("id").and_then(|v| v.as_str()), skill.get("github_url").and_then(|v| v.as_str())) {
            let raw_url = if github_url.contains("raw.githubusercontent.com") {
                github_url.to_string()
            } else {
                crate::plugins::github_url_to_raw_base(github_url).unwrap_or_else(|_| github_url.to_string())
            };
            
            let fetch_url = if raw_url.ends_with(".md") { raw_url } else { format!("{}/SKILL.md", raw_url.trim_end_matches('/')) };

            if let Ok(resp) = client.get(&fetch_url).send().await {
                if let Ok(content) = resp.text().await {
                    let base_dir = if scope == "project" { format!("{}/.superconsole", ws_path) } else { ws_path.to_string() };
                    let skill_dir = format!("{}/skills/{}", base_dir, slug);
                    let skill_file = format!("{}/SKILL.md", skill_dir);
                    if !std::path::Path::new(&skill_file).exists() {
                        let _ = std::fs::create_dir_all(&skill_dir);
                        let _ = std::fs::write(&skill_file, &content);
                        let (desc, tags) = crate::plugins::parse_skill_frontmatter(&content);
                        let _ = db.upsert_skill_index(
                            0, // Global scope uses 0 for workspace_id in project_skills currently
                            slug,
                            &desc,
                            &tags,
                            &skill_file,
                            "project",
                            false,  // auto
                            1,      // version
                            "plugin",
                            true,   // active
                        );
                    }
                }
            }
        }
    }

    // ── 2. Install commands ──────────────────────────────────────────────────
    let commands: Vec<serde_json::Value> = serde_json::from_str(entry.commands_url.as_deref().unwrap_or("[]")).unwrap_or_default();
    for cmd in commands {
        if let Some(slug) = cmd.get("id").and_then(|v| v.as_str()) {
            let base_dir = if scope == "project" { format!("{}/.superconsole", ws_path) } else { ws_path.to_string() };
            let dest = format!("{}/commands/{}.md", base_dir, slug);
            if !std::path::Path::new(&dest).exists() {
                if let Some(content) = cmd.get("content").and_then(|v| v.as_str()) {
                    let _ = std::fs::create_dir_all(format!("{}/commands", base_dir));
                    let _ = std::fs::write(&dest, content);
                } else if let Some(github_url) = cmd.get("github_url").and_then(|v| v.as_str()) {
                    let raw_url = if github_url.contains("raw.githubusercontent.com") {
                        github_url.to_string()
                    } else {
                        crate::plugins::github_url_to_raw_base(github_url).unwrap_or_else(|_| github_url.to_string())
                    };
                    if let Ok(resp) = client.get(&raw_url).send().await {
                        if let Ok(content) = resp.text().await {
                            let _ = std::fs::create_dir_all(format!("{}/commands", base_dir));
                            let _ = std::fs::write(&dest, content);
                        }
                    }
                }
            }
        }
    }

    // ── 3. Install hooks ─────────────────────────────────────────────────────
    let hooks: Vec<serde_json::Value> = serde_json::from_str(entry.hooks_url.as_deref().unwrap_or("[]")).unwrap_or_default();
    for hook in hooks {
        if let Some(hook_type) = hook.get("id").and_then(|v| v.as_str()) {
            let base_dir = if scope == "project" { format!("{}/.superconsole", ws_path) } else { ws_path.to_string() };
            if crate::hooks::read_hook(&base_dir, hook_type).is_err() {
                continue;
            }
            if let Some(github_url) = hook.get("github_url").and_then(|v| v.as_str()) {
                let raw_url = if github_url.contains("raw.githubusercontent.com") {
                    github_url.to_string()
                } else {
                    crate::plugins::github_url_to_raw_base(github_url).unwrap_or_else(|_| github_url.to_string())
                };
                if let Ok(resp) = client.get(&raw_url).send().await {
                    if let Ok(content) = resp.text().await {
                        let _ = crate::hooks::write_hook(&base_dir, hook_type, &content);
                    }
                }
            }
        }
    }

    // ── 4. Install MCPs ──────────────────────────────────────────────────────
    let mcps: Vec<serde_json::Value> = serde_json::from_str(entry.mcp_url.as_deref().unwrap_or("[]")).unwrap_or_default();
    for mcp in mcps {
        if let Some(_slug) = mcp.get("id").and_then(|v| v.as_str()) {
            if let Some(typ) = mcp.get("type").and_then(|v| v.as_str()) {
                match typ {
                    "http" => {
                        if let Some(_url) = mcp.get("url").and_then(|v| v.as_str()) {
                            // crate::mcp::add_http_mcp_to_config(workspace_id, slug, _url);
                        }
                    }
                    "stdio" => {
                        if let Some(_cmd) = mcp.get("command").and_then(|v| v.as_str()) {
                            let _args: Vec<String> = mcp.get("args").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
                            let _env: std::collections::HashMap<String, String> = mcp.get("env").and_then(|v| v.as_object()).map(|m| m.iter().map(|(k,v)| (k.clone(), v.as_str().unwrap_or_default().to_string())).collect()).unwrap_or_default();
                            // crate::mcp::add_stdio_mcp_to_config(workspace_id, slug, _cmd, &_args, _env);
                        }
                    }
                    _ => eprintln!("Unknown MCP type: {}", typ),
                }
            }
        }
    }

    // ── 5. Record installation ───────────────────────────────────────────────
    db.record_installed_plugin(scope, scope_id, &entry.id, &entry.version)?;

    Ok(())
}

// --- Helper Functions ---

pub fn github_url_to_raw_base(url: &str) -> Result<String, String> {
    if url.contains("raw.githubusercontent.com") {
        return Ok(url.to_string());
    }
    // https://github.com/owner/repo/tree/main/path
    let parts: Vec<&str> = url.split('/').collect();
    if parts.len() < 7 {
        return Err("Invalid github url".to_string());
    }
    let owner = parts[3];
    let repo = parts[4];
    let branch = parts[6];
    let path = parts[7..].join("/");
    if path.is_empty() {
        Ok(format!("https://raw.githubusercontent.com/{}/{}/{}", owner, repo, branch))
    } else {
        Ok(format!("https://raw.githubusercontent.com/{}/{}/{}/{}", owner, repo, branch, path))
    }
}

pub fn parse_skill_frontmatter(content: &str) -> (String, String) {
    let mut desc = String::new();
    let mut tags = String::new();
    if let Some(start) = content.find("---") {
        if let Some(end) = content[start + 3..].find("---") {
            let yaml = &content[start + 3..start + 3 + end];
            for line in yaml.lines() {
                if line.starts_with("description:") {
                    desc = line.trim_start_matches("description:").trim().to_string();
                } else if line.starts_with("tags:") {
                    tags = line.trim_start_matches("tags:").trim().to_string();
                }
            }
        }
    }
    (desc, tags)
}

// --- submit_connector_to_cloud ---

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubmitConnectorInput {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub auth_type: String,
    pub oauth_url: Option<String>,
    pub api_key_fields: String, // JSON array string
    pub docs_url: Option<String>,
    pub icon_url: Option<String>,
    pub scope: String,
}

#[tauri::command]
pub async fn submit_connector_to_cloud(input: SubmitConnectorInput) -> Result<(), String> {
    let Ok(cfg) = crate::cloud::turso_config() else {
        return Err("Turso not configured".to_string());
    };
    let client = reqwest::Client::new();
    crate::cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO connector_catalog \
         (id, name, description, category, auth_type, oauth_url, api_key_fields, \
          docs_url, icon_url, scope) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
           name=excluded.name, description=excluded.description, \
           category=excluded.category, auth_type=excluded.auth_type, \
           oauth_url=excluded.oauth_url, api_key_fields=excluded.api_key_fields, \
           docs_url=excluded.docs_url, icon_url=excluded.icon_url, \
           scope=excluded.scope, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        vec![
            Some(input.id),
            Some(input.name),
            Some(input.description),
            Some(input.category),
            Some(input.auth_type),
            input.oauth_url,
            Some(input.api_key_fields),
            input.docs_url,
            input.icon_url,
            Some(input.scope),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// --- submit_mcp_to_cloud ---

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubmitMcpInput {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub category: String,
    pub r#type: String,
    pub url: Option<String>,
    pub command: Option<String>,
    pub args: Option<String>, // JSON array string
    pub env: Option<String>, // JSON object string
    pub required_env_vars: String, // JSON array string
    pub github_url: Option<String>,
    pub icon_url: Option<String>,
    pub docs_url: Option<String>,
}

#[tauri::command]
pub async fn submit_mcp_to_cloud(input: SubmitMcpInput) -> Result<(), String> {
    let Ok(cfg) = crate::cloud::turso_config() else {
        return Err("Turso not configured".to_string());
    };
    let client = reqwest::Client::new();
    crate::cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO mcp_catalog \
         (id, name, description, author, category, type, url, command, \
          args, env, required_env_vars, github_url, icon_url, docs_url) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
           name=excluded.name, description=excluded.description, \
           author=excluded.author, category=excluded.category, \
           type=excluded.type, url=excluded.url, command=excluded.command, \
           args=excluded.args, env=excluded.env, required_env_vars=excluded.required_env_vars, \
           github_url=excluded.github_url, icon_url=excluded.icon_url, docs_url=excluded.docs_url",
        vec![
            Some(input.id),
            Some(input.name),
            Some(input.description),
            Some(input.author),
            Some(input.category),
            Some(input.r#type),
            input.url,
            input.command,
            input.args,
            input.env,
            Some(input.required_env_vars),
            input.github_url,
            input.icon_url,
            input.docs_url,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// --- submit_command_to_cloud ---

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubmitCommandInput {
    pub id: String,
    pub name: String,
    pub slash: String,
    pub description: String,
    pub author: String,
    pub category: String,
    pub github_url: String,
    pub content: Option<String>,
    pub icon_url: Option<String>,
}

#[tauri::command]
pub async fn submit_command_to_cloud(input: SubmitCommandInput) -> Result<(), String> {
    let Ok(cfg) = crate::cloud::turso_config() else {
        return Err("Turso not configured".to_string());
    };
    let client = reqwest::Client::new();
    crate::cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO commands_catalog \
         (id, name, slash, description, author, category, github_url, content, icon_url) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
           name=excluded.name, slash=excluded.slash, description=excluded.description, \
           author=excluded.author, category=excluded.category, \
           github_url=excluded.github_url, content=excluded.content, \
           icon_url=excluded.icon_url",
        vec![
            Some(input.id),
            Some(input.name),
            Some(input.slash),
            Some(input.description),
            Some(input.author),
            Some(input.category),
            Some(input.github_url),
            input.content,
            input.icon_url,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubmitPluginInput {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub category: String,
    pub github_url: Option<String>,
    pub icon_url: Option<String>,
    pub docs_url: Option<String>,
    pub mcp_ids: String,
    pub skill_ids: String,
    pub command_ids: String,
    pub skills_url: Option<String>,
    pub commands_url: Option<String>,
    pub hooks_url: Option<String>,
    pub mcp_url: Option<String>,
    pub connector_auth: String, // JSON array string
    pub featured: bool,
}

/// Write a plugin row directly to the Turso `plugins` table.
#[tauri::command]
pub async fn submit_plugin_to_cloud(input: SubmitPluginInput) -> Result<(), String> {
    let Ok(cfg) = crate::cloud::turso_config() else {
        return Err("Turso not configured".to_string());
    };
    let client = reqwest::Client::new();
    let featured_int = if input.featured { "1" } else { "0" };

    // Extract connector_ids from connector_auth (which is an array of objects)
    let parsed_auth: Vec<serde_json::Value> = serde_json::from_str(&input.connector_auth).unwrap_or_default();
    let connector_ids_arr: Vec<String> = parsed_auth.into_iter()
        .filter_map(|v| v.get("connector_id").and_then(|id| id.as_str()).map(|s| s.to_string()))
        .collect();
    let connector_ids_json = serde_json::to_string(&connector_ids_arr).unwrap_or_else(|_| "[]".to_string());

    crate::cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO plugins \
         (id, name, description, author, version, icon_url, docs_url, github_url, \
          category, mcp_ids, connector_auth, featured, \
          skill_ids, agent_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, '[]', ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
           name=excluded.name, description=excluded.description, \
           author=excluded.author, version=excluded.version, \
           icon_url=excluded.icon_url, docs_url=excluded.docs_url, \
           github_url=excluded.github_url, category=excluded.category, \
           mcp_ids=excluded.mcp_ids, \
           connector_auth=excluded.connector_auth, featured=excluded.featured, \
           skill_ids=excluded.skill_ids, command_ids=excluded.command_ids, \
           connector_ids=excluded.connector_ids, \
           skills_url=excluded.skills_url, commands_url=excluded.commands_url, \
           hooks_url=excluded.hooks_url, mcp_url=excluded.mcp_url, \
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        vec![
            Some(input.id),
            Some(input.name),
            Some(input.description),
            Some(input.author),
            Some(input.version),
            input.icon_url,
            input.docs_url,
            input.github_url,
            Some(input.category),
            Some(input.mcp_ids),
            Some(input.connector_auth),
            Some(featured_int.to_string()),
            Some(input.skill_ids),
            Some(input.command_ids),
            Some(connector_ids_json),
            input.skills_url.or_else(|| Some("[]".to_string())),
            input.commands_url.or_else(|| Some("[]".to_string())),
            input.hooks_url.or_else(|| Some("[]".to_string())),
            input.mcp_url.or_else(|| Some("[]".to_string())),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

