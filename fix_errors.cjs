const fs = require('fs');

let plugins = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');
plugins = plugins.replaceAll('/*', '// ');
plugins = plugins.replaceAll('*/', '');

// fix PluginCacheEntry initializations in plugins.rs
plugins = plugins.replace(
  'hooks_url: cell_opt(row, 17),\n            mcp_url: cell_opt(row, 18),\n            connector_auth: cell_text(row, 19),',
  'hooks_url: cell_opt(row, 17),\n            mcp_url: cell_opt(row, 18),\n            connector_auth: cell_text(row, 19),'
); // Already there?

// In `list_plugins_catalog` 103
plugins = plugins.replace(
  'hooks_url: cell_opt(row, 17),\n            connector_auth: cell_text(row, 18),',
  'hooks_url: cell_opt(row, 17),\n            mcp_url: cell_opt(row, 18),\n            connector_auth: cell_text(row, 19),'
);

// In `do_install_plugin` 258
plugins = plugins.replace(
  'hooks_url: entry.hooks_url.clone(),\n        connector_auth: entry.connector_auth.clone(),',
  'hooks_url: entry.hooks_url.clone(),\n        mcp_url: entry.mcp_url.clone(),\n        connector_auth: entry.connector_auth.clone(),'
);

fs.writeFileSync('src-tauri/src/plugins.rs', plugins);


let db = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

// fix double mcp_url
db = db.replace('mcp_url: r.get(18)?,\n                    mcp_url: r.get(18)?,', 'mcp_url: r.get(18)?,');

// ensure missing mcp_url are there
db = db.replace(
  'hooks_url: r.get(17)?,\n                connector_auth: r.get(18)?,',
  'hooks_url: r.get(17)?,\n                mcp_url: r.get(18)?,\n                connector_auth: r.get(19)?,'
);
db = db.replace(
  'hooks_url: r.get(17)?,\n                connector_auth: r.get(18)?,',
  'hooks_url: r.get(17)?,\n                mcp_url: r.get(18)?,\n                connector_auth: r.get(19)?,'
);

fs.writeFileSync('src-tauri/src/db.rs', db);
