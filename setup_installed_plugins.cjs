const fs = require('fs');

let db = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

// Add installed_plugins table
if (!db.includes('installed_plugins (')) {
  db = db.replace(
    '            CREATE TABLE IF NOT EXISTS workspaces (',
    `            CREATE TABLE IF NOT EXISTS installed_plugins (
                id TEXT PRIMARY KEY,
                plugin_id TEXT NOT NULL,
                scope TEXT NOT NULL,
                scope_id TEXT NOT NULL,
                installed_at TEXT NOT NULL DEFAULT (datetime('now')),
                version TEXT NOT NULL DEFAULT '1.0.0'
            );
            CREATE TABLE IF NOT EXISTS workspaces (`
  );
}

// Add the 4 methods
const methods = `
    // --- Phase Plugins (Installations) ---

    pub fn record_installed_plugin(
        &self,
        scope: &str,
        scope_id: &str,
        plugin_id: &str,
        version: &str,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        let id = ulid::Ulid::new().to_string();
        
        let _ = conn.execute(
            "DELETE FROM installed_plugins WHERE scope = ?1 AND scope_id = ?2 AND plugin_id = ?3",
            rusqlite::params![scope, scope_id, plugin_id],
        );
        
        conn.execute(
            "INSERT INTO installed_plugins (id, scope, scope_id, plugin_id, version)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, scope, scope_id, plugin_id, version],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_installed_plugins(&self, scope: &str, scope_id: &str) -> Vec<WorkspacePlugin> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, scope_id, plugin_id, installed_at, version
             FROM installed_plugins WHERE scope = ?1 AND scope_id = ?2 ORDER BY installed_at DESC",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map(rusqlite::params![scope, scope_id], |r| {
            let sid: String = r.get(1)?;
            let wid = sid.parse::<i64>().unwrap_or(0);
            Ok(WorkspacePlugin {
                id: r.get(0)?,
                workspace_id: wid,
                plugin_id: r.get(2)?,
                installed_at: r.get(3)?,
                version: r.get(4)?,
            })
        });
        match rows {
            Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn remove_installed_plugin(&self, scope: &str, scope_id: &str, plugin_id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "DELETE FROM installed_plugins WHERE scope = ?1 AND scope_id = ?2 AND plugin_id = ?3",
            rusqlite::params![scope, scope_id, plugin_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn is_plugin_installed(&self, scope: &str, scope_id: &str, plugin_id: &str) -> bool {
        let conn = self.0.lock().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM installed_plugins WHERE scope = ?1 AND scope_id = ?2 AND plugin_id = ?3",
                rusqlite::params![scope, scope_id, plugin_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        count > 0
    }
`;

// Insert the methods before the last }
db = db.replace(/}\s*$/, methods + '\n}');

fs.writeFileSync('src-tauri/src/db.rs', db);

let plugins = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

// Replace all workspace_plugins usages
plugins = plugins.replace(
  'pub async fn install_plugin(\n    app: AppHandle,\n    workspace_id: i64,\n    plugin_id: String,\n) -> Result<String, String> {',
  'pub async fn install_plugin(\n    app: AppHandle,\n    scope: String,\n    scope_id: String,\n    plugin_id: String,\n) -> Result<String, String> {'
);

plugins = plugins.replace(
  /let \(ws_path, entry\) = {[\s\S]*?};/,
  `let (ws_path, entry) = {
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
    };`
);

plugins = plugins.replace(
  'do_install_plugin(&app, workspace_id, &ws_path, &entry).await?;',
  'do_install_plugin(&app, &scope, &scope_id, &ws_path, &entry).await?;'
);

plugins = plugins.replace(
  'pub fn uninstall_plugin(\n    db: tauri::State<Db>,\n    workspace_id: i64,\n    plugin_id: String,\n) -> Result<(), String> {',
  'pub fn uninstall_plugin(\n    db: tauri::State<Db>,\n    scope: String,\n    scope_id: String,\n    plugin_id: String,\n) -> Result<(), String> {'
);
plugins = plugins.replace(
  'db.remove_workspace_plugin(workspace_id, &plugin_id)',
  'db.remove_installed_plugin(&scope, &scope_id, &plugin_id)'
);

plugins = plugins.replace(
  'pub fn list_installed_plugins(\n    db: tauri::State<Db>,\n    workspace_id: i64,\n) -> Vec<WorkspacePlugin> {',
  'pub fn list_installed_plugins(\n    db: tauri::State<Db>,\n    scope: String,\n    scope_id: String,\n) -> Vec<WorkspacePlugin> {'
);
plugins = plugins.replace(
  'db.list_workspace_plugins(workspace_id)',
  'db.list_installed_plugins(&scope, &scope_id)'
);

plugins = plugins.replace(
  'async fn do_install_plugin(\n    app: &AppHandle,\n    workspace_id: i64,\n    ws_path: &str,\n    entry: &PluginCacheEntry,\n) -> Result<(), String> {',
  'async fn do_install_plugin(\n    app: &AppHandle,\n    scope: &str,\n    scope_id: &str,\n    ws_path: &str,\n    entry: &PluginCacheEntry,\n) -> Result<(), String> {'
);

plugins = plugins.replace(
  /let skill_dir = format!\("\{\}\/\.superconsole\/skills\/\{\}", ws_path, slug\);/g,
  `let base_dir = if scope == "project" { format!("{}/.superconsole", ws_path) } else { ws_path.to_string() };
                    let skill_dir = format!("{}/skills/{}", base_dir, slug);`
);

plugins = plugins.replace(
  /let dest = format!\("\{\}\/\.superconsole\/commands\/\{\}\.md", ws_path, slug\);/g,
  `let base_dir = if scope == "project" { format!("{}/.superconsole", ws_path) } else { ws_path.to_string() };
            let dest = format!("{}/commands/{}.md", base_dir, slug);`
);

plugins = plugins.replace(
  /let _ = std::fs::create_dir_all\(format!\("\{\}\/\.superconsole\/commands", ws_path\)\);/g,
  `let _ = std::fs::create_dir_all(format!("{}/commands", base_dir));`
);

plugins = plugins.replace(
  /if crate::hooks::read_hook\(ws_path, hook_type\)\.is_err\(\) \{/g,
  `let base_dir = if scope == "project" { format!("{}/.superconsole", ws_path) } else { ws_path.to_string() };
            if crate::hooks::read_hook(&base_dir, hook_type).is_err() {`
);

plugins = plugins.replace(
  /let _ = crate::hooks::write_hook\(ws_path, hook_type, &content\);/g,
  `let _ = crate::hooks::write_hook(&base_dir, hook_type, &content);`
);

plugins = plugins.replace(
  'db.record_workspace_plugin(workspace_id, &entry.id, &entry.version)?;',
  'db.record_installed_plugin(scope, scope_id, &entry.id, &entry.version)?;'
);

plugins = plugins.replace(
  'workspace_id,\n                            slug,\n                            &desc,',
  '0, // Global scope uses 0 for workspace_id in project_skills currently\n                            slug,\n                            &desc,'
);

fs.writeFileSync('src-tauri/src/plugins.rs', plugins);
