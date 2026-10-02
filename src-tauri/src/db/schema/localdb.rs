//! Local SQLite Database Schema Definitions & Provisioning
//!
//! This module defines the canonical local schema used in the SuperConsole
//! desktop application (`superconsole.db`).
//!
//! Tables and indexes are structured for human readability and fast provisioning.

use rusqlite::Connection;

/// All SQL DDL statements for creating the local SQLite schema.
pub const LOCAL_SCHEMA_STATEMENTS: &[&str] = &[
    // ── workspaces ────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS workspaces (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        name                TEXT NOT NULL,
        path                TEXT NOT NULL UNIQUE,
        cli                 TEXT NOT NULL DEFAULT 'claude',
        organization_id     INTEGER NOT NULL DEFAULT 1,
        org_id              TEXT,
        project_id          TEXT,
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
        env_files           TEXT NOT NULL DEFAULT '[]',
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── organizations ─────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS organizations (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id              TEXT,
        name                TEXT NOT NULL UNIQUE,
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── jobs ──────────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS jobs (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id        INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name                TEXT NOT NULL,
        command             TEXT NOT NULL,
        schedule            TEXT NOT NULL,
        enabled             INTEGER NOT NULL DEFAULT 1,
        last_run            TEXT,
        next_run            TEXT,
        run_mode            TEXT NOT NULL DEFAULT 'cli',
        run_config          TEXT NOT NULL DEFAULT '{}',
        trigger_type        TEXT NOT NULL DEFAULT 'cron',
        trigger_config      TEXT NOT NULL DEFAULT '{}',
        allowed_connectors  TEXT NOT NULL DEFAULT '[]',
        last_run_cost_usd   REAL NOT NULL DEFAULT 0,
        last_run_tokens     INTEGER NOT NULL DEFAULT 0,
        last_run_session_id TEXT,
        agent_id            TEXT,
        user_id             TEXT,
        exit_condition      TEXT,
        max_attempts        INTEGER NOT NULL DEFAULT 1,
        current_attempt     INTEGER NOT NULL DEFAULT 0
    )"#,

    // ── session_history ───────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS session_history (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id        INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id          TEXT,
        session_id          TEXT NOT NULL,
        cli                 TEXT NOT NULL,
        label               TEXT,
        job_id              INTEGER,
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
        started_at          TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at            TEXT
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_session_history_ws ON session_history (workspace_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_session_history_session ON session_history (session_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_session_history_user ON session_history (user_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_session_history_project ON session_history (project_id)"#,

    // ── settings ──────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS settings (
        key                 TEXT PRIMARY KEY,
        value               TEXT NOT NULL
    )"#,

    // ── cloud_identity ────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS cloud_identity (
        id                  INTEGER PRIMARY KEY CHECK (id = 1),
        payload             TEXT NOT NULL
    )"#,

    // ── inbox ─────────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS inbox (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id        INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        job_id              INTEGER,
        title               TEXT NOT NULL,
        output              TEXT NOT NULL,
        status              TEXT NOT NULL DEFAULT 'unread',
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── chat_messages ─────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS chat_messages (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id          TEXT NOT NULL,
        session_id          TEXT,
        role                TEXT NOT NULL,
        content             TEXT NOT NULL,
        provider            TEXT,
        model               TEXT,
        user_id             TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_chat_messages_project ON chat_messages (project_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages (user_id)"#,

    // ── chat_threads (Legacy compatibility) ───────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS chat_threads (
        project_id          TEXT PRIMARY KEY,
        name                TEXT,
        is_star             INTEGER NOT NULL DEFAULT 0,
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── chat_sessions ─────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS chat_sessions (
        id                  TEXT PRIMARY KEY,
        workspace_id        INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id          TEXT NOT NULL,
        name                TEXT,
        is_star             INTEGER NOT NULL DEFAULT 0,
        job_id              INTEGER,
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

    // ── agents ────────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS agents (
        id                  TEXT PRIMARY KEY,
        workspace_id        INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name                TEXT NOT NULL,
        description         TEXT NOT NULL DEFAULT '',
        schedule            TEXT NOT NULL DEFAULT '',
        default_run_mode    TEXT NOT NULL DEFAULT 'cli',
        default_cli         TEXT NOT NULL DEFAULT 'claude',
        default_provider    TEXT NOT NULL DEFAULT 'anthropic',
        default_model       TEXT NOT NULL DEFAULT '',
        skills              TEXT NOT NULL DEFAULT '',
        connectors          TEXT NOT NULL DEFAULT '',
        is_active           INTEGER NOT NULL DEFAULT 1,
        agent_id            TEXT,
        agent_catalog_id    TEXT,
        author              TEXT NOT NULL DEFAULT '',
        last_run            TEXT,
        next_run            TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(workspace_id, name)
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents (workspace_id)"#,

    // ── project_agents ────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS project_agents (
        id                  TEXT PRIMARY KEY,
        project_id          TEXT NOT NULL,
        name                TEXT NOT NULL,
        description         TEXT NOT NULL DEFAULT '',
        schedule            TEXT NOT NULL DEFAULT '',
        default_run_mode    TEXT NOT NULL DEFAULT 'cli',
        default_cli         TEXT NOT NULL DEFAULT 'claude',
        default_provider    TEXT NOT NULL DEFAULT 'anthropic',
        default_model       TEXT NOT NULL DEFAULT '',
        skills              TEXT NOT NULL DEFAULT '',
        connectors          TEXT NOT NULL DEFAULT '',
        is_active           INTEGER NOT NULL DEFAULT 1,
        agent_catalog_id    TEXT,
        author              TEXT NOT NULL DEFAULT '',
        last_run            TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(project_id, name)
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_agents_project ON project_agents (project_id)"#,

    // ── project_session_logs (Project scope .superconsole/sessions/ metadata) ──
    r#"CREATE TABLE IF NOT EXISTS project_session_logs (
        id                  TEXT PRIMARY KEY,
        workspace_id        INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        file_path           TEXT NOT NULL,
        agent_id            TEXT,
        session_id          TEXT,
        date                TEXT NOT NULL,
        agent_name          TEXT NOT NULL DEFAULT '',
        model               TEXT NOT NULL DEFAULT '',
        cost_usd            REAL NOT NULL DEFAULT 0,
        tokens              INTEGER NOT NULL DEFAULT 0,
        summary             TEXT NOT NULL DEFAULT '',
        cloud_id            TEXT,
        project_id          TEXT,
        user_id             TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_session_logs_ws ON project_session_logs (workspace_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_session_logs_project ON project_session_logs (project_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_session_logs_agent ON project_session_logs (agent_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_session_logs_user ON project_session_logs (user_id)"#,

    // ── org_session_logs (Org scope shared session logs) ──────────────────────
    r#"CREATE TABLE IF NOT EXISTS org_session_logs (
        id                  TEXT PRIMARY KEY,
        org_id              TEXT NOT NULL,
        project_id          TEXT,
        session_id          TEXT,
        date                TEXT NOT NULL,
        agent_name          TEXT NOT NULL DEFAULT '',
        model               TEXT NOT NULL DEFAULT '',
        cost_usd            REAL NOT NULL DEFAULT 0,
        tokens              INTEGER NOT NULL DEFAULT 0,
        summary             TEXT NOT NULL DEFAULT '',
        user_id             TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_org_session_logs_org ON org_session_logs (org_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_org_session_logs_user ON org_session_logs (user_id)"#,

    // ── session_logs (Account / User scope saved session logs) ────────────────
    r#"CREATE TABLE IF NOT EXISTS session_logs (
        id                  TEXT PRIMARY KEY,
        workspace_id        INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id             TEXT,
        file_path           TEXT NOT NULL,
        agent_id            TEXT,
        session_id          TEXT,
        date                TEXT NOT NULL,
        agent_name          TEXT NOT NULL DEFAULT '',
        model               TEXT NOT NULL DEFAULT '',
        cost_usd            REAL NOT NULL DEFAULT 0,
        tokens              INTEGER NOT NULL DEFAULT 0,
        summary             TEXT NOT NULL DEFAULT '',
        cloud_id            TEXT,
        project_id          TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_session_logs_ws ON session_logs (workspace_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_session_logs_project ON session_logs (project_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_session_logs_agent ON session_logs (agent_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_session_logs_user ON session_logs (user_id)"#,

    // ── project_skills ────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS project_skills (
        workspace_id        INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name                TEXT NOT NULL,
        description         TEXT NOT NULL DEFAULT '',
        tags                TEXT NOT NULL DEFAULT '',
        file_path           TEXT NOT NULL DEFAULT '',
        scope               TEXT NOT NULL DEFAULT 'project',
        active              INTEGER NOT NULL DEFAULT 1,
        auto                INTEGER NOT NULL DEFAULT 0,
        version             INTEGER NOT NULL DEFAULT 1,
        source              TEXT NOT NULL DEFAULT 'superconsole',
        author              TEXT NOT NULL DEFAULT '',
        skill_catalog_id    TEXT,
        project_id          TEXT,
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (workspace_id, name)
    )"#,

    // ── org_skills ────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS org_skills (
        org_id              TEXT NOT NULL,
        skill_name          TEXT NOT NULL,
        tags                TEXT,
        skill_catalog_id    TEXT,
        author              TEXT NOT NULL DEFAULT '',
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (org_id, skill_name)
    )"#,

    // ── skills (Account / Global scope) ───────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS skills (
        user_id             TEXT NOT NULL,
        name                TEXT NOT NULL,
        description         TEXT NOT NULL DEFAULT '',
        tags                TEXT NOT NULL DEFAULT '',
        file_path           TEXT NOT NULL DEFAULT '',
        active              INTEGER NOT NULL DEFAULT 1,
        author              TEXT NOT NULL DEFAULT '',
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, name)
    )"#,

    // ── skill_catalog ─────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS skill_catalog (
        id                  TEXT PRIMARY KEY,
        name                TEXT NOT NULL UNIQUE,
        description         TEXT NOT NULL DEFAULT '',
        category            TEXT NOT NULL DEFAULT '',
        tags                TEXT NOT NULL DEFAULT '',
        github_url          TEXT NOT NULL,
        readme              TEXT NOT NULL DEFAULT '',
        author              TEXT NOT NULL DEFAULT '',
        stars               INTEGER NOT NULL DEFAULT 0,
        synced_at           TEXT NOT NULL
    )"#,

    // ── project_memory (Local .superconsole/memory/ metadata) ─────────────────
    r#"CREATE TABLE IF NOT EXISTS project_memory (
        workspace_id        INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        category            TEXT NOT NULL,
        slug                TEXT NOT NULL,
        title               TEXT NOT NULL DEFAULT '',
        summary             TEXT NOT NULL DEFAULT '',
        tags                TEXT NOT NULL DEFAULT '',
        file_path           TEXT NOT NULL DEFAULT '',
        project_id          TEXT,
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (workspace_id, category, slug)
    )"#,

    // ── org_memory (Org shared facts/memory) ──────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS org_memory (
        org_id              TEXT NOT NULL,
        slug                TEXT NOT NULL,
        title               TEXT NOT NULL DEFAULT '',
        body                TEXT NOT NULL DEFAULT '',
        tags                TEXT,
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (org_id, slug)
    )"#,

    // ── memory (Account / User memory) ────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS memory (
        user_id             TEXT NOT NULL,
        category            TEXT NOT NULL,
        slug                TEXT NOT NULL,
        title               TEXT NOT NULL DEFAULT '',
        summary             TEXT NOT NULL DEFAULT '',
        tags                TEXT NOT NULL DEFAULT '',
        file_path           TEXT NOT NULL DEFAULT '',
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, category, slug)
    )"#,

    // ── project_wiki (Local .superconsole/wiki/ metadata) ─────────────────────
    r#"CREATE TABLE IF NOT EXISTS project_wiki (
        workspace_id        INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        slug                TEXT NOT NULL,
        title               TEXT NOT NULL DEFAULT '',
        summary             TEXT NOT NULL DEFAULT '',
        tags                TEXT NOT NULL DEFAULT '',
        file_path           TEXT NOT NULL DEFAULT '',
        project_id          TEXT,
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (workspace_id, slug)
    )"#,

    // ── org_wiki (Org documentation) ──────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS org_wiki (
        org_id              TEXT NOT NULL,
        slug                TEXT NOT NULL,
        title               TEXT NOT NULL DEFAULT '',
        body                TEXT NOT NULL DEFAULT '',
        tags                TEXT,
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (org_id, slug)
    )"#,

    // ── wiki (Account / User wiki) ────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS wiki (
        user_id             TEXT NOT NULL,
        slug                TEXT NOT NULL,
        title               TEXT NOT NULL DEFAULT '',
        summary             TEXT NOT NULL DEFAULT '',
        tags                TEXT NOT NULL DEFAULT '',
        file_path           TEXT NOT NULL DEFAULT '',
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, slug)
    )"#,

    // ── project_context (Local .superconsole/context/ metadata) ───────────────
    r#"CREATE TABLE IF NOT EXISTS project_context (
        workspace_id        INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name                TEXT NOT NULL,
        slug                TEXT NOT NULL,
        file_path           TEXT NOT NULL DEFAULT '',
        summary             TEXT NOT NULL DEFAULT '',
        size_bytes          INTEGER NOT NULL DEFAULT 0,
        project_id          TEXT,
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (workspace_id, slug)
    )"#,

    // ── org_context (Org shared context / guidelines) ─────────────────────────
    r#"CREATE TABLE IF NOT EXISTS org_context (
        org_id              TEXT NOT NULL,
        name                TEXT NOT NULL,
        slug                TEXT NOT NULL,
        content             TEXT NOT NULL DEFAULT '',
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (org_id, slug)
    )"#,

    // ── context (Account / User context) ──────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS context (
        user_id             TEXT NOT NULL,
        name                TEXT NOT NULL,
        slug                TEXT NOT NULL,
        file_path           TEXT NOT NULL DEFAULT '',
        summary             TEXT NOT NULL DEFAULT '',
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, slug)
    )"#,

    // ── usage_events ──────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS usage_events (
        id                  TEXT PRIMARY KEY,
        project_id          TEXT NOT NULL,
        org_id              TEXT,
        user_id             TEXT,
        session_id          TEXT,
        model               TEXT,
        provider            TEXT,
        cli                 TEXT,
        tokens_prompt       INTEGER NOT NULL DEFAULT 0,
        tokens_prompt_cached INTEGER NOT NULL DEFAULT 0,
        tokens_completion   INTEGER NOT NULL DEFAULT 0,
        tokens_reasoning    INTEGER NOT NULL DEFAULT 0,
        cost_usd            REAL NOT NULL DEFAULT 0,
        cache_hit_rate      REAL NOT NULL DEFAULT 0,
        estimated           INTEGER NOT NULL DEFAULT 0,
        synced              INTEGER NOT NULL DEFAULT 0,
        rate_prompt_per_1m  REAL NOT NULL DEFAULT 0,
        rate_cached_per_1m  REAL NOT NULL DEFAULT 0,
        rate_completion_per_1m REAL NOT NULL DEFAULT 0,
        rate_reasoning_per_1m REAL NOT NULL DEFAULT 0,
        started_at          TEXT,
        ended_at            TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_usage_events_project ON usage_events (project_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_usage_events_user ON usage_events (user_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_usage_events_session ON usage_events (session_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_usage_events_synced ON usage_events (synced)"#,

    // ── project_usage ─────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS project_usage (
        id                  TEXT PRIMARY KEY,
        tokens_prompt_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_prompt_cached_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_completion_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_reasoning_lifetime INTEGER NOT NULL DEFAULT 0,
        cost_lifetime_usd   REAL NOT NULL DEFAULT 0,
        sessions_lifetime   INTEGER NOT NULL DEFAULT 0,
        cache_hits_lifetime INTEGER NOT NULL DEFAULT 0,
        analytics_lifetime  TEXT NOT NULL DEFAULT '{}',
        usage_24h           TEXT NOT NULL DEFAULT '[]',
        usage_7d            TEXT NOT NULL DEFAULT '[]',
        usage_30d           TEXT NOT NULL DEFAULT '[]',
        usage_12m           TEXT NOT NULL DEFAULT '[]',
        by_model            TEXT NOT NULL DEFAULT '{}',
        by_provider         TEXT NOT NULL DEFAULT '{}',
        by_cli              TEXT NOT NULL DEFAULT '{}',
        by_member           TEXT NOT NULL DEFAULT '{}',
        by_project          TEXT NOT NULL DEFAULT '{}',
        by_org              TEXT NOT NULL DEFAULT '{}',
        heatmap_365d        TEXT NOT NULL DEFAULT '{}',
        last_synced_at      TEXT,
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── org_usage ─────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS org_usage (
        id                  TEXT PRIMARY KEY,
        tokens_prompt_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_prompt_cached_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_completion_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_reasoning_lifetime INTEGER NOT NULL DEFAULT 0,
        cost_lifetime_usd   REAL NOT NULL DEFAULT 0,
        sessions_lifetime   INTEGER NOT NULL DEFAULT 0,
        cache_hits_lifetime INTEGER NOT NULL DEFAULT 0,
        analytics_lifetime  TEXT NOT NULL DEFAULT '{}',
        usage_24h           TEXT NOT NULL DEFAULT '[]',
        usage_7d            TEXT NOT NULL DEFAULT '[]',
        usage_30d           TEXT NOT NULL DEFAULT '[]',
        usage_12m           TEXT NOT NULL DEFAULT '[]',
        by_model            TEXT NOT NULL DEFAULT '{}',
        by_provider         TEXT NOT NULL DEFAULT '{}',
        by_cli              TEXT NOT NULL DEFAULT '{}',
        by_member           TEXT NOT NULL DEFAULT '{}',
        by_project          TEXT NOT NULL DEFAULT '{}',
        by_org              TEXT NOT NULL DEFAULT '{}',
        heatmap_365d        TEXT NOT NULL DEFAULT '{}',
        last_synced_at      TEXT,
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── account_usage / user_usage ───────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS account_usage (
        id                  TEXT PRIMARY KEY,
        tokens_prompt_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_prompt_cached_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_completion_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_reasoning_lifetime INTEGER NOT NULL DEFAULT 0,
        cost_lifetime_usd   REAL NOT NULL DEFAULT 0,
        sessions_lifetime   INTEGER NOT NULL DEFAULT 0,
        cache_hits_lifetime INTEGER NOT NULL DEFAULT 0,
        analytics_lifetime  TEXT NOT NULL DEFAULT '{}',
        usage_24h           TEXT NOT NULL DEFAULT '[]',
        usage_7d            TEXT NOT NULL DEFAULT '[]',
        usage_30d           TEXT NOT NULL DEFAULT '[]',
        usage_12m           TEXT NOT NULL DEFAULT '[]',
        by_model            TEXT NOT NULL DEFAULT '{}',
        by_provider         TEXT NOT NULL DEFAULT '{}',
        by_cli              TEXT NOT NULL DEFAULT '{}',
        by_member           TEXT NOT NULL DEFAULT '{}',
        by_project          TEXT NOT NULL DEFAULT '{}',
        by_org              TEXT NOT NULL DEFAULT '{}',
        heatmap_365d        TEXT NOT NULL DEFAULT '{}',
        last_synced_at      TEXT,
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    r#"CREATE TABLE IF NOT EXISTS user_usage (
        id                  TEXT PRIMARY KEY,
        tokens_prompt_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_prompt_cached_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_completion_lifetime INTEGER NOT NULL DEFAULT 0,
        tokens_reasoning_lifetime INTEGER NOT NULL DEFAULT 0,
        cost_lifetime_usd   REAL NOT NULL DEFAULT 0,
        sessions_lifetime   INTEGER NOT NULL DEFAULT 0,
        cache_hits_lifetime INTEGER NOT NULL DEFAULT 0,
        analytics_lifetime  TEXT NOT NULL DEFAULT '{}',
        usage_24h           TEXT NOT NULL DEFAULT '[]',
        usage_7d            TEXT NOT NULL DEFAULT '[]',
        usage_30d           TEXT NOT NULL DEFAULT '[]',
        usage_12m           TEXT NOT NULL DEFAULT '[]',
        by_model            TEXT NOT NULL DEFAULT '{}',
        by_provider         TEXT NOT NULL DEFAULT '{}',
        by_cli              TEXT NOT NULL DEFAULT '{}',
        by_member           TEXT NOT NULL DEFAULT '{}',
        by_project          TEXT NOT NULL DEFAULT '{}',
        by_org              TEXT NOT NULL DEFAULT '{}',
        heatmap_365d        TEXT NOT NULL DEFAULT '{}',
        last_synced_at      TEXT,
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── model_pricing_cache ───────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS model_pricing_cache (
        model_id            TEXT PRIMARY KEY,
        provider            TEXT NOT NULL DEFAULT '',
        prompt_per_1m       REAL NOT NULL DEFAULT 0,
        cached_per_1m       REAL NOT NULL DEFAULT 0,
        completion_per_1m   REAL NOT NULL DEFAULT 0,
        reasoning_per_1m    REAL NOT NULL DEFAULT 0,
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── installed_plugins ─────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS installed_plugins (
        id                  TEXT PRIMARY KEY,
        plugin_id           TEXT NOT NULL,
        scope               TEXT NOT NULL,
        scope_id            TEXT NOT NULL,
        installed_at        TEXT NOT NULL DEFAULT (datetime('now')),
        installed_by        TEXT NOT NULL DEFAULT '',
        version             TEXT NOT NULL DEFAULT '1.0.0',
        skills_url          TEXT NOT NULL DEFAULT '[]',
        commands_url        TEXT NOT NULL DEFAULT '[]',
        agents_url          TEXT NOT NULL DEFAULT '[]',
        hooks_url           TEXT NOT NULL DEFAULT '[]',
        rules_url           TEXT NOT NULL DEFAULT '[]',
        mcp_url             TEXT NOT NULL DEFAULT '[]',
        skill_ids           TEXT NOT NULL DEFAULT '[]',
        agent_ids           TEXT NOT NULL DEFAULT '[]',
        mcp_ids             TEXT NOT NULL DEFAULT '[]',
        command_ids         TEXT NOT NULL DEFAULT '[]',
        hook_ids            TEXT NOT NULL DEFAULT '[]',
        rule_ids            TEXT NOT NULL DEFAULT '[]',
        connector_ids       TEXT NOT NULL DEFAULT '[]'
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_installed_plugins_scope ON installed_plugins (scope, scope_id)"#,

    // ── plugins (Turso Cloud & Local canonical table) ─────────────────────────
    r#"CREATE TABLE IF NOT EXISTS plugins (
        id                  TEXT PRIMARY KEY,
        name                TEXT NOT NULL UNIQUE,
        description         TEXT NOT NULL DEFAULT '',
        author              TEXT NOT NULL DEFAULT '',
        version             TEXT NOT NULL DEFAULT '1.0.0',
        icon_url            TEXT NOT NULL DEFAULT '',
        docs_url            TEXT NOT NULL DEFAULT '',
        github_url          TEXT NOT NULL DEFAULT '',
        category            TEXT NOT NULL DEFAULT '',
        scope               TEXT NOT NULL DEFAULT 'project',
        skill_ids           TEXT NOT NULL DEFAULT '[]',
        agent_ids           TEXT NOT NULL DEFAULT '[]',
        agents_url          TEXT NOT NULL DEFAULT '[]',
        mcp_ids             TEXT NOT NULL DEFAULT '[]',
        command_ids         TEXT NOT NULL DEFAULT '[]',
        hook_ids            TEXT NOT NULL DEFAULT '[]',
        rule_ids            TEXT NOT NULL DEFAULT '[]',
        connector_ids       TEXT NOT NULL DEFAULT '[]',
        skills_url          TEXT NOT NULL DEFAULT '[]',
        commands_url        TEXT NOT NULL DEFAULT '[]',
        hooks_url           TEXT NOT NULL DEFAULT '[]',
        mcp_url             TEXT NOT NULL DEFAULT '[]',
        rules_url           TEXT NOT NULL DEFAULT '[]',
        connector_auth      TEXT NOT NULL DEFAULT '[]',
        featured            INTEGER NOT NULL DEFAULT 0,
        synced_at           TEXT NOT NULL DEFAULT (datetime('now')),
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,

    // ── rules_catalog ─────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS rules_catalog (
        id                  TEXT PRIMARY KEY,
        name                TEXT NOT NULL,
        description         TEXT NOT NULL DEFAULT '',
        category            TEXT NOT NULL DEFAULT '',
        author              TEXT NOT NULL DEFAULT '',
        framework           TEXT NOT NULL DEFAULT '',
        tags                TEXT NOT NULL DEFAULT '[]',
        github_url          TEXT NOT NULL DEFAULT '',
        content             TEXT NOT NULL DEFAULT '',
        install_count       INTEGER NOT NULL DEFAULT 0,
        featured            INTEGER NOT NULL DEFAULT 0
    )"#,

    // ── mcp_catalog ───────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS mcp_catalog (
        id                  TEXT PRIMARY KEY,
        name                TEXT NOT NULL,
        description         TEXT NOT NULL DEFAULT '',
        author              TEXT NOT NULL DEFAULT '',
        category            TEXT NOT NULL DEFAULT '',
        type                TEXT NOT NULL DEFAULT '',
        url                 TEXT NOT NULL DEFAULT '',
        command             TEXT NOT NULL DEFAULT '',
        args                TEXT NOT NULL DEFAULT '[]',
        env                 TEXT NOT NULL DEFAULT '{}',
        required_env_vars   TEXT NOT NULL DEFAULT '[]',
        github_url          TEXT NOT NULL DEFAULT '',
        content             TEXT NOT NULL DEFAULT '',
        icon_url            TEXT NOT NULL DEFAULT '',
        docs_url            TEXT NOT NULL DEFAULT '',
        install_count       INTEGER NOT NULL DEFAULT 0
    )"#,

    // ── commands_catalog ──────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS commands_catalog (
        id                  TEXT PRIMARY KEY,
        name                TEXT NOT NULL,
        slash               TEXT NOT NULL,
        description         TEXT NOT NULL DEFAULT '',
        author              TEXT NOT NULL DEFAULT '',
        category            TEXT NOT NULL DEFAULT '',
        github_url          TEXT NOT NULL DEFAULT '',
        content             TEXT,
        icon_url            TEXT,
        install_count       INTEGER NOT NULL DEFAULT 0
    )"#,

    // ── hooks_catalog ─────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS hooks_catalog (
        id                  TEXT PRIMARY KEY,
        name                TEXT NOT NULL,
        description         TEXT NOT NULL DEFAULT '',
        author              TEXT NOT NULL DEFAULT '',
        hook_type           TEXT NOT NULL DEFAULT '',
        github_url          TEXT NOT NULL DEFAULT '',
        content             TEXT,
        icon_url            TEXT,
        install_count       INTEGER NOT NULL DEFAULT 0
    )"#,

    // ── connector_catalog ─────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS connector_catalog (
        id                  TEXT PRIMARY KEY,
        name                TEXT NOT NULL,
        description         TEXT NOT NULL DEFAULT '',
        category            TEXT NOT NULL DEFAULT '',
        auth_type           TEXT NOT NULL DEFAULT '',
        oauth_url           TEXT NOT NULL DEFAULT '',
        api_key_fields      TEXT NOT NULL DEFAULT '[]',
        docs_url            TEXT NOT NULL DEFAULT '',
        icon_url            TEXT NOT NULL DEFAULT '',
        scope               TEXT NOT NULL DEFAULT '',
        install_count       INTEGER NOT NULL DEFAULT 0
    )"#,

    // ── project_llm_keys (Project-level LLM API keys) ─────────────────────────
    r#"CREATE TABLE IF NOT EXISTS project_llm_keys (
        project_id          TEXT NOT NULL,
        provider            TEXT NOT NULL,
        credentials_encrypted TEXT,
        base_url            TEXT,
        extra_env           TEXT,
        synced_at           TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (project_id, provider)
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_llm_keys_project ON project_llm_keys (project_id)"#,

    // ── org_llm_keys (Org-level LLM API keys) ─────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS org_llm_keys (
        org_id              TEXT NOT NULL,
        provider            TEXT NOT NULL,
        credentials_encrypted TEXT,
        base_url            TEXT,
        extra_env           TEXT,
        synced_at           TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (org_id, provider)
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_org_llm_keys_org ON org_llm_keys (org_id)"#,

    // ── account_llm_keys (Account-level LLM API keys) ─────────────────────────
    r#"CREATE TABLE IF NOT EXISTS account_llm_keys (
        user_id             TEXT NOT NULL,
        provider            TEXT NOT NULL,
        credentials_encrypted TEXT,
        base_url            TEXT,
        extra_env           TEXT,
        synced_at           TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, provider)
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_account_llm_keys_user ON account_llm_keys (user_id)"#,

    // ── project_connectors (Project-level connectors) ──────────────────────────
    r#"CREATE TABLE IF NOT EXISTS project_connectors (
        project_id          TEXT NOT NULL,
        service             TEXT NOT NULL,
        status              TEXT NOT NULL DEFAULT 'configured',
        credentials_encrypted TEXT,
        synced_at           TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (project_id, service)
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_project_connectors_project ON project_connectors (project_id)"#,

    // ── org_connectors (Org-level connectors) ──────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS org_connectors (
        org_id              TEXT NOT NULL,
        service             TEXT NOT NULL,
        status              TEXT NOT NULL DEFAULT 'configured',
        credentials_encrypted TEXT,
        synced_at           TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (org_id, service)
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_org_connectors_org ON org_connectors (org_id)"#,

    // ── account_connectors (Account-level connectors) ──────────────────────────
    r#"CREATE TABLE IF NOT EXISTS account_connectors (
        user_id             TEXT NOT NULL,
        service             TEXT NOT NULL,
        status              TEXT NOT NULL DEFAULT 'configured',
        credentials_encrypted TEXT,
        synced_at           TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, service)
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_account_connectors_user ON account_connectors (user_id)"#,

    // ── project_org_cache ─────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS project_org_cache (
        project_id          TEXT PRIMARY KEY,
        org_id              TEXT NOT NULL,
        synced_at           TEXT NOT NULL
    )"#,

    // ── userdb (Account-wide UserDB configuration & encrypted credentials) ─────
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

/// Provisions and initializes all canonical local SQLite tables and indexes.
pub fn provision_local_database(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA foreign_keys = ON;").map_err(|e| e.to_string())?;

    // Pre-migrations: add new columns to pre-existing tables on disk before executing schema indexes
    let _ = conn.execute("ALTER TABLE session_history ADD COLUMN project_id TEXT", []);
    let _ = conn.execute("ALTER TABLE chat_sessions ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE", []);
    let _ = conn.execute("ALTER TABLE plugins ADD COLUMN mcp_url TEXT NOT NULL DEFAULT '[]'", []);
    let _ = conn.execute("ALTER TABLE plugins ADD COLUMN synced_at TEXT NOT NULL DEFAULT (datetime('now'))", []);
    let _ = conn.execute("ALTER TABLE plugins ADD COLUMN rules_url TEXT NOT NULL DEFAULT '[]'", []);
    let _ = conn.execute("ALTER TABLE plugins ADD COLUMN rule_ids TEXT NOT NULL DEFAULT '[]'", []);
    let _ = conn.execute("ALTER TABLE plugins ADD COLUMN connector_auth TEXT NOT NULL DEFAULT '[]'", []);
    let _ = conn.execute("ALTER TABLE plugins ADD COLUMN agents_url TEXT NOT NULL DEFAULT '[]'", []);

    // 1. Create all canonical tables and indexes
    for stmt in LOCAL_SCHEMA_STATEMENTS {
        conn.execute_batch(stmt)
            .map_err(|e| format!("Schema init error for statement: {}\nErr: {}", stmt, e))?;
    }

    // 2. Initialize default organization if not exists
    let _ = conn.execute(
        "INSERT INTO organizations (id, name)
         SELECT 1, 'Personal'
         WHERE NOT EXISTS (SELECT 1 FROM organizations);",
        [],
    );

    // 4. Drop all deprecated cache / legacy tables
    let obsolete_tables = [
        "project_session_history",
        "project_chat_sessions",
        "connectors_cache",
        "connectors",
        "llm_keys_cache",
        "llm_keys",
        "skill_catalog_cache",
        "skills_catalog",
        "installed_plugins_cache",
        "plugins_cache",
        "plugins_catalog",
        "mcp_catalog_cache",
        "commands_catalog_cache",
        "hooks_catalog_cache",
        "connector_catalog_cache",
        "connectors_catalog",
        "memory_entries",
        "memory_index_cache",
        "org_memory_cache",
        "wiki_pages",
        "wiki_index_cache",
        "org_skill_cache",
        "skill_index_cache",
        "project_sessions_log",
        "org_sessions_log",
    ];
    for tbl in obsolete_tables {
        let _ = conn.execute(&format!("DROP TABLE IF EXISTS \"{}\"", tbl), []);
    }

    Ok(())
}

#[allow(dead_code)]
/// Returns the canonical list of table names expected in the local database.
pub fn get_canonical_table_names() -> &'static [&'static str] {
    &[
        "workspaces",
        "organizations",
        "jobs",
        "session_history",
        "settings",
        "cloud_identity",
        "inbox",
        "chat_messages",
        "chat_threads",
        "chat_sessions",
        "agents",
        "project_agents",
        "project_session_logs",
        "org_session_logs",
        "session_logs",
        "project_skills",
        "org_skills",
        "skills",
        "skill_catalog",
        "project_memory",
        "org_memory",
        "memory",
        "project_wiki",
        "org_wiki",
        "wiki",
        "project_context",
        "org_context",
        "context",
        "usage_events",
        "project_usage",
        "org_usage",
        "account_usage",
        "user_usage",
        "model_pricing_cache",
        "installed_plugins",
        "plugins",
        "rules_catalog",
        "mcp_catalog",
        "commands_catalog",
        "hooks_catalog",
        "connector_catalog",
        "project_llm_keys",
        "org_llm_keys",
        "account_llm_keys",
        "project_connectors",
        "org_connectors",
        "account_connectors",
        "project_org_cache",
        "userdb",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_provision_fresh_database() {
        let conn = Connection::open_in_memory().unwrap();
        assert!(provision_local_database(&conn).is_ok());

        // Verify default organization exists
        let org_name: String = conn
            .query_row("SELECT name FROM organizations WHERE id = 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(org_name, "Personal");
    }

    #[test]
    fn test_drop_legacy_cache_tables() {
        let conn = Connection::open_in_memory().unwrap();

        // Create legacy connectors_cache and llm_keys_cache tables
        conn.execute_batch(r#"
            CREATE TABLE connectors_cache (id TEXT);
            CREATE TABLE llm_keys_cache (id TEXT);
            CREATE TABLE skill_catalog_cache (id TEXT);
        "#).unwrap();

        // Run provision_local_database
        assert!(provision_local_database(&conn).is_ok());

        // Verify old cache tables are dropped
        assert!(conn.prepare("SELECT 1 FROM connectors_cache").is_err());
        assert!(conn.prepare("SELECT 1 FROM llm_keys_cache").is_err());
        assert!(conn.prepare("SELECT 1 FROM skill_catalog_cache").is_err());
    }

    #[test]
    fn test_verify_all_canonical_tables_and_columns() {
        let conn = Connection::open_in_memory().unwrap();
        assert!(provision_local_database(&conn).is_ok());

        let canonical_tables = get_canonical_table_names();
        assert_eq!(canonical_tables.len(), 49);

        // Verify every canonical table exists in sqlite_master
        for table in canonical_tables {
            let exists: bool = conn.query_row(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table],
                |_| Ok(true),
            ).unwrap_or(false);
            assert!(exists, "Canonical table '{}' is missing from SQLite schema!", table);

            // Verify table has at least 1 column and is readable
            let stmt = conn.prepare(&format!("SELECT * FROM \"{}\" LIMIT 0", table)).unwrap();
            assert!(!stmt.column_names().is_empty(), "Table '{}' has no columns!", table);
        }

        // Verify NO obsolete cache tables exist
        let obsolete = [
            "project_session_history",
            "project_chat_sessions",
            "connectors_cache",
            "llm_keys_cache",
            "skill_catalog_cache",
            "skills_catalog",
            "installed_plugins_cache",
            "plugins_cache",
            "plugins_catalog",
            "mcp_catalog_cache",
            "commands_catalog_cache",
            "hooks_catalog_cache",
            "connector_catalog_cache",
            "connectors_catalog",
            "memory_entries",
            "memory_index_cache",
            "org_memory_cache",
            "wiki_pages",
            "wiki_index_cache",
            "org_skill_cache",
            "skill_index_cache",
            "project_sessions_log",
            "org_sessions_log",
        ];
        for obs in obsolete {
            let exists: bool = conn.query_row(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [obs],
                |_| Ok(true),
            ).unwrap_or(false);
            assert!(!exists, "Obsolete table '{}' should have been dropped!", obs);
        }

        // Verify 3-tier credentials columns
        let mut prj_cols = conn.prepare("PRAGMA table_info(project_connectors)").unwrap();
        let col_names: Vec<String> = prj_cols.query_map([], |r| r.get(1)).unwrap().filter_map(|r| r.ok()).collect();
        assert!(col_names.contains(&"project_id".to_string()));
        assert!(col_names.contains(&"service".to_string()));
        assert!(col_names.contains(&"credentials_encrypted".to_string()));

        let mut acc_cols = conn.prepare("PRAGMA table_info(account_llm_keys)").unwrap();
        let col_names: Vec<String> = acc_cols.query_map([], |r| r.get(1)).unwrap().filter_map(|r| r.ok()).collect();
        assert!(col_names.contains(&"user_id".to_string()));
        assert!(col_names.contains(&"provider".to_string()));
        assert!(col_names.contains(&"credentials_encrypted".to_string()));

        let mut userdb_cols = conn.prepare("PRAGMA table_info(userdb)").unwrap();
        let col_names: Vec<String> = userdb_cols.query_map([], |r| r.get(1)).unwrap().filter_map(|r| r.ok()).collect();
        assert!(col_names.contains(&"user_id".to_string()));
        assert!(col_names.contains(&"url".to_string()));
        assert!(col_names.contains(&"token_encrypted".to_string()));
        assert!(col_names.contains(&"off_platform".to_string()));
    }
}

