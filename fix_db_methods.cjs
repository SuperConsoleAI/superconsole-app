const fs = require('fs');

let db = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

const missingCode = `
// --- Missing Plugin Structs ---

#[derive(serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PluginCacheEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub icon_url: Option<String>,
    pub docs_url: Option<String>,
    pub github_url: Option<String>,
    pub category: String,
    pub scope: String,
    pub skill_ids: String,
    pub agent_ids: String,
    pub mcp_ids: String,
    pub command_ids: String,
    pub hook_ids: String,
    pub connector_ids: String,
    pub skills_url: Option<String>,
    pub commands_url: Option<String>,
    pub hooks_url: Option<String>,
    pub mcp_url: Option<String>,
    pub connector_auth: String,
    pub featured: bool,
    pub synced_at: String,
}

#[derive(serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorCatalogEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub auth_type: String,
    pub oauth_url: Option<String>,
    pub api_key_fields: String,
    pub docs_url: Option<String>,
    pub icon_url: Option<String>,
    pub scope: String,
    pub install_count: i64,
}

#[derive(serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct McpCatalogEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub category: String,
    pub r#type: String,
    pub url: Option<String>,
    pub command: Option<String>,
    pub args: String,
    pub env: String,
    pub required_env_vars: String,
    pub github_url: Option<String>,
    pub icon_url: Option<String>,
    pub docs_url: Option<String>,
    pub install_count: i64,
}

#[derive(serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommandsCatalogEntry {
    pub id: String,
    pub name: String,
    pub slash: String,
    pub description: String,
    pub author: String,
    pub category: String,
    pub github_url: String,
    pub content: Option<String>,
    pub icon_url: Option<String>,
    pub install_count: i64,
}

#[derive(serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HooksCatalogEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub hook_type: String,
    pub github_url: String,
    pub content: Option<String>,
    pub icon_url: Option<String>,
    pub install_count: i64,
}

// --- Missing Plugin Methods ---

impl Db {
    pub fn upsert_plugin_cache(&self, e: &PluginCacheEntry) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO plugins_cache (id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured, synced_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name, description=excluded.description, author=excluded.author, version=excluded.version,
               icon_url=excluded.icon_url, docs_url=excluded.docs_url, github_url=excluded.github_url, category=excluded.category,
               scope=excluded.scope, skill_ids=excluded.skill_ids, agent_ids=excluded.agent_ids, mcp_ids=excluded.mcp_ids,
               command_ids=excluded.command_ids, hook_ids=excluded.hook_ids, connector_ids=excluded.connector_ids,
               skills_url=excluded.skills_url, commands_url=excluded.commands_url, hooks_url=excluded.hooks_url, mcp_url=excluded.mcp_url,
               connector_auth=excluded.connector_auth, featured=excluded.featured, synced_at=excluded.synced_at",
            rusqlite::params![
                e.id, e.name, e.description, e.author, e.version, e.icon_url, e.docs_url, e.github_url, e.category, e.scope, e.skill_ids, e.agent_ids, e.mcp_ids, e.command_ids, e.hook_ids, e.connector_ids, e.skills_url, e.commands_url, e.hooks_url, e.mcp_url, e.connector_auth, e.featured as i64, e.synced_at
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_plugins_cache(&self, category: Option<&str>) -> Vec<PluginCacheEntry> {
        let conn = self.0.lock().unwrap();
        let sql = if category.is_some() {
            "SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured, synced_at FROM plugins_cache WHERE category = ? ORDER BY name"
        } else {
            "SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured, synced_at FROM plugins_cache ORDER BY name"
        };
        let mut stmt = conn.prepare(sql).unwrap();
        let iter = if let Some(c) = category {
            stmt.query_map([c], Self::map_plugin_cache)
        } else {
            stmt.query_map([], Self::map_plugin_cache)
        };
        iter.unwrap().filter_map(|r| r.ok()).collect()
    }

    pub fn get_plugin_cache(&self, id: &str) -> Option<PluginCacheEntry> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured, synced_at FROM plugins_cache WHERE id = ?1",
            [id],
            Self::map_plugin_cache,
        ).ok()
    }

    pub fn search_plugins_cache(&self, query: &str) -> Vec<PluginCacheEntry> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured, synced_at FROM plugins_cache WHERE name LIKE ?1 OR description LIKE ?1 ORDER BY name").unwrap();
        let q = format!("%{}%", query);
        stmt.query_map([&q], Self::map_plugin_cache).unwrap().filter_map(|r| r.ok()).collect()
    }

    fn map_plugin_cache(row: &rusqlite::Row) -> rusqlite::Result<PluginCacheEntry> {
        Ok(PluginCacheEntry {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            author: row.get(3)?,
            version: row.get(4)?,
            icon_url: row.get(5)?,
            docs_url: row.get(6)?,
            github_url: row.get(7)?,
            category: row.get(8)?,
            scope: row.get(9)?,
            skill_ids: row.get(10)?,
            agent_ids: row.get(11)?,
            mcp_ids: row.get(12)?,
            command_ids: row.get(13)?,
            hook_ids: row.get(14)?,
            connector_ids: row.get(15)?,
            skills_url: row.get(16)?,
            commands_url: row.get(17)?,
            hooks_url: row.get(18)?,
            mcp_url: row.get(19)?,
            connector_auth: row.get(20)?,
            featured: row.get::<_, i64>(21)? != 0,
            synced_at: row.get(22)?,
        })
    }

    // Connector Catalog
    pub fn upsert_connector_catalog(&self, e: &ConnectorCatalogEntry) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO connector_catalog_cache (id, name, description, category, auth_type, oauth_url, api_key_fields, docs_url, icon_url, scope, install_count) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, category=excluded.category, auth_type=excluded.auth_type, oauth_url=excluded.oauth_url, api_key_fields=excluded.api_key_fields, docs_url=excluded.docs_url, icon_url=excluded.icon_url, scope=excluded.scope, install_count=excluded.install_count",
            rusqlite::params![e.id, e.name, e.description, e.category, e.auth_type, e.oauth_url, e.api_key_fields, e.docs_url, e.icon_url, e.scope, e.install_count],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_connector_catalog(&self) -> Vec<ConnectorCatalogEntry> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, description, category, auth_type, oauth_url, api_key_fields, docs_url, icon_url, scope, install_count FROM connector_catalog_cache ORDER BY name").unwrap();
        stmt.query_map([], |r| {
            Ok(ConnectorCatalogEntry {
                id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, category: r.get(3)?, auth_type: r.get(4)?, oauth_url: r.get(5)?, api_key_fields: r.get(6)?, docs_url: r.get(7)?, icon_url: r.get(8)?, scope: r.get(9)?, install_count: r.get(10)?
            })
        }).unwrap().filter_map(|r| r.ok()).collect()
    }

    // MCP Catalog
    pub fn upsert_mcp_catalog(&self, e: &McpCatalogEntry) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO mcp_catalog_cache (id, name, description, author, category, type, url, command, args, env, required_env_vars, github_url, icon_url, docs_url, install_count) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, author=excluded.author, category=excluded.category, type=excluded.type, url=excluded.url, command=excluded.command, args=excluded.args, env=excluded.env, required_env_vars=excluded.required_env_vars, github_url=excluded.github_url, icon_url=excluded.icon_url, docs_url=excluded.docs_url, install_count=excluded.install_count",
            rusqlite::params![e.id, e.name, e.description, e.author, e.category, e.r#type, e.url, e.command, e.args, e.env, e.required_env_vars, e.github_url, e.icon_url, e.docs_url, e.install_count],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_mcp_catalog(&self, category: Option<&str>) -> Vec<McpCatalogEntry> {
        let conn = self.0.lock().unwrap();
        let sql = if category.is_some() { "SELECT id, name, description, author, category, type, url, command, args, env, required_env_vars, github_url, icon_url, docs_url, install_count FROM mcp_catalog_cache WHERE category = ? ORDER BY name" } else { "SELECT id, name, description, author, category, type, url, command, args, env, required_env_vars, github_url, icon_url, docs_url, install_count FROM mcp_catalog_cache ORDER BY name" };
        let mut stmt = conn.prepare(sql).unwrap();
        let iter = if let Some(c) = category { stmt.query_map([c], Self::map_mcp) } else { stmt.query_map([], Self::map_mcp) };
        iter.unwrap().filter_map(|r| r.ok()).collect()
    }

    fn map_mcp(r: &rusqlite::Row) -> rusqlite::Result<McpCatalogEntry> {
        Ok(McpCatalogEntry { id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, author: r.get(3)?, category: r.get(4)?, r#type: r.get(5)?, url: r.get(6)?, command: r.get(7)?, args: r.get(8)?, env: r.get(9)?, required_env_vars: r.get(10)?, github_url: r.get(11)?, icon_url: r.get(12)?, docs_url: r.get(13)?, install_count: r.get(14)? })
    }

    // Commands Catalog
    pub fn upsert_commands_catalog(&self, e: &CommandsCatalogEntry) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO commands_catalog_cache (id, name, slash, description, author, category, github_url, content, icon_url, install_count) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(id) DO UPDATE SET name=excluded.name, slash=excluded.slash, description=excluded.description, author=excluded.author, category=excluded.category, github_url=excluded.github_url, content=excluded.content, icon_url=excluded.icon_url, install_count=excluded.install_count",
            rusqlite::params![e.id, e.name, e.slash, e.description, e.author, e.category, e.github_url, e.content, e.icon_url, e.install_count],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_commands_catalog(&self) -> Vec<CommandsCatalogEntry> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, slash, description, author, category, github_url, content, icon_url, install_count FROM commands_catalog_cache ORDER BY name").unwrap();
        stmt.query_map([], |r| {
            Ok(CommandsCatalogEntry { id: r.get(0)?, name: r.get(1)?, slash: r.get(2)?, description: r.get(3)?, author: r.get(4)?, category: r.get(5)?, github_url: r.get(6)?, content: r.get(7)?, icon_url: r.get(8)?, install_count: r.get(9)? })
        }).unwrap().filter_map(|r| r.ok()).collect()
    }

    // Hooks Catalog
    pub fn upsert_hooks_catalog(&self, e: &HooksCatalogEntry) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO hooks_catalog_cache (id, name, description, author, hook_type, github_url, content, icon_url, install_count) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, author=excluded.author, hook_type=excluded.hook_type, github_url=excluded.github_url, content=excluded.content, icon_url=excluded.icon_url, install_count=excluded.install_count",
            rusqlite::params![e.id, e.name, e.description, e.author, e.hook_type, e.github_url, e.content, e.icon_url, e.install_count],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_hooks_catalog(&self, hook_type: Option<&str>) -> Vec<HooksCatalogEntry> {
        let conn = self.0.lock().unwrap();
        let sql = if hook_type.is_some() { "SELECT id, name, description, author, hook_type, github_url, content, icon_url, install_count FROM hooks_catalog_cache WHERE hook_type = ? ORDER BY name" } else { "SELECT id, name, description, author, hook_type, github_url, content, icon_url, install_count FROM hooks_catalog_cache ORDER BY name" };
        let mut stmt = conn.prepare(sql).unwrap();
        let iter = if let Some(t) = hook_type { stmt.query_map([t], Self::map_hooks) } else { stmt.query_map([], Self::map_hooks) };
        iter.unwrap().filter_map(|r| r.ok()).collect()
    }

    fn map_hooks(r: &rusqlite::Row) -> rusqlite::Result<HooksCatalogEntry> {
        Ok(HooksCatalogEntry { id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, author: r.get(3)?, hook_type: r.get(4)?, github_url: r.get(5)?, content: r.get(6)?, icon_url: r.get(7)?, install_count: r.get(8)? })
    }
}
`;

db = db.replace('// --- Missing Plugin Structs ---', '');
db = db.replace('// --- Missing Plugin Methods ---', '');
db = db.replace(/}\s*$/, missingCode + '\n}');

fs.writeFileSync('src-tauri/src/db.rs', db);

// We ALSO need to add the SQLite table schemas!
let initDb = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

const tableSchemas = `
            CREATE TABLE IF NOT EXISTS plugins_cache (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                author TEXT NOT NULL,
                version TEXT NOT NULL,
                icon_url TEXT,
                docs_url TEXT,
                github_url TEXT,
                category TEXT NOT NULL,
                scope TEXT NOT NULL,
                skill_ids TEXT NOT NULL,
                agent_ids TEXT NOT NULL,
                mcp_ids TEXT NOT NULL,
                command_ids TEXT NOT NULL,
                hook_ids TEXT NOT NULL,
                connector_ids TEXT NOT NULL,
                skills_url TEXT,
                commands_url TEXT,
                hooks_url TEXT,
                mcp_url TEXT,
                connector_auth TEXT NOT NULL,
                featured INTEGER NOT NULL DEFAULT 0,
                synced_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS connector_catalog_cache (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                auth_type TEXT NOT NULL,
                oauth_url TEXT,
                api_key_fields TEXT NOT NULL,
                docs_url TEXT,
                icon_url TEXT,
                scope TEXT NOT NULL,
                install_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS mcp_catalog_cache (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                author TEXT NOT NULL,
                category TEXT NOT NULL,
                type TEXT NOT NULL,
                url TEXT,
                command TEXT,
                args TEXT NOT NULL,
                env TEXT NOT NULL,
                required_env_vars TEXT NOT NULL,
                github_url TEXT,
                icon_url TEXT,
                docs_url TEXT,
                install_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS commands_catalog_cache (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                slash TEXT NOT NULL,
                description TEXT NOT NULL,
                author TEXT NOT NULL,
                category TEXT NOT NULL,
                github_url TEXT NOT NULL,
                content TEXT,
                icon_url TEXT,
                install_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS hooks_catalog_cache (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                author TEXT NOT NULL,
                hook_type TEXT NOT NULL,
                github_url TEXT NOT NULL,
                content TEXT,
                icon_url TEXT,
                install_count INTEGER NOT NULL DEFAULT 0
            );
`;

if (!initDb.includes('plugins_cache (')) {
    initDb = initDb.replace(
        '            CREATE TABLE IF NOT EXISTS installed_plugins (',
        tableSchemas + '\n            CREATE TABLE IF NOT EXISTS installed_plugins ('
    );
    fs.writeFileSync('src-tauri/src/db.rs', initDb);
}
