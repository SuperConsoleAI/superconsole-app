const fs = require('fs');

// Add console.log to handleInstall in CustomizePage.tsx
let customizeCode = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');
customizeCode = customizeCode.replace(
  'const handleInstall = async (pluginId: string) => {',
  'const handleInstall = async (pluginId: string) => {\n    console.log("handleInstall called with pluginId:", pluginId, "scope:", scope);'
);
customizeCode = customizeCode.replace(
  'try { await api.installPlugin(scope.type, scope.id, pluginId); await loadPlugins(query, category, scope); }',
  'try { console.log("Calling api.installPlugin..."); await api.installPlugin(scope.type, scope.id, pluginId); console.log("api.installPlugin success!"); await loadPlugins(query, category, scope); }'
);
fs.writeFileSync('src/components/CustomizePage.tsx', customizeCode);

// Add eprintln! to install_plugin in plugins.rs
let pluginsCode = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');
pluginsCode = pluginsCode.replace(
  'pub async fn install_plugin(\n    app: AppHandle,\n    scope: String,\n    scope_id: String,\n    plugin_id: String,\n) -> Result<String, String> {',
  'pub async fn install_plugin(\n    app: AppHandle,\n    scope: String,\n    scope_id: String,\n    plugin_id: String,\n) -> Result<String, String> {\n    eprintln!(">>> install_plugin called in Rust! scope: {}, scope_id: {}, plugin_id: {}", scope, scope_id, plugin_id);'
);
pluginsCode = pluginsCode.replace(
  'pub async fn do_install_plugin(\n    app: &AppHandle,\n    scope: &str,\n    scope_id: &str,\n    ws_path: &str,\n    entry: &PluginCacheEntry,\n) -> Result<(), String> {',
  'pub async fn do_install_plugin(\n    app: &AppHandle,\n    scope: &str,\n    scope_id: &str,\n    ws_path: &str,\n    entry: &PluginCacheEntry,\n) -> Result<(), String> {\n    eprintln!(">>> do_install_plugin called for {} at {}", entry.id, ws_path);'
);
fs.writeFileSync('src-tauri/src/plugins.rs', pluginsCode);
