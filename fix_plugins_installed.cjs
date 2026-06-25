const fs = require('fs');

let plugins = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

// For list_plugins_catalog
plugins = plugins.replace(
  /let installed: std::collections::HashSet<String> = db\s*\.list_installed_plugins\(&scope, &scope_id\)\s*\.into_iter\(\)\s*\.map\(\|p\| p\.plugin_id\)\s*\.collect\(\);/g,
  `let mut installed: std::collections::HashSet<String> = db
            .list_installed_plugins(&scope, &scope_id)
            .into_iter()
            .map(|p| p.plugin_id)
            .collect();
        if scope != "account" {
            installed.extend(db.list_installed_plugins("account", "account").into_iter().map(|p| p.plugin_id));
        }`
);

fs.writeFileSync('src-tauri/src/plugins.rs', plugins);
