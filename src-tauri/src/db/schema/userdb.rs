//! User Database (`userdb`) Schema Definitions & Provisioning
//!
//! This module defines the canonical schema used for user-scoped / private databases (`userdb`).
//! It mirrors the Central Cloud architecture while giving users full ownership and local
//! persistence of their private workflows, session history, chat transcripts, installed plugins,
//! and connectors.
//!
//! ## Off-Platform Isolation (`users.off_platform`)
//! - When `off_platform = 0` (default): Standard central cloud synchronization.
//! - When `off_platform = 1`: Sensitive connector credentials and secrets are kept strictly
//!   isolated in `userdb` / `localdb`. Only a stub metadata entry (with generated ULID and status)
//!   is dispatched to `centraldb` to guarantee identity synchronization across all distributed
//!   databases without exposing secrets off-platform.
//!
//! ## Public-Facing Profiles (`users` columns)
//! - `social`: JSON array of social links (`'[]'`)
//! - `is_active`: User account status (`1` = active, `0` = deactivated)
//! - `is_public`: Public profile discovery toggle (`0` = private by default)
//! - `bio`: Profile biography text
//! - `theme`: JSON array of user theme / styling preferences (`'[]'`)
//! - `show_team`: Toggle displaying team membership on public profile (`0` = hidden)
//! - `banner`: Profile banner image URL or asset path
//! - `show_projects`: Toggle displaying projects on public profile (`1` = visible by default)
//! - `show_usage`: Toggle displaying usage telemetry on public profile (`1` = visible by default)
//! - `off_platform`: Credential isolation toggle (`0` = cloud synced, `1` = local/userdb only)

use rusqlite::Connection;

/// All SQL DDL statements for creating the user database schema.
#[allow(dead_code)]
pub const USER_SCHEMA_STATEMENTS: &[&str] = &[
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
        image_url           TEXT,
        default_run_mode    TEXT NOT NULL DEFAULT 'cli',
        default_cli         TEXT NOT NULL DEFAULT 'claude',
        default_provider    TEXT NOT NULL DEFAULT 'anthropic',
        default_model       TEXT,
        script_setup        TEXT,
        script_run          TEXT,
        script_teardown     TEXT,
        script_auto_run     INTEGER NOT NULL DEFAULT 0,
        repo_url            TEXT,
        description         TEXT,
        tagline             TEXT,
        details             TEXT,
        slider              TEXT NOT NULL DEFAULT '[]',
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


    // ── project_agents ────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS project_agents (
        id              TEXT PRIMARY KEY,
        project_id      TEXT NOT NULL,
        name            TEXT NOT NULL,
        description     TEXT NOT NULL DEFAULT '',
        schedule        TEXT NOT NULL DEFAULT '',
        default_run_mode TEXT NOT NULL DEFAULT 'cli',
        default_cli     TEXT NOT NULL DEFAULT 'claude',
        default_provider TEXT NOT NULL DEFAULT 'anthropic',
        default_model   TEXT NOT NULL DEFAULT '',
        skills          TEXT NOT NULL DEFAULT '',
        connectors      TEXT NOT NULL DEFAULT '',
        is_active       INTEGER NOT NULL DEFAULT 1,
        author          TEXT NOT NULL DEFAULT '',
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(project_id, name)
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_agents_project ON project_agents (project_id)"#,

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

    // ── plugins ───────────────────────────────────────────────────────────────
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

    // ── installed_plugins ─────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS installed_plugins (
        id              TEXT PRIMARY KEY,
        plugin_id       TEXT NOT NULL,
        scope           TEXT NOT NULL,
        scope_id        TEXT NOT NULL,
        installed_at    TEXT NOT NULL DEFAULT (datetime('now')),
        installed_by    TEXT NOT NULL DEFAULT '',
        version         TEXT NOT NULL DEFAULT '1.0.0',
        skill_ids       TEXT NOT NULL DEFAULT '[]',
        agent_ids       TEXT NOT NULL DEFAULT '[]',
        mcp_ids         TEXT NOT NULL DEFAULT '[]',
        command_ids     TEXT NOT NULL DEFAULT '[]',
        hook_ids        TEXT NOT NULL DEFAULT '[]',
        rule_ids        TEXT NOT NULL DEFAULT '[]',
        connector_ids   TEXT NOT NULL DEFAULT '[]',
        rules_url       TEXT NOT NULL DEFAULT '[]',
        agents_url      TEXT NOT NULL DEFAULT '[]',
        skills_url      TEXT NOT NULL DEFAULT '[]',
        commands_url    TEXT NOT NULL DEFAULT '[]',
        hooks_url       TEXT NOT NULL DEFAULT '[]',
        mcp_url         TEXT NOT NULL DEFAULT '[]'
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_installed_plugins_scope ON installed_plugins (scope, scope_id)"#,

    // ── session_history ───────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS session_history (
        id                  TEXT PRIMARY KEY,
        workspace_id        TEXT,
        project_id          TEXT NOT NULL,
        session_id          TEXT NOT NULL,
        cli                 TEXT NOT NULL DEFAULT '',
        label               TEXT,
        job_id              TEXT,
        tokens_prompt       INTEGER NOT NULL DEFAULT 0,
        tokens_completion   INTEGER NOT NULL DEFAULT 0,
        tokens_reasoning    INTEGER NOT NULL DEFAULT 0,
        cost_usd            REAL NOT NULL DEFAULT 0,
        model               TEXT NOT NULL DEFAULT '',
        provider            TEXT NOT NULL DEFAULT '',
        last_output         TEXT NOT NULL DEFAULT '',
        agent_id            TEXT,
        user_id             TEXT,
        rate_prompt_per_1m  REAL NOT NULL DEFAULT 0,
        rate_cached_per_1m  REAL NOT NULL DEFAULT 0,
        rate_completion_per_1m REAL NOT NULL DEFAULT 0,
        rate_reasoning_per_1m REAL NOT NULL DEFAULT 0,
        machine_id          TEXT,
        started_at          TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at            TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_session_history_project ON session_history (project_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_session_history_session ON session_history (session_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_session_history_user ON session_history (user_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_session_history_ws ON session_history (workspace_id)"#,

    // ── chat_sessions ─────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS chat_sessions (
        id                  TEXT PRIMARY KEY,
        workspace_id        TEXT,
        project_id          TEXT NOT NULL,
        name                TEXT,
        is_star             INTEGER NOT NULL DEFAULT 0,
        tokens_prompt       INTEGER NOT NULL DEFAULT 0,
        tokens_completion   INTEGER NOT NULL DEFAULT 0,
        tokens_reasoning    INTEGER NOT NULL DEFAULT 0,
        cost_usd            REAL NOT NULL DEFAULT 0,
        model               TEXT NOT NULL DEFAULT '',
        provider            TEXT NOT NULL DEFAULT '',
        agent_id            TEXT,
        user_id             TEXT,
        rate_prompt_per_1m  REAL NOT NULL DEFAULT 0,
        rate_cached_per_1m  REAL NOT NULL DEFAULT 0,
        rate_completion_per_1m REAL NOT NULL DEFAULT 0,
        rate_reasoning_per_1m REAL NOT NULL DEFAULT 0,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_chat_sessions_project ON chat_sessions (project_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions (user_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_chat_sessions_ws ON chat_sessions (workspace_id)"#,

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

    // ── project_usage ─────────────────────────────────────────────────────────
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

    // ── env_vars (Unified Environment Variables across account, org, project) ─
    r#"CREATE TABLE IF NOT EXISTS env_vars (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        scope               TEXT NOT NULL CHECK (scope IN ('account', 'org', 'project')),
        scope_id            TEXT NOT NULL,
        key                 TEXT NOT NULL,
        value               TEXT NOT NULL,
        is_secret           INTEGER NOT NULL DEFAULT 0,
        user_id             TEXT,
        updated_by          TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (scope, scope_id, key)
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_env_vars_scope ON env_vars (scope, scope_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_env_vars_user ON env_vars (user_id)"#,
];

/// Provisions and initializes all canonical user database tables and indexes.
#[allow(dead_code)]
pub fn provision_user_database(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA foreign_keys = ON;").map_err(|e| e.to_string())?;

    // Pre-migrations: ensure new columns exist on pre-existing projects table
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN tagline TEXT", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN details TEXT", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN logo_url TEXT", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN image_url TEXT", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN slider TEXT NOT NULL DEFAULT '[]'", []);

    for stmt in USER_SCHEMA_STATEMENTS {
        conn.execute_batch(stmt)
            .map_err(|e| format!("User schema init error for statement: {}\nErr: {}", stmt, e))?;
    }

    Ok(())
}

#[allow(dead_code)]
/// Returns the canonical list of table names expected in the user database.
pub fn get_canonical_user_table_names() -> &'static [&'static str] {
    &[
        "users",
        "organizations",
        "org_members",
        "org_invitations",
        "projects",
        "project_members",
        "project_invitations",
        "account_llm_keys",
        "org_llm_keys",
        "project_llm_keys",
        "account_connectors",
        "org_connectors",
        "org_settings",
        "project_connectors",
        "project_agents",
        "agent_catalog",
        "skill_catalog",
        "rules_catalog",
        "plugins",
        "installed_plugins",
        "session_history",
        "chat_sessions",
        "mcp_catalog",
        "commands_catalog",
        "hooks_catalog",
        "connector_catalog",
        "project_usage",
        "org_usage",
        "account_usage",
        "user_usage",
        "env_vars",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_provision_user_database() {
        let conn = Connection::open_in_memory().unwrap();
        assert!(provision_user_database(&conn).is_ok());

        let tables = get_canonical_user_table_names();
        for table in tables {
            let exists: bool = conn
                .query_row(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            assert!(exists, "Canonical user table '{}' is missing from user database!", table);
        }

        // Verify that chat_messages and legacy connectors do NOT exist in userdb
        for excluded in &["chat_messages", "connectors"] {
            let exists: bool = conn
                .query_row(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [excluded],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            assert!(!exists, "Table '{}' should NOT exist in UserDB!", excluded);
        }

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

        // Verify projects columns specifically
        let mut prj_cols = conn.prepare("PRAGMA table_info(projects)").unwrap();
        let prj_col_names: Vec<String> = prj_cols
            .query_map([], |r| r.get(1))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(prj_col_names.contains(&"tagline".to_string()));
        assert!(prj_col_names.contains(&"details".to_string()));
        assert!(prj_col_names.contains(&"logo_url".to_string()));
        assert!(prj_col_names.contains(&"image_url".to_string()));
        assert!(prj_col_names.contains(&"slider".to_string()));

        // Insert a test user with public profile & off_platform configuration
        conn.execute(
            "INSERT INTO users (
                id, workos_id, email, name, logo_url, banner, bio, social, theme,
                is_active, is_public, show_team, show_projects, show_usage, off_platform
            ) VALUES (
                'user_01', 'workos_01', 'test@example.com', 'Alex Developer',
                'https://example.com/logo.png', 'https://example.com/banner.png',
                'Building the future with SuperConsole.', '[\"https://github.com/alex\"]',
                '[\"dark-amber\"]', 1, 1, 0, 1, 1, 1
            )",
            [],
        ).unwrap();

        let (off_platform, is_public, bio): (i64, i64, String) = conn
            .query_row(
                "SELECT off_platform, is_public, bio FROM users WHERE id = 'user_01'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();

        assert_eq!(off_platform, 1);
        assert_eq!(is_public, 1);
        assert_eq!(bio, "Building the future with SuperConsole.");
    }
}
