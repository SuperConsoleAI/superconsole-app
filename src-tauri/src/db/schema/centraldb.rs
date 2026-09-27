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
        name            TEXT,
        logo_url        TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_users_workos ON users (workos_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)"#,

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

    // ── connectors (Legacy compatibility mirror) ──────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS connectors (
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
    r#"CREATE INDEX IF NOT EXISTS idx_connectors_project ON connectors (project_id)"#,

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

    // ── project_session_history ───────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS project_session_history (
        id                  TEXT PRIMARY KEY,
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
    r#"CREATE INDEX IF NOT EXISTS idx_project_session_history_project ON project_session_history (project_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_session_history_session ON project_session_history (session_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_session_history_user ON project_session_history (user_id)"#,

    // ── project_chat_sessions ─────────────────────────────────────────────────
    // Metadata only: cost, token count, model, user attribution.
    // Raw chat message text is NEVER stored in Central DB (kept 100% local).
    r#"CREATE TABLE IF NOT EXISTS project_chat_sessions (
        id                  TEXT PRIMARY KEY,
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
    r#"CREATE INDEX IF NOT EXISTS idx_project_chat_sessions_project ON project_chat_sessions (project_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_chat_sessions_user ON project_chat_sessions (user_id)"#,

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
];
