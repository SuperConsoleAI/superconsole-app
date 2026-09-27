pub const SCHEMA_VERSION: &str = "2026-09-22a";

pub const CORE_MIGRATIONS: &[crate::db::schema::Migration] = &[
    crate::db::schema::Migration {
        id: "shop_item_variants_color_hex_v1",
        table: "shop_item_variants",
        sql: "ALTER TABLE shop_item_variants ADD COLUMN color_hex TEXT",
    },
    crate::db::schema::Migration {
        id: "agent_chat_sessions_cli_resume_ref_v1",
        table: "agent_chat_sessions",
        sql: "ALTER TABLE agent_chat_sessions ADD COLUMN cli_resume_ref TEXT",
    },
    crate::db::schema::Migration {
        id: "agent_chat_sessions_mode_v1",
        table: "agent_chat_sessions",
        sql: "ALTER TABLE agent_chat_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'hosted'",
    },
    crate::db::schema::Migration {
        id: "agent_chat_sessions_domain_v1",
        table: "agent_chat_sessions",
        sql: "ALTER TABLE agent_chat_sessions ADD COLUMN domain TEXT",
    },
    crate::db::schema::Migration {
        id: "agent_commands_v1",
        table: "agent_commands",
        sql: "CREATE TABLE IF NOT EXISTS agent_commands (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, name TEXT NOT NULL, slash TEXT NOT NULL, description TEXT, prompt_template TEXT, domain_tags TEXT NOT NULL DEFAULT '[]', required_tools TEXT NOT NULL DEFAULT '[]', is_builtin INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')))",
    },
];

