const fs = require('fs');
let plugins = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

const oldCheck = `let mut installed: std::collections::HashSet<String> = db
            .list_installed_plugins(&scope, &scope_id)
            .into_iter()
            .map(|p| p.plugin_id)
            .collect();
        if scope != "account" {
            installed.extend(db.list_installed_plugins("account", "account").into_iter().map(|p| p.plugin_id));
        }`;
        
const newCheck = `let installed: std::collections::HashSet<String> = db
            .list_installed_plugins(&scope, &scope_id)
            .into_iter()
            .map(|p| p.plugin_id)
            .collect();`;

plugins = plugins.replace(oldCheck, newCheck);
plugins = plugins.replace(oldCheck, newCheck); // Because I added it to list_plugins_catalog AND search_plugins_catalog? Wait, did I?

// Let's just do a regex replace to be safe.
plugins = plugins.replace(/let mut installed: std::collections::HashSet<String> = db[\s\S]*?if scope != "account" \{[\s\S]*?\}/g, newCheck);

fs.writeFileSync('src-tauri/src/plugins.rs', plugins);
