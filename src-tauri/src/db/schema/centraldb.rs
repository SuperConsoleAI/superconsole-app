//! Central (Cloud / Turso) Database Schema Definitions
//!
//! This module defines the canonical remote schema used in the SuperConsole
//! cloud backend (Turso SQLite / Cloudflare Worker / PostgreSQL compatible).
//!
//! Tables are organized with human-readable headers and structured column alignments.

/// All SQL statements needed to provision or initialize the Central Cloud database.
#[allow(dead_code)]
pub const CENTRAL_SCHEMA_STATEMENTS: &[&str] = &[
    // ── users ─────────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS users (
        id              TEXT PRIMARY KEY,
        workos_id       TEXT NOT NULL UNIQUE,
        email           TEXT NOT NULL UNIQUE,
        username        TEXT UNIQUE,
        full_name       TEXT,
        name            TEXT,
        avatar_url      TEXT,
        logo_url        TEXT,
        banner          TEXT,
        bio             TEXT,
        social          TEXT NOT NULL DEFAULT '[]',
        theme           TEXT NOT NULL DEFAULT '[]',
        is_active       INTEGER NOT NULL DEFAULT 1,
        is_public       INTEGER NOT NULL DEFAULT 0,
        show_team       INTEGER NOT NULL DEFAULT 0,
        show_projects   INTEGER NOT NULL DEFAULT 1,
        show_usage      INTEGER NOT NULL DEFAULT 1,
        off_platform    INTEGER NOT NULL DEFAULT 0,
        go_local        INTEGER NOT NULL DEFAULT 0,
        presets         TEXT NOT NULL DEFAULT '[]',
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_users_workos ON users (workos_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_users_public ON users (is_public, is_active)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_users_off_platform ON users (off_platform)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_users_go_local ON users (go_local)"#,

    // ── organizations ─────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS organizations (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        plan            TEXT NOT NULL DEFAULT 'free',
        owner_id        TEXT NOT NULL,
        logo_url        TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations (owner_id)"#,

    // ── org_members ───────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS org_members (
        org_id          TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        role            TEXT NOT NULL DEFAULT 'member',
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (org_id, user_id)
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members (user_id)"#,

    // ── org_invitations ───────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS org_invitations (
        id              TEXT PRIMARY KEY,
        org_id          TEXT NOT NULL,
        email           TEXT NOT NULL,
        role            TEXT NOT NULL DEFAULT 'member',
        token           TEXT NOT NULL UNIQUE,
        inviter_id      TEXT,
        status          TEXT NOT NULL DEFAULT 'pending',
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at      TEXT NOT NULL
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON org_invitations (email)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON org_invitations (org_id)"#,

    // ── projects ──────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS projects (
        id                  TEXT PRIMARY KEY,
        org_id              TEXT NOT NULL,
        name                TEXT NOT NULL,
        local_path_hint     TEXT,
        logo_url            TEXT,
        default_run_mode    TEXT NOT NULL DEFAULT 'cli',
        default_cli         TEXT NOT NULL DEFAULT 'claude',
        default_provider    TEXT NOT NULL DEFAULT 'anthropic',
        default_model       TEXT NOT NULL DEFAULT '',
        script_setup        TEXT NOT NULL DEFAULT '',
        script_run          TEXT NOT NULL DEFAULT '',
        script_teardown     TEXT NOT NULL DEFAULT '',
        script_auto_run     INTEGER NOT NULL DEFAULT 0,
        repo_url            TEXT NOT NULL DEFAULT '',
        description         TEXT NOT NULL DEFAULT '',
        is_active           INTEGER NOT NULL DEFAULT 1,
        is_public           INTEGER NOT NULL DEFAULT 0,
        show_usage          INTEGER NOT NULL DEFAULT 1,
        show_team           INTEGER NOT NULL DEFAULT 0,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_projects_org ON projects (org_id)"#,

    // ── project_members ───────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS project_members (
        project_id      TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        role            TEXT NOT NULL DEFAULT 'member',
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (project_id, user_id)
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members (user_id)"#,

    // ── project_invitations ───────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS project_invitations (
        id              TEXT PRIMARY KEY,
        project_id      TEXT NOT NULL,
        email           TEXT NOT NULL,
        role            TEXT NOT NULL DEFAULT 'member',
        token           TEXT NOT NULL UNIQUE,
        inviter_id      TEXT,
        status          TEXT NOT NULL DEFAULT 'pending',
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at      TEXT NOT NULL
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_invitations_email ON project_invitations (email)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_invitations_project ON project_invitations (project_id)"#,

    // ── account_llm_keys ──────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS account_llm_keys (
        user_id         TEXT NOT NULL,
        provider        TEXT NOT NULL,
        credentials_enc TEXT NOT NULL,
        base_url        TEXT,
        extra_env       TEXT,
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, provider)
    )"#,

    // ── org_llm_keys ──────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS org_llm_keys (
        org_id          TEXT NOT NULL,
        provider        TEXT NOT NULL,
        credentials_enc TEXT NOT NULL,
        base_url        TEXT,
        extra_env       TEXT,
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (org_id, provider)
    )"#,

    // ── project_llm_keys ──────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS project_llm_keys (
        project_id      TEXT NOT NULL,
        provider        TEXT NOT NULL,
        credentials_enc TEXT NOT NULL,
        base_url        TEXT,
        extra_env       TEXT,
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (project_id, provider)
    )"#,

    // ── account_connectors ────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS account_connectors (
        user_id         TEXT NOT NULL,
        service         TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'configured',
        credentials_enc TEXT,
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, service)
    )"#,

    // ── org_connectors ────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS org_connectors (
        org_id          TEXT NOT NULL,
        service         TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'configured',
        credentials_enc TEXT,
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (org_id, service)
    )"#,

    // ── org_settings ──────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS org_settings (
        org_id          TEXT NOT NULL,
        key             TEXT NOT NULL,
        value           TEXT,
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (org_id, key)
    )"#,

    // ── project_connectors (Project-scoped connectors) ────────────────────────
    r#"CREATE TABLE IF NOT EXISTS project_connectors (
        id                  TEXT PRIMARY KEY,
        project_id          TEXT NOT NULL,
        service             TEXT NOT NULL,
        credentials_encrypted TEXT,
        scope               TEXT NOT NULL DEFAULT 'project',
        status              TEXT NOT NULL DEFAULT 'disconnected',
        connected_by        TEXT,
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(project_id, service)
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_connectors_project ON project_connectors (project_id)"#,

    // ── agent_catalog ─────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS agent_catalog (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL UNIQUE,
        description     TEXT NOT NULL DEFAULT '',
        category        TEXT NOT NULL DEFAULT '',
        tags            TEXT NOT NULL DEFAULT '',
        author          TEXT NOT NULL DEFAULT '',
        stars           INTEGER NOT NULL DEFAULT 0,
        github_url      TEXT NOT NULL,
        readme          TEXT NOT NULL DEFAULT '',
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── skill_catalog ─────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS skill_catalog (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL UNIQUE,
        description     TEXT NOT NULL DEFAULT '',
        category        TEXT NOT NULL DEFAULT '',
        tags            TEXT NOT NULL DEFAULT '',
        github_url      TEXT NOT NULL,
        readme          TEXT NOT NULL DEFAULT '',
        author          TEXT NOT NULL DEFAULT '',
        stars           INTEGER NOT NULL DEFAULT 0,
        synced_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── rules_catalog ─────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS rules_catalog (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT NOT NULL DEFAULT '',
        category        TEXT NOT NULL DEFAULT '',
        author          TEXT NOT NULL DEFAULT '',
        framework       TEXT NOT NULL DEFAULT '',
        tags            TEXT NOT NULL DEFAULT '[]',
        github_url      TEXT NOT NULL DEFAULT '',
        content         TEXT NOT NULL DEFAULT '',
        install_count   INTEGER NOT NULL DEFAULT 0,
        featured        INTEGER NOT NULL DEFAULT 0
    )"#,

    // ── plugins (Turso Cloud table) ───────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS plugins (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL UNIQUE,
        description     TEXT NOT NULL DEFAULT '',
        author          TEXT NOT NULL DEFAULT '',
        version         TEXT NOT NULL DEFAULT '1.0.0',
        icon_url        TEXT NOT NULL DEFAULT '',
        docs_url        TEXT NOT NULL DEFAULT '',
        github_url      TEXT NOT NULL DEFAULT '',
        category        TEXT NOT NULL DEFAULT '',
        scope           TEXT NOT NULL DEFAULT 'project',
        skill_ids       TEXT NOT NULL DEFAULT '[]',
        agent_ids       TEXT NOT NULL DEFAULT '[]',
        agents_url      TEXT NOT NULL DEFAULT '[]',
        mcp_ids         TEXT NOT NULL DEFAULT '[]',
        command_ids     TEXT NOT NULL DEFAULT '[]',
        hook_ids        TEXT NOT NULL DEFAULT '[]',
        rule_ids        TEXT NOT NULL DEFAULT '[]',
        connector_ids   TEXT NOT NULL DEFAULT '[]',
        skills_url      TEXT NOT NULL DEFAULT '[]',
        commands_url    TEXT NOT NULL DEFAULT '[]',
        hooks_url       TEXT NOT NULL DEFAULT '[]',
        rules_url       TEXT NOT NULL DEFAULT '[]',
        connector_auth  TEXT NOT NULL DEFAULT '[]',
        featured        INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    // ── mcp_catalog ───────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS mcp_catalog (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL UNIQUE,
        description     TEXT NOT NULL DEFAULT '',
        author          TEXT NOT NULL DEFAULT '',
        category        TEXT NOT NULL DEFAULT '',
        type            TEXT NOT NULL DEFAULT '',
        url             TEXT NOT NULL DEFAULT '',
        command         TEXT NOT NULL DEFAULT '',
        args            TEXT NOT NULL DEFAULT '[]',
        env             TEXT NOT NULL DEFAULT '{}',
        required_env_vars TEXT NOT NULL DEFAULT '[]',
        github_url      TEXT NOT NULL DEFAULT '',
        content         TEXT NOT NULL DEFAULT '',
        icon_url        TEXT NOT NULL DEFAULT '',
        docs_url        TEXT NOT NULL DEFAULT '',
        install_count   INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── commands_catalog ──────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS commands_catalog (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        slash           TEXT NOT NULL UNIQUE,
        description     TEXT NOT NULL DEFAULT '',
        author          TEXT NOT NULL DEFAULT '',
        category        TEXT NOT NULL DEFAULT '',
        github_url      TEXT NOT NULL DEFAULT '',
        content         TEXT,
        icon_url        TEXT,
        install_count   INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── hooks_catalog ─────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS hooks_catalog (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL UNIQUE,
        description     TEXT NOT NULL DEFAULT '',
        author          TEXT NOT NULL DEFAULT '',
        hook_type       TEXT NOT NULL DEFAULT '',
        github_url      TEXT NOT NULL DEFAULT '',
        content         TEXT,
        icon_url        TEXT,
        install_count   INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── connector_catalog ─────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS connector_catalog (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL UNIQUE,
        description     TEXT NOT NULL DEFAULT '',
        category        TEXT NOT NULL DEFAULT '',
        auth_type       TEXT NOT NULL DEFAULT '',
        oauth_url       TEXT NOT NULL DEFAULT '',
        api_key_fields  TEXT NOT NULL DEFAULT '[]',
        docs_url        TEXT NOT NULL DEFAULT '',
        icon_url        TEXT NOT NULL DEFAULT '',
        scope           TEXT NOT NULL DEFAULT '',
        install_count   INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── project_usage ────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS project_usage (
        id                          TEXT PRIMARY KEY,
        tokens_prompt_lifetime      INTEGER NOT NULL DEFAULT 0,
        tokens_prompt_cached_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_completion_lifetime  INTEGER NOT NULL DEFAULT 0,
        tokens_reasoning_lifetime   INTEGER NOT NULL DEFAULT 0,
        cost_lifetime_usd           REAL NOT NULL DEFAULT 0,
        sessions_lifetime           INTEGER NOT NULL DEFAULT 0,
        cache_hits_lifetime         INTEGER NOT NULL DEFAULT 0,
        analytics_lifetime          TEXT NOT NULL DEFAULT '{}',
        usage_24h                   TEXT NOT NULL DEFAULT '[]',
        usage_7d                    TEXT NOT NULL DEFAULT '[]',
        usage_30d                   TEXT NOT NULL DEFAULT '[]',
        usage_12m                   TEXT NOT NULL DEFAULT '[]',
        by_model                    TEXT NOT NULL DEFAULT '{}',
        by_provider                 TEXT NOT NULL DEFAULT '{}',
        by_cli                      TEXT NOT NULL DEFAULT '{}',
        by_member                   TEXT NOT NULL DEFAULT '{}',
        by_project                  TEXT NOT NULL DEFAULT '{}',
        by_org                      TEXT NOT NULL DEFAULT '{}',
        heatmap_365d                TEXT NOT NULL DEFAULT '{}',
        updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── org_usage ─────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS org_usage (
        id                          TEXT PRIMARY KEY,
        tokens_prompt_lifetime      INTEGER NOT NULL DEFAULT 0,
        tokens_prompt_cached_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_completion_lifetime  INTEGER NOT NULL DEFAULT 0,
        tokens_reasoning_lifetime   INTEGER NOT NULL DEFAULT 0,
        cost_lifetime_usd           REAL NOT NULL DEFAULT 0,
        sessions_lifetime           INTEGER NOT NULL DEFAULT 0,
        cache_hits_lifetime         INTEGER NOT NULL DEFAULT 0,
        analytics_lifetime          TEXT NOT NULL DEFAULT '{}',
        usage_24h                   TEXT NOT NULL DEFAULT '[]',
        usage_7d                    TEXT NOT NULL DEFAULT '[]',
        usage_30d                   TEXT NOT NULL DEFAULT '[]',
        usage_12m                   TEXT NOT NULL DEFAULT '[]',
        by_model                    TEXT NOT NULL DEFAULT '{}',
        by_provider                 TEXT NOT NULL DEFAULT '{}',
        by_cli                      TEXT NOT NULL DEFAULT '{}',
        by_member                   TEXT NOT NULL DEFAULT '{}',
        by_project                  TEXT NOT NULL DEFAULT '{}',
        by_org                      TEXT NOT NULL DEFAULT '{}',
        heatmap_365d                TEXT NOT NULL DEFAULT '{}',
        updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── account_usage / user_usage ────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS account_usage (
        id                          TEXT PRIMARY KEY,
        tokens_prompt_lifetime      INTEGER NOT NULL DEFAULT 0,
        tokens_prompt_cached_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_completion_lifetime  INTEGER NOT NULL DEFAULT 0,
        tokens_reasoning_lifetime   INTEGER NOT NULL DEFAULT 0,
        cost_lifetime_usd           REAL NOT NULL DEFAULT 0,
        sessions_lifetime           INTEGER NOT NULL DEFAULT 0,
        cache_hits_lifetime         INTEGER NOT NULL DEFAULT 0,
        analytics_lifetime          TEXT NOT NULL DEFAULT '{}',
        usage_24h                   TEXT NOT NULL DEFAULT '[]',
        usage_7d                    TEXT NOT NULL DEFAULT '[]',
        usage_30d                   TEXT NOT NULL DEFAULT '[]',
        usage_12m                   TEXT NOT NULL DEFAULT '[]',
        by_model                    TEXT NOT NULL DEFAULT '{}',
        by_provider                 TEXT NOT NULL DEFAULT '{}',
        by_cli                      TEXT NOT NULL DEFAULT '{}',
        by_member                   TEXT NOT NULL DEFAULT '{}',
        by_project                  TEXT NOT NULL DEFAULT '{}',
        by_org                      TEXT NOT NULL DEFAULT '{}',
        heatmap_365d                TEXT NOT NULL DEFAULT '{}',
        updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    r#"CREATE TABLE IF NOT EXISTS user_usage (
        id                          TEXT PRIMARY KEY,
        tokens_prompt_lifetime      INTEGER NOT NULL DEFAULT 0,
        tokens_prompt_cached_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_completion_lifetime  INTEGER NOT NULL DEFAULT 0,
        tokens_reasoning_lifetime   INTEGER NOT NULL DEFAULT 0,
        cost_lifetime_usd           REAL NOT NULL DEFAULT 0,
        sessions_lifetime           INTEGER NOT NULL DEFAULT 0,
        cache_hits_lifetime         INTEGER NOT NULL DEFAULT 0,
        analytics_lifetime          TEXT NOT NULL DEFAULT '{}',
        usage_24h                   TEXT NOT NULL DEFAULT '[]',
        usage_7d                    TEXT NOT NULL DEFAULT '[]',
        usage_30d                   TEXT NOT NULL DEFAULT '[]',
        usage_12m                   TEXT NOT NULL DEFAULT '[]',
        by_model                    TEXT NOT NULL DEFAULT '{}',
        by_provider                 TEXT NOT NULL DEFAULT '{}',
        by_cli                      TEXT NOT NULL DEFAULT '{}',
        by_member                   TEXT NOT NULL DEFAULT '{}',
        by_project                  TEXT NOT NULL DEFAULT '{}',
        by_org                      TEXT NOT NULL DEFAULT '{}',
        heatmap_365d                TEXT NOT NULL DEFAULT '{}',
        updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── userdb (Account-wide UserDB configuration) ─────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS userdb (
        user_id             TEXT PRIMARY KEY,
        url                 TEXT NOT NULL DEFAULT '',
        token_encrypted     TEXT NOT NULL DEFAULT '',
        off_platform        INTEGER NOT NULL DEFAULT 0,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_userdb_user ON userdb (user_id)"#,
];

/// Provisions and initializes all canonical Central Cloud tables and indexes on SQLite / Turso.
#[allow(dead_code)]
pub fn provision_central_database(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA foreign_keys = ON;").map_err(|e| e.to_string())?;

    for stmt in CENTRAL_SCHEMA_STATEMENTS {
        conn.execute_batch(stmt)
            .map_err(|e| format!("Central schema init error for statement: {}\nErr: {}", stmt, e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_provision_central_database() {
        let conn = Connection::open_in_memory().unwrap();
        assert!(provision_central_database(&conn).is_ok());

        // Verify users columns specifically
        let mut user_cols = conn.prepare("PRAGMA table_info(users)").unwrap();
        let cols: Vec<String> = user_cols
            .query_map([], |r| r.get(1))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(cols.contains(&"off_platform".to_string()));
        assert!(cols.contains(&"go_local".to_string()));
        assert!(cols.contains(&"presets".to_string()));
        assert!(cols.contains(&"social".to_string()));
        assert!(cols.contains(&"is_active".to_string()));
        assert!(cols.contains(&"is_public".to_string()));
        assert!(cols.contains(&"bio".to_string()));
        assert!(cols.contains(&"theme".to_string()));
        assert!(cols.contains(&"show_team".to_string()));
        assert!(cols.contains(&"banner".to_string()));
        assert!(cols.contains(&"show_projects".to_string()));
        assert!(cols.contains(&"show_usage".to_string()));
    }

    #[test]
    fn test_centraldb_does_not_contain_removed_tables() {
        let conn = Connection::open_in_memory().unwrap();
        assert!(provision_central_database(&conn).is_ok());

        // Removed tables that belong only in localdb and userdb
        let removed_tables = [
            "installed_plugins",
            "session_history",
            "chat_sessions",
            "project_session_history",
            "project_chat_sessions",
            "project_agents",
            "connectors",
            "chat_messages",
        ];
        for t in removed_tables {
            let exists: bool = conn
                .query_row(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [t],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            assert!(!exists, "Table '{}' should NOT exist in CentralDB!", t);
        }

        // Only the 4 canonical usage tables belong in centraldb
        let usage_tables = [
            "project_usage",
            "org_usage",
            "account_usage",
            "user_usage",
        ];
        for t in usage_tables {
            let exists: bool = conn
                .query_row(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [t],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            assert!(exists, "Usage table '{}' MUST exist in CentralDB!", t);
        }
    }

    #[test]
    fn test_centraldb_contains_userdb_table() {
        let conn = Connection::open_in_memory().unwrap();
        assert!(provision_central_database(&conn).is_ok());

        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'userdb'",
                [],
                |_| Ok(true),
            )
            .unwrap_or(false);
        assert!(exists, "userdb table MUST exist in CentralDB!");

        let mut userdb_cols = conn.prepare("PRAGMA table_info(userdb)").unwrap();
        let cols: Vec<String> = userdb_cols
            .query_map([], |r| r.get(1))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(cols.contains(&"user_id".to_string()));
        assert!(cols.contains(&"url".to_string()));
        assert!(cols.contains(&"token_encrypted".to_string()));
        assert!(cols.contains(&"off_platform".to_string()));
    }
}
