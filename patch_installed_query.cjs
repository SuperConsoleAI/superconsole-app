const fs = require('fs');

let db = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

const oldQuery = `"SELECT id, scope, scope_id, plugin_id, installed_at
             FROM installed_plugins_cache WHERE scope = ?1 AND scope_id = ?2 ORDER BY installed_at DESC"`;
             
const newQuery = `"SELECT id, scope, scope_id, plugin_id, installed_at, version, skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, rule_ids, connector_ids
             FROM installed_plugins_cache WHERE scope = ?1 AND scope_id = ?2 ORDER BY installed_at DESC"`;

db = db.replace(oldQuery, newQuery);

fs.writeFileSync('src-tauri/src/db.rs', db);
