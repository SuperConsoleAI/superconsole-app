const fs = require('fs');

let db = fs.readFileSync('src-tauri/src/db.rs', 'utf8');
db = db.replace(
  /skills_url: row.get\(12\)\?/g,
  'skills_url: row.get(12)?,\n                    mcp_url: row.get(15)?'
);
db = db.replace(
  /skills_url: row.get\(12\)\?/g,
  'skills_url: row.get(12)?,\n                mcp_url: row.get(15)?'
);
// Above regexes might miss if indices are different. I will just do exact string replacements.

db = db.replaceAll(
  'hooks_url: row.get(14)?,',
  'hooks_url: row.get(14)?,\n                    mcp_url: row.get(15)?,'
);
// Wait, `mcp_url` index in `SELECT` for plugins_cache.
db = db.replaceAll(
  'connector_auth: row.get(15)?,',
  'mcp_url: row.get(15)?,\n                    connector_auth: row.get(16)?,'
);
db = db.replaceAll(
  'connector_auth: row.get(15)?,',
  'mcp_url: row.get(15)?,\n                connector_auth: row.get(16)?,'
);

// wait let me see db.rs lines where PluginCacheEntry is
