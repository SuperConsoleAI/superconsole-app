const fs = require('fs');

let plugins = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

plugins = plugins.replace(
  'let entries: Vec<crate::db::McpCatalogEntry> = rows(&res).iter().map(|r| crate::db::McpCatalogEntry {\n                id: r.get(0)?,\n                name: r.get(1)?,\n                description: r.get(2)?,\n                author: r.get(3)?,\n                category: r.get(4)?,\n                r#type: r.get(5)?,\n                url: r.get(6)?,\n                command: r.get(7)?,\n                args: r.get(8)?,\n                env: r.get(9)?,\n                required_env_vars: r.get(10)?,\n                github_url: r.get(11)?,\n                icon_url: r.get(12)?,\n                docs_url: r.get(13)?,\n                install_count: r.get(14)?,\n                created_at: r.get(15)?,\n            }).collect();',
  'let now = chrono::Utc::now().to_rfc3339();\n        let entries: Vec<crate::db::McpCatalogEntry> = crate::cloud::rows(&res).iter().map(|row| crate::db::McpCatalogEntry {\n            id: crate::cloud::cell_text(row, 0),\n            name: crate::cloud::cell_text(row, 1),\n            description: crate::cloud::cell_text(row, 2),\n            author: crate::cloud::cell_text(row, 3),\n            category: crate::cloud::cell_text(row, 4),\n            r#type: crate::cloud::cell_text(row, 5),\n            url: crate::cloud::cell_opt(row, 6),\n            command: crate::cloud::cell_opt(row, 7),\n            args: crate::cloud::cell_text(row, 8),\n            env: crate::cloud::cell_text(row, 9),\n            required_env_vars: crate::cloud::cell_text(row, 10),\n            github_url: crate::cloud::cell_opt(row, 11),\n            icon_url: crate::cloud::cell_opt(row, 12),\n            docs_url: crate::cloud::cell_opt(row, 13),\n            install_count: crate::cloud::cell_text(row, 14).parse().unwrap_or(0),\n            created_at: crate::cloud::cell_text(row, 15),\n        }).collect();'
);
fs.writeFileSync('src-tauri/src/plugins.rs', plugins);

let db = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

db = db.replace(
  'pub struct McpCatalogEntry {\n    pub id: String,\n    pub name: String,\n    pub description: String,\n    pub author: String,\n    pub category: String,\n    pub github_url: String,\n    pub install_command: String,\n    pub install_args: String,\n    pub required_env_vars: String,\n    pub icon_url: Option<String>,\n    pub synced_at: String,\n}',
  'pub struct McpCatalogEntry {\n    pub id: String,\n    pub name: String,\n    pub description: String,\n    pub author: String,\n    pub category: String,\n    pub r#type: String,\n    pub url: Option<String>,\n    pub command: Option<String>,\n    pub args: String,\n    pub env: String,\n    pub required_env_vars: String,\n    pub github_url: Option<String>,\n    pub icon_url: Option<String>,\n    pub docs_url: Option<String>,\n    pub install_count: i64,\n    pub created_at: String,\n}'
);

db = db.replace(
  'CREATE TABLE IF NOT EXISTS mcp_catalog_cache (\n                id TEXT PRIMARY KEY,\n                name TEXT NOT NULL,\n                description TEXT NOT NULL,\n                author TEXT NOT NULL,\n                category TEXT NOT NULL,\n                github_url TEXT NOT NULL,\n                install_command TEXT NOT NULL,\n                install_args TEXT NOT NULL,\n                required_env_vars TEXT NOT NULL,\n                icon_url TEXT,\n                synced_at TEXT NOT NULL\n            )',
  'CREATE TABLE IF NOT EXISTS mcp_catalog_cache (\n                id TEXT PRIMARY KEY,\n                name TEXT NOT NULL,\n                description TEXT NOT NULL,\n                author TEXT NOT NULL,\n                category TEXT NOT NULL,\n                type TEXT NOT NULL,\n                url TEXT,\n                command TEXT,\n                args TEXT NOT NULL,\n                env TEXT NOT NULL,\n                required_env_vars TEXT NOT NULL,\n                github_url TEXT,\n                icon_url TEXT,\n                docs_url TEXT,\n                install_count INTEGER NOT NULL,\n                created_at TEXT NOT NULL\n            )'
);

db = db.replace(
  '"INSERT INTO mcp_catalog_cache\n             (id, name, description, author, category, github_url, install_command,\n              install_args, required_env_vars, icon_url, synced_at)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)\n             ON CONFLICT(id) DO UPDATE SET\n               name=excluded.name, description=excluded.description,\n               author=excluded.author, category=excluded.category,\n               github_url=excluded.github_url, install_command=excluded.install_command,\n               install_args=excluded.install_args, required_env_vars=excluded.required_env_vars,\n               icon_url=excluded.icon_url, synced_at=excluded.synced_at",',
  '"INSERT INTO mcp_catalog_cache\n             (id, name, description, author, category, type, url, command,\n              args, env, required_env_vars, github_url, icon_url, docs_url, install_count, created_at)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)\n             ON CONFLICT(id) DO UPDATE SET\n               name=excluded.name, description=excluded.description,\n               author=excluded.author, category=excluded.category,\n               type=excluded.type, url=excluded.url, command=excluded.command,\n               args=excluded.args, env=excluded.env, required_env_vars=excluded.required_env_vars,\n               github_url=excluded.github_url, icon_url=excluded.icon_url,\n               docs_url=excluded.docs_url, install_count=excluded.install_count, created_at=excluded.created_at",'
);

db = db.replace(
  '[&e.id, &e.name, &e.description, &e.author, &e.category, &e.github_url, &e.install_command, &e.install_args, &e.required_env_vars],',
  '[&e.id, &e.name, &e.description, &e.author, &e.category, &e.r#type, e.url.as_deref().unwrap_or(""), e.command.as_deref().unwrap_or(""), &e.args, &e.env, &e.required_env_vars, e.github_url.as_deref().unwrap_or(""), e.icon_url.as_deref().unwrap_or(""), e.docs_url.as_deref().unwrap_or(""), &e.install_count.to_string(), &e.created_at],'
);

db = db.replace(
  '"SELECT id, name, description, author, category, github_url, install_command,\n                    install_args, required_env_vars, icon_url, synced_at\n             FROM mcp_catalog_cache ORDER BY name",',
  '"SELECT id, name, description, author, category, type, url, command, args, env, required_env_vars, github_url, icon_url, docs_url, install_count, created_at\n             FROM mcp_catalog_cache ORDER BY name",'
);

db = db.replace(
  'Ok(McpCatalogEntry {\n                id: r.get(0)?,\n                name: r.get(1)?,\n                description: r.get(2)?,\n                author: r.get(3)?,\n                category: r.get(4)?,\n                github_url: r.get(5)?,\n                install_command: r.get(6)?,\n                install_args: r.get(7)?,\n                required_env_vars: r.get(8)?,\n                icon_url: r.get(9)?,\n                synced_at: r.get(10)?,\n            })',
  'Ok(McpCatalogEntry {\n                id: r.get(0)?,\n                name: r.get(1)?,\n                description: r.get(2)?,\n                author: r.get(3)?,\n                category: r.get(4)?,\n                r#type: r.get(5)?,\n                url: r.get(6)?,\n                command: r.get(7)?,\n                args: r.get(8)?,\n                env: r.get(9)?,\n                required_env_vars: r.get(10)?,\n                github_url: r.get(11)?,\n                icon_url: r.get(12)?,\n                docs_url: r.get(13)?,\n                install_count: r.get(14)?,\n                created_at: r.get(15)?,\n            })'
);

fs.writeFileSync('src-tauri/src/db.rs', db);
