const fs = require('fs');

// 1. Fix db.rs
let db = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

// Add WorkspacePlugin if it doesn't exist
if (!db.includes('pub struct WorkspacePlugin {')) {
    db += `
#[derive(serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePlugin {
    pub id: String,
    pub scope: String,
    pub scope_id: String,
    pub plugin_id: String,
    pub installed_at: String,
}
`;
}

// Fix missing synced_at and created_at in other structs
db = db.replace(/pub install_count: i64,\n}/g, 'pub install_count: i64,\n    pub synced_at: Option<String>,\n    pub created_at: Option<String>,\n}');
fs.writeFileSync('src-tauri/src/db.rs', db);


// 2. Fix plugins.rs
let plugins = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

// Fix missing agent_ids in PluginCacheEntry initialization
plugins = plugins.replace(/command_ids: "\\[\\]".into\(\),/g, 'agent_ids: "[]".into(),\n        command_ids: "[]".into(),');

// Fix leftover workspace_id in pull_plugin_cache
plugins = plugins.replace(/pub async fn pull_plugin_cache\(\n    db: tauri::State\<'_, Db>,\n    app: tauri::AppHandle,\n    workspace_id: i64,\n\)/, 
'pub async fn pull_plugin_cache(\n    db: tauri::State<\'_, Db>,\n    app: tauri::AppHandle,\n    scope: String,\n    scope_id: String,\n)');
plugins = plugins.replace(/\.list_workspace_plugins\(workspace_id\)/g, '.list_installed_plugins(&scope, &scope_id)');

// Fix leftover workspace_id in sync_connectors_catalog and others if any
plugins = plugins.replace(/now\.clone\(\),/g, 'Some(now.clone()),');
plugins = plugins.replace(/created_at: crate::cloud::cell_text\(row, 15\),/g, 'created_at: Some(crate::cloud::cell_text(row, 15)),');

fs.writeFileSync('src-tauri/src/plugins.rs', plugins);
