const fs = require('fs');

// Fix db.rs mappings
let db = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

db = db.replace(
    'Ok(ConnectorCatalogEntry {\n                id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, category: r.get(3)?, auth_type: r.get(4)?, oauth_url: r.get(5)?, api_key_fields: r.get(6)?, docs_url: r.get(7)?, icon_url: r.get(8)?, scope: r.get(9)?, install_count: r.get(10)?\n            })',
    'Ok(ConnectorCatalogEntry {\n                id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, category: r.get(3)?, auth_type: r.get(4)?, oauth_url: r.get(5)?, api_key_fields: r.get(6)?, docs_url: r.get(7)?, icon_url: r.get(8)?, scope: r.get(9)?, install_count: r.get(10)?, synced_at: None, created_at: None\n            })'
);

db = db.replace(
    'Ok(McpCatalogEntry { id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, author: r.get(3)?, category: r.get(4)?, r#type: r.get(5)?, url: r.get(6)?, command: r.get(7)?, args: r.get(8)?, env: r.get(9)?, required_env_vars: r.get(10)?, github_url: r.get(11)?, icon_url: r.get(12)?, docs_url: r.get(13)?, install_count: r.get(14)? })',
    'Ok(McpCatalogEntry { id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, author: r.get(3)?, category: r.get(4)?, r#type: r.get(5)?, url: r.get(6)?, command: r.get(7)?, args: r.get(8)?, env: r.get(9)?, required_env_vars: r.get(10)?, github_url: r.get(11)?, icon_url: r.get(12)?, docs_url: r.get(13)?, install_count: r.get(14)?, synced_at: None, created_at: None })'
);

db = db.replace(
    'Ok(CommandsCatalogEntry { id: r.get(0)?, name: r.get(1)?, slash: r.get(2)?, description: r.get(3)?, author: r.get(4)?, category: r.get(5)?, github_url: r.get(6)?, content: r.get(7)?, icon_url: r.get(8)?, install_count: r.get(9)? })',
    'Ok(CommandsCatalogEntry { id: r.get(0)?, name: r.get(1)?, slash: r.get(2)?, description: r.get(3)?, author: r.get(4)?, category: r.get(5)?, github_url: r.get(6)?, content: r.get(7)?, icon_url: r.get(8)?, install_count: r.get(9)?, synced_at: None, created_at: None })'
);

db = db.replace(
    'Ok(HooksCatalogEntry { id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, author: r.get(3)?, hook_type: r.get(4)?, github_url: r.get(5)?, content: r.get(6)?, icon_url: r.get(7)?, install_count: r.get(8)? })',
    'Ok(HooksCatalogEntry { id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, author: r.get(3)?, hook_type: r.get(4)?, github_url: r.get(5)?, content: r.get(6)?, icon_url: r.get(7)?, install_count: r.get(8)?, synced_at: None, created_at: None })'
);

fs.writeFileSync('src-tauri/src/db.rs', db);

// Fix plugins.rs PluginCacheEntry
let plugins = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

// There are probably multiple "let entry = PluginCacheEntry {" that need fixing.
plugins = plugins.replace(
    /command_ids: "\[\]"\.into\(\),\n\s*hook_ids: "\[\]"\.into\(\),/g,
    'agent_ids: "[]".into(),\n        command_ids: "[]".into(),\n        hook_ids: "[]".into(),'
);

// Specifically line 103 and 266:
plugins = plugins.replace(
    /category: crate::cloud::cell_text\(row, 8\),\n\s*scope: crate::cloud::cell_text\(row, 9\),\n\s*skill_ids: crate::cloud::cell_text\(row, 10\),\n\s*mcp_ids: crate::cloud::cell_text\(row, 12\),/g,
    'category: crate::cloud::cell_text(row, 8),\n                                scope: crate::cloud::cell_text(row, 9),\n                                skill_ids: crate::cloud::cell_text(row, 10),\n                                agent_ids: crate::cloud::cell_text(row, 11),\n                                mcp_ids: crate::cloud::cell_text(row, 12),'
);

plugins = plugins.replace(
    /skill_ids: "\[\]"\.into\(\),\n\s*mcp_ids: "\[\]"\.into\(\),/g,
    'skill_ids: "[]".into(),\n        agent_ids: "[]".into(),\n        mcp_ids: "[]".into(),'
);

fs.writeFileSync('src-tauri/src/plugins.rs', plugins);
