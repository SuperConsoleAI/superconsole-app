const fs = require('fs');

let plugins = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

// Fix PluginCacheEntry double agent_ids
plugins = plugins.replace(/        mcp_ids: "\[\]"\.into\(\),\n        agent_ids: "\[\]"\.into\(\),/g, '        mcp_ids: "[]".into(),');

// Fix ConnectorCatalogEntry
plugins = plugins.replace(
    '            scope: cell_text(row, 9),\n            synced_at: Some(now.clone()),\n        }).collect();',
    '            scope: cell_text(row, 9),\n            install_count: 0,\n            created_at: None,\n            synced_at: Some(now.clone()),\n        }).collect();'
);

// Fix McpCatalogEntry
plugins = plugins.replace(
    '            install_count: 0,\n            created_at: Some(crate::cloud::cell_text(row, 15)),\n        }).collect();',
    '            install_count: 0,\n            created_at: Some(crate::cloud::cell_text(row, 15)),\n            synced_at: Some(now.clone()),\n        }).collect();'
);

// Fix CommandsCatalogEntry
plugins = plugins.replace(
    '            icon_url: cell_opt(row, 8),\n            synced_at: Some(now.clone()),\n        }).collect();',
    '            icon_url: cell_opt(row, 8),\n            install_count: 0,\n            created_at: None,\n            synced_at: Some(now.clone()),\n        }).collect();'
);

fs.writeFileSync('src-tauri/src/plugins.rs', plugins);
