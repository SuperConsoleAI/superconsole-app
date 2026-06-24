const fs = require('fs');
let code = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

const oldInstalled = `            CREATE TABLE IF NOT EXISTS installed_plugins (
                id TEXT PRIMARY KEY,
                plugin_id TEXT NOT NULL,
                scope TEXT NOT NULL,
                scope_id TEXT NOT NULL,
                installed_at TEXT NOT NULL DEFAULT (datetime('now')),
                version TEXT NOT NULL DEFAULT '1.0.0'
            );`;

const newInstalled = `            CREATE TABLE IF NOT EXISTS installed_plugins (
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

code = code.replace(oldInstalled, newInstalled);

// Add ALTER TABLEs right after workspace alterations around line 420
const alterWorkspacesMarker = `            conn.execute_batch("ALTER TABLE workspaces ADD COLUMN project_id TEXT;")
                .map_err(|e| e.to_string())?;
        }`;

const alters = `            conn.execute_batch("ALTER TABLE workspaces ADD COLUMN project_id TEXT;")
                .map_err(|e| e.to_string())?;
        }

        // Alterations for installed_plugins schema
        for (col, decl) in [
            ("installed_by", "TEXT NOT NULL DEFAULT ''"),
            ("skills_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("commands_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("hooks_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("mcp_url", "TEXT NOT NULL DEFAULT '[]'"),
        ] {
            if conn.prepare(&format!("SELECT {} FROM installed_plugins LIMIT 1", col)).is_err() {
                let _ = conn.execute_batch(&format!("ALTER TABLE installed_plugins ADD COLUMN {} {};", col, decl));
            }
        }
        
        // Ensure catalog cache tables exist
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS plugins_cache (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                author TEXT NOT NULL DEFAULT '',
                version TEXT NOT NULL DEFAULT '1.0.0',
                icon_url TEXT NOT NULL DEFAULT '',
                docs_url TEXT NOT NULL DEFAULT '',
                github_url TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                scope TEXT NOT NULL DEFAULT 'project',
                skill_ids TEXT NOT NULL DEFAULT '[]',
                agent_ids TEXT NOT NULL DEFAULT '[]',
                mcp_ids TEXT NOT NULL DEFAULT '[]',
                command_ids TEXT NOT NULL DEFAULT '[]',
                hook_ids TEXT NOT NULL DEFAULT '[]',
                connector_ids TEXT NOT NULL DEFAULT '[]',
                skills_url TEXT NOT NULL DEFAULT '[]',
                commands_url TEXT NOT NULL DEFAULT '[]',
                hooks_url TEXT NOT NULL DEFAULT '[]',
                mcp_url TEXT NOT NULL DEFAULT '[]',
                connector_auth TEXT NOT NULL DEFAULT '[]',
                featured INTEGER NOT NULL DEFAULT 0,
                synced_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS mcp_catalog_cache (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                author TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                type TEXT NOT NULL DEFAULT '',
                url TEXT NOT NULL DEFAULT '',
                command TEXT NOT NULL DEFAULT '',
                args TEXT NOT NULL DEFAULT '[]',
                env TEXT NOT NULL DEFAULT '{}',
                required_env_vars TEXT NOT NULL DEFAULT '[]',
                github_url TEXT NOT NULL DEFAULT '',
                icon_url TEXT NOT NULL DEFAULT '',
                docs_url TEXT NOT NULL DEFAULT '',
                install_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS commands_catalog_cache (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                slash TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                author TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                github_url TEXT NOT NULL DEFAULT '',
                content TEXT,
                icon_url TEXT,
                install_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS hooks_catalog_cache (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                author TEXT NOT NULL DEFAULT '',
                hook_type TEXT NOT NULL DEFAULT '',
                github_url TEXT NOT NULL DEFAULT '',
                content TEXT,
                icon_url TEXT,
                install_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS connector_catalog_cache (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                auth_type TEXT NOT NULL DEFAULT '',
                oauth_url TEXT NOT NULL DEFAULT '',
                api_key_fields TEXT NOT NULL DEFAULT '[]',
                docs_url TEXT NOT NULL DEFAULT '',
                icon_url TEXT NOT NULL DEFAULT '',
                scope TEXT NOT NULL DEFAULT '',
                install_count INTEGER NOT NULL DEFAULT 0
            );"
        ).map_err(|e| e.to_string())?;

        // Alterations for plugins_cache
        for (col, decl) in [
            ("agent_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("mcp_url", "TEXT NOT NULL DEFAULT '[]'"),
        ] {
            if conn.prepare(&format!("SELECT {} FROM plugins_cache LIMIT 1", col)).is_err() {
                let _ = conn.execute_batch(&format!("ALTER TABLE plugins_cache ADD COLUMN {} {};", col, decl));
            }
        }`;

code = code.replace(alterWorkspacesMarker, alters);

fs.writeFileSync('src-tauri/src/db.rs', code);
