const fs = require('fs');
let code = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

const tableStr = `CREATE TABLE IF NOT EXISTS installed_plugins_cache (
                id TEXT PRIMARY KEY,
                plugin_id TEXT NOT NULL,
                scope TEXT NOT NULL,
                scope_id TEXT NOT NULL,
                installed_at TEXT NOT NULL DEFAULT (datetime('now')),
                installed_by TEXT NOT NULL DEFAULT '',
                version TEXT NOT NULL DEFAULT '1.0.0',
                skills_url TEXT NOT NULL DEFAULT '[]',
                commands_url TEXT NOT NULL DEFAULT '[]',
                hooks_url TEXT NOT NULL DEFAULT '[]',
                mcp_url TEXT NOT NULL DEFAULT '[]'
            );`;

const newTableStr = `CREATE TABLE IF NOT EXISTS installed_plugins_cache (
                id TEXT PRIMARY KEY,
                plugin_id TEXT NOT NULL,
                scope TEXT NOT NULL,
                scope_id TEXT NOT NULL,
                installed_at TEXT NOT NULL DEFAULT (datetime('now')),
                installed_by TEXT NOT NULL DEFAULT '',
                version TEXT NOT NULL DEFAULT '1.0.0',
                skills_url TEXT NOT NULL DEFAULT '[]',
                commands_url TEXT NOT NULL DEFAULT '[]',
                hooks_url TEXT NOT NULL DEFAULT '[]',
                mcp_url TEXT NOT NULL DEFAULT '[]'
            );
            CREATE INDEX IF NOT EXISTS installed_plugins_cache_scope_idx 
                ON installed_plugins_cache(scope, scope_id);`;

if (!code.includes('installed_plugins_cache_scope_idx')) {
    code = code.replace(tableStr, newTableStr);
    fs.writeFileSync('src-tauri/src/db.rs', code);
}
