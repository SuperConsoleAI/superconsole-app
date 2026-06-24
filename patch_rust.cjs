const fs = require('fs');

// Patch plugins.rs
let plugins = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

// fix PluginCacheEntry in list_plugins_catalog
plugins = plugins.replace(
  'hooks_url: if let crate::cloud::SqlValue::Text(s) = &r.cols[17] { Some(s.clone()) } else { None },',
  'hooks_url: if let crate::cloud::SqlValue::Text(s) = &r.cols[17] { Some(s.clone()) } else { None },\n                        mcp_url: if let crate::cloud::SqlValue::Text(s) = &r.cols[18] { Some(s.clone()) } else { None },'
);
// In `get_plugin` fetch from cloud:
plugins = plugins.replace(
  'connector_auth: if let crate::cloud::SqlValue::Text(s) = &row.cols[19] { s.clone() } else { "[]".to_string() },',
  'mcp_url: if let crate::cloud::SqlValue::Text(s) = &row.cols[18] { Some(s.clone()) } else { None },\n                connector_auth: if let crate::cloud::SqlValue::Text(s) = &row.cols[19] { s.clone() } else { "[]".to_string() },'
);
// Wait, `get_plugin` cloud fetch might use a different offset now.
// Let's just blindly add mcp_url: None to fix it if it's not strictly queried in get_plugin, or we can just parse it if queried.
plugins = plugins.replaceAll(
  'hooks_url: if let crate::cloud::SqlValue::Text(s) = &row.cols[17] { Some(s.clone()) } else { None },',
  'hooks_url: if let crate::cloud::SqlValue::Text(s) = &row.cols[17] { Some(s.clone()) } else { None },\n                mcp_url: if let crate::cloud::SqlValue::Text(s) = &row.cols[18] { Some(s.clone()) } else { None },'
);
plugins = plugins.replaceAll(
  'hooks_url: entry.hooks_url.clone(),',
  'hooks_url: entry.hooks_url.clone(),\n        mcp_url: entry.mcp_url.clone(),'
);

// Remove the `add_mcp_config` calls
plugins = plugins.replaceAll(
  'let _ = crate::mcp::add_mcp_config(',
  '// let _ = crate::mcp::add_mcp_config('
);

fs.writeFileSync('src-tauri/src/plugins.rs', plugins);

// Patch db.rs
let db = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

db = db.replace(
  'SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, connector_auth, featured, synced_at FROM plugins_cache',
  'SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured, synced_at FROM plugins_cache'
);
db = db.replace(
  'SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, connector_auth, featured, synced_at FROM plugins_cache',
  'SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured, synced_at FROM plugins_cache'
);

db = db.replaceAll(
  'hooks_url: row.get(18)?,',
  'hooks_url: row.get(18)?,\n                    mcp_url: row.get(19)?,'
);
db = db.replaceAll(
  'hooks_url: row.get(18)?,',
  'hooks_url: row.get(18)?,\n                mcp_url: row.get(19)?,'
);

db = db.replaceAll(
  'connector_auth: row.get(19)?,',
  'connector_auth: row.get(20)?,'
);
db = db.replaceAll(
  'featured: row.get(20)?,',
  'featured: row.get(21)?,'
);
db = db.replaceAll(
  'synced_at: row.get(21)?,',
  'synced_at: row.get(22)?,'
);


fs.writeFileSync('src-tauri/src/db.rs', db);
