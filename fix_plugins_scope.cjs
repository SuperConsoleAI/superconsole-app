const fs = require('fs');

let plugins = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

// Update list_plugins_catalog to use scope and scope_id
plugins = plugins.replace(
  'pub fn list_plugins_catalog(\n    db: tauri::State<Db>,\n    category: Option<String>,\n    workspace_id: i64,\n    query: Option<String>,\n) -> Vec<PluginCacheEntry> {',
  'pub fn list_plugins_catalog(\n    db: tauri::State<Db>,\n    category: Option<String>,\n    scope: String,\n    scope_id: String,\n    query: Option<String>,\n) -> Vec<PluginCacheEntry> {'
);

plugins = plugins.replace(
  'let installed: std::collections::HashSet<String> = db\n        .list_workspace_plugins(workspace_id)\n        .into_iter()\n        .map(|p| p.plugin_id)\n        .collect();',
  'let installed: std::collections::HashSet<String> = db\n        .list_installed_plugins(&scope, &scope_id)\n        .into_iter()\n        .map(|p| p.plugin_id)\n        .collect();'
);

plugins = plugins.replace(
  'pub fn search_plugins_catalog(\n    db: tauri::State<Db>,\n    query: String,\n    workspace_id: i64,\n) -> Vec<PluginCacheEntry> {',
  'pub fn search_plugins_catalog(\n    db: tauri::State<Db>,\n    query: String,\n    scope: String,\n    scope_id: String,\n) -> Vec<PluginCacheEntry> {'
);

plugins = plugins.replace(
  'let installed: std::collections::HashSet<String> = db\n        .list_workspace_plugins(workspace_id)\n        .into_iter()\n        .map(|p| p.plugin_id)\n        .collect();',
  'let installed: std::collections::HashSet<String> = db\n        .list_installed_plugins(&scope, &scope_id)\n        .into_iter()\n        .map(|p| p.plugin_id)\n        .collect();'
);

// Update get_plugin
plugins = plugins.replace(
  'pub async fn get_plugin(db: tauri::State<\'_, Db>, plugin_id: String, workspace_id: i64) -> Result<PluginResponse, String> {',
  'pub async fn get_plugin(db: tauri::State<\'_, Db>, plugin_id: String, scope: String, scope_id: String) -> Result<PluginResponse, String> {'
);

plugins = plugins.replace(
  '.filter(|id| db.is_plugin_installed(workspace_id, id))',
  '.filter(|id| db.is_plugin_installed(&scope, &scope_id, id))'
);

plugins = plugins.replace(
  'let is_installed = db.is_plugin_installed(workspace_id, &plugin_id);',
  'let is_installed = db.is_plugin_installed(&scope, &scope_id, &plugin_id);'
);

plugins = plugins.replace(
  'do_install_plugin(&app, workspace_id, &ws_path, &entry).await?;',
  'do_install_plugin(&app, "project", &workspace_id.to_string(), &ws_path, &entry).await?;'
);

fs.writeFileSync('src-tauri/src/plugins.rs', plugins);
